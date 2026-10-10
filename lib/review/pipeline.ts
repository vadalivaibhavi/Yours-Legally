/**
 * Review pipeline (PRD §9.3): F2 extract → gate rules → route (NDA fast lane | full review)
 * → F3 conflict check → F4 playbook / mirror / flow-down (or NDA mutuality) → F5 bundle + notes
 * → verdict by rule → F6 brief text from structured findings only → FR-22 similar clauses attached
 * last, as reference. Hybrid gate (FR-17): gate failures never stop the deep review while the main
 * text is present. A failed step never returns "clean": it is recorded in errors and "what wasn't seen".
 */
import { z } from "zod";
import { appToday } from "../config";
import { company as loadCompany, playbook as loadPlaybook, requiredDocs } from "../data";
import { allDeals, allDocuments, allNotes, briefVersions, getDeal, latestBrief } from "../deals";
import { expandRegions } from "../geo";
import { callModel, currentUsage, hash, modelsFor, PROMPT_VERSION, providerTag, withUsage } from "../llm";
import { registerCoverage, registerEntries, registerVersion } from "../register";
import { latestSellerCheck } from "../sellerChecks";
import { OWNER } from "./owners";
import type { Deal, Document } from "../types";
import { checkBundle } from "./bundle";
import { checkConflicts, filterRegister, reverseScan } from "./conflict";
import { extractDocument, type Extraction } from "./extract";
import { runGate } from "./gate";
import { coverageNote, hasLegalConclusion, sanitize, sanitizeFinding } from "./guardrails";
import { scanNotes } from "./notes";
import { checkNda, checkPlaybook, ruleFor } from "./playbook";
import { similarPanels } from "./similar";
import { SEVERITY_RANK, type Brief, type Citation, type DocumentReview, type FactField, type Finding, type GateResult, type SimilarPanel } from "./types";
import { computeVerdict, sortFindings, templateHeadline } from "./verdict";

export type ReviewOptions = {
  trigger: string;
  version: number;
  /** Replace a deal document with a new text version (revised draft). */
  replace?: Record<string, Document>;
  /** Add documents (input added → re-check). */
  add?: Document[];
  /** Skip the similar-clauses panel (eval: verdict must be identical with and without it). */
  withoutSimilar?: boolean;
  log?: (msg: string) => void;
};

/** Each review gets its own usage scope, so deals can be reviewed in parallel (token counts stay per deal). */
export async function reviewDeal(dealId: string, opts: ReviewOptions): Promise<Brief> {
  const { result } = await withUsage(() => runReview(dealId, opts));
  return result;
}

async function runReview(dealId: string, opts: ReviewOptions): Promise<Brief> {
  const t0 = Date.now();
  const log = opts.log ?? (() => {});
  const deal = getDeal(dealId);
  if (!deal) throw new Error(`Unknown deal ${dealId}`);
  const everyDoc = allDocuments();
  const byId = new Map(everyDoc.map((d) => [d.id, d]));
  let docs = deal.documentIds.map((id) => opts.replace?.[id] ?? byId.get(id)).filter((d): d is Document => !!d);
  if (opts.add) docs = [...docs, ...opts.add];
  for (const d of opts.add ?? []) byId.set(d.id, d);
  const contextDocs = deal.contextDocumentIds.map((id) => byId.get(id)).filter((d): d is Document => !!d);
  const notes = allNotes().filter((n) => deal.noteIds.includes(n.id));
  const company = loadCompany();
  const pb = loadPlaybook();
  const register = registerEntries();
  const deals = allDeals();
  const endClient = deal.endClientDealId ? deals.find((d) => d.id === deal.endClientDealId) : null;
  const endClientDocs = endClient ? endClient.documentIds.map((id) => byId.get(id)).filter((d): d is Document => !!d) : [];
  const sourceTexts = new Map(everyDoc.filter((d) => d.kind === "signed").map((d) => [d.id, d.text]));
  const errors: string[] = [];
  const notSeen: string[] = [];
  const fine: string[] = [];
  let findings: Finding[] = [];
  const similar: SimilarPanel[] = [];
  const reviews: DocumentReview[] = [];
  const extractions = new Map<string, Extraction>();
  const gates = new Map<string, GateResult[]>();
  const gatePasses: GateResult[] = [];

  // ---- F2: extraction per document (fast model), in parallel
  log(`extracting ${docs.length} document(s)`);
  const ex = await Promise.all(docs.map((d) => extractDocument(d)));
  docs.forEach((d, i) => {
    const r = ex[i];
    if (r.ok) extractions.set(d.id, r.data);
    else {
      errors.push(`${d.title}: extraction couldn't complete: review manually (${r.error.slice(0, 120)})`);
      notSeen.push(`${d.title}: not reviewed (extraction failed). Review manually.`);
    }
  });

  // ---- per document: gate → route → deep review (hybrid gate: deep review runs whenever text is present)
  await Promise.all(
    docs.map(async (doc) => {
      const x = extractions.get(doc.id);
      if (!x) return;
      const route = doc.docType === "NDA" ? "nda_fast_lane" : "full_review";
      const gate = runGate({
        doc,
        x,
        deal,
        company,
        dealTexts: [...docs, ...contextDocs].map((d) => ({ id: d.id, title: d.title, text: d.text })),
        endClientCountry: endClient?.clientCountry ?? null,
      });
      gates.set(doc.id, gate.results);
      findings.push(...gate.findings);
      notSeen.push(...gate.notSeen);
      gatePasses.push(...gate.results.filter((g) => g.pass === true && !g.rule.startsWith("annex:")));
      reviews.push({ docId: doc.id, title: doc.title, docType: doc.docType, paper: doc.paper, route, facts: factsCard(x), gate: gate.results, errors: [] });

      if (doc.text.trim().length < 400) {
        notSeen.push(`${doc.title}: main text missing or unreadable: fine-print checks will run once it is provided.`);
        return;
      }

      const named = x.atliqEntityNamed.value ?? doc.atliqEntity;
      const entities = [...new Set([named, gate.results.find((g) => g.rule === "entity" && g.pass === false) ? (named === "Inc" ? "Pvt Ltd" : "Inc") : null].filter(Boolean))] as string[];
      const facts = {
        entities,
        sectors: x.sectors,
        // AtliQ delivers from Pune for every client, so "India" in a non-Indian services deal is the
        // delivery location, not the market served (restrictions reach where services are received).
        regions: [...x.regions.filter((r) => !(r === "India" && doc.docType !== "Partnership" && deal.clientCountry && deal.clientCountry !== "India")), ...(deal.clientCountry ? [deal.clientCountry] : [])],
        assets: x.assets,
        hasRates: x.rates.length > 0 && doc.sideOfTable === "supplier",
        services: x.services,
        partnership: doc.docType === "Partnership",
      };
      // Register collisions only where AtliQ would provide services (not NDAs, not AtliQ buying from a vendor).
      const candidates = route === "full_review" && (doc.sideOfTable === "supplier" || doc.sideOfTable === "partner") ? filterRegister(register, facts, sourceTexts) : [];
      const reverse = reverseScan(x, company, deal.counterparty);
      log(`${doc.id}: ${route}; register candidates: ${candidates.map((c) => c.entry.id).join(", ") || "none"}; covenant scan: ${reverse.length}`);

      const tasks: Promise<void>[] = [];
      tasks.push(
        checkConflicts({ doc, x, deal, candidates, reverse, documents: byId }).then((r) => {
          findings.push(...r.findings);
          fine.push(...r.checked);
          if (r.error) errors.push(r.error);
          if (!candidates.length && route === "full_review" && doc.sideOfTable !== "buyer") fine.push(`No live AtliQ commitment covers this ${x.sectors.join("/") || "sector"} work in ${x.regions.join(", ") || deal.clientCountry}`);
        }),
      );
      if (route === "nda_fast_lane") {
        tasks.push(
          checkNda({ doc, deal, rules: pb.rules }).then((r) => {
            findings.push(...r.findings);
            fine.push(...r.fine);
            if (r.error) errors.push(r.error);
          }),
        );
      } else {
        const master = doc.docType === "SOW" ? (contextDocs.find((d) => d.docType === "MSA") ?? null) : null;
        tasks.push(
          checkPlaybook({ doc, deal, rules: pb.rules, gate: gate.results, linkedClient: endClient && doc.paper === "atliq" ? { deal: endClient, docs: endClientDocs } : null, masterAgreement: master }).then((r) => {
            findings.push(...r.findings);
            fine.push(...r.fine);
            if (r.error) errors.push(r.error);
          }),
        );
      }
      if (!opts.withoutSimilar)
        tasks.push(
          similarPanels(doc).then((r) => {
            similar.push(...r.panels);
            if (r.error) notSeen.push(r.error); // reference only: never blocks the verdict
          }),
        );
      await Promise.all(tasks);
    }),
  );

  // ---- F5: bundle + notes (deal level)
  const bundle = checkBundle({ deal, docs, contextDocs, allDocs: everyDoc, allDeals: deals, extractions, gates, register, rules: requiredDocs().rules, company });
  findings.push(...bundle.findings);
  const notesRes = await scanNotes({ deal, notes, bundle: bundle.rows });
  if (notesRes.error) errors.push(notesRes.error);
  // A compliance event is owned (and pinned) on the client deal. On AtliQ's own paper for a vendor or
  // contractor staffing that deal, the same note is context: it never raises a second alert.
  if (endClient && docs.every((d) => d.paper === "atliq" && d.sideOfTable !== "supplier") && notesRes.candidate) {
    notesRes.candidate = null;
    notesRes.findings = notesRes.findings.filter((f) => f.category !== "notes");
    notesRes.facts = notesRes.facts.map((f) => (f.complianceEvent ? { ...f, complianceEvent: false, whyItMatters: `${f.whyItMatters} Tracked as a compliance alert on ${endClient.name}.` } : f));
  }
  findings.push(...notesRes.findings);
  const candidate = notesRes.candidate;
  if (candidate) {
    // Pin the commitments that make it a compliance event (e.g. Harrington NDA §2.3: PHI only after a BAA).
    const cp = deal.counterparty.split(" ")[0].toLowerCase();
    for (const e of register.filter((e) => (e.type === "compliance" || e.type === "data_location") && e.counterparty.toLowerCase().includes(cp)))
      candidate.citations.push({ docId: e.sourceDocId, docTitle: byId.get(e.sourceDocId)?.title ?? e.counterparty, clauseRef: e.clauseRef, quote: e.quote, role: "register" });
  }
  if (!notes.length) notSeen.push("No meeting notes attached to this deal.");

  // ---- dependency on the end-client deal (AtliQ paper staffing a client deal)
  if (endClient) {
    const eb = latestBrief(endClient.id);
    if (eb && eb.verdict !== "SIGN" && endClient.status !== "signed")
      findings.push({
        key: `dependency:${endClient.id}`,
        category: "dependency",
        topic: "dependency",
        title: `Depends on ${endClient.name}, which is not signed (latest verdict ${eb.verdict})`,
        impact: `Sending this commits AtliQ to a vendor/contractor before the client contract it serves is resolved. ${eb.headline}.`,
        severity: "high",
        confidence: "high",
        needsJudgment: false,
        owner: "Karandeep",
        resolution: "business_fix",
        citations: [],
      });
  }

  // ---- FR-20 deal-facts mismatch vs the seller's own deal check
  const sc = latestSellerCheck(deal.id);
  if (sc) {
    const declared = expandRegions(sc.input.regions);
    const inContract = new Set([...extractions.values()].flatMap((x) => [...expandRegions(x.regions)]));
    const extra = [...inContract].filter((r) => !declared.has(r) && r !== "Worldwide" && r !== "Other");
    if (extra.length)
      findings.push({
        key: "mismatch:regions",
        category: "mismatch",
        topic: "regions",
        title: `Contract covers ${extra.join(", ")}: not in ${sc.by}'s deal check (declared: ${sc.input.regions.join(", ")})`,
        impact: `${sc.by}'s check on ${sc.asOf} was answered for ${sc.input.regions.join(", ")} only, so the commitments covering ${extra.join(", ")} were never checked for the seller.`,
        severity: "medium",
        confidence: "high",
        needsJudgment: false,
        owner: OWNER.seller,
        resolution: "confirm",
        citations: [],
      });
  }

  // ---- merge, guardrails, AtliQ-paper cap, precedents
  findings = mergeFindings(findings).map((f) => {
    const doc = f.docId ? byId.get(f.docId) : undefined;
    let g = sanitizeFinding({ ...f, citations: dedupeCitations(f.citations) });
    if (doc?.paper === "atliq" && doc.sideOfTable === "buyer" && g.severity === "blocker") g = { ...g, severity: "high", resolution: "fix_before_sending" };
    if (!g.precedents && (g.category === "playbook" || g.category === "flowdown")) g.precedents = ruleFor(pb.rules, g.topic, doc?.paper === "atliq")?.precedents;
    return g;
  });
  findings = sortFindings(findings);
  // "What's fine" never contradicts a finding on the same topic (e.g. LD capped but above the standard).
  const RULE_TOPIC: Record<string, string> = { ld_cap: "playbook:ld", liability_cap: "playbook:liability", payment: "playbook:payment", governing_law: "gate:governing_law" };
  const keys = new Set(findings.map((f) => f.key));
  fine.unshift(...gatePasses.filter((g) => !keys.has(RULE_TOPIC[g.rule] ?? "-")).map((g) => `${g.label}: ${g.detail}`));

  // ---- verdict by rule (similar clauses are not an input)
  const waitingFor = findings.filter((f) => f.missingItem).map((f) => f.missingItem!);
  if (candidate) waitingFor.push({ item: `Confirm from deal notes: ${candidate.title}`, owner: "Karandeep" });
  for (const e of errors) waitingFor.push({ item: `Review manually: ${e.split(" (")[0]}`, owner: "Karandeep" });
  const verdict = computeVerdict({ findings, complianceAlertOpen: false, waitingFor });

  // ---- F6: headline + next action written from the structured findings only
  const text = await briefText({ deal, verdict, findings, waitingFor, hasCandidate: !!candidate });

  // ---- what wasn't seen
  for (const x of extractions.values()) {
    for (const ref of x.crossReferences) {
      const known = everyDoc.some((d) => d.references.some((r) => ref.reference.includes(r)) || ref.reference.toLowerCase().includes(d.counterparty.toLowerCase().split(" ")[0]));
      if (!known && !/this agreement/i.test(ref.description)) notSeen.push(`Referenced but not on file: ${ref.reference} (${ref.description})`);
    }
  }
  const cov = registerCoverage();
  notSeen.push(coverageNote(cov.length));
  for (const e of errors) notSeen.push(e);

  // ---- counsel pack (tier 4)
  const counsel = findings.filter((f) => /counsel/i.test(f.owner));
  const counselPack = counsel.length
    ? {
        question: counsel.map((f) => (f.readings?.length ? `${f.title}: which reading applies? (a) ${f.readings[0]} (b) ${f.readings[1] ?? ""}` : `${f.title}: does this commitment reach the new deal, and what is needed to proceed?`)).join("\n"),
        documents: [...new Set([...docs.map((d) => d.title), ...counsel.flatMap((f) => f.citations.map((c) => c.docTitle))])],
        clauses: counsel.flatMap((f) => f.citations),
        entityFacts: company.entities.map((e) => `${e.name} (${e.country}): serves ${e.servesRegions.join(", ")}`).concat(company.deliveryModel),
      }
    : null;

  const usage = currentUsage();
  return {
    dealId: deal.id,
    version: opts.version,
    createdAt: new Date().toISOString(),
    trigger: opts.trigger,
    inputsHash: inputsHash(
      docs.map((d) => d.text),
      notes.map((n) => n.text),
      pb.version,
      endClient ? (latestBrief(endClient.id)?.verdict ?? "none") : null,
    ),
    documentIds: docs.map((d) => d.id),
    registerVersion: registerVersion(),
    playbookVersion: pb.version,
    models: [...new Set(usage.map((u) => u.model))].length ? [...new Set(usage.map((u) => u.model))] : [...modelsFor("extract"), ...modelsFor("conflict")],
    promptVersion: PROMPT_VERSION,
    route: docs.every((d) => d.docType === "NDA") ? "nda_fast_lane" : "full_review",
    verdict,
    headline: text.headline,
    nextAction: text.nextAction,
    findings,
    fine: [...new Set(fine)].slice(0, 14),
    notSeen: [...new Set(notSeen)],
    documents: reviews.sort((a, b) => docs.findIndex((d) => d.id === a.docId) - docs.findIndex((d) => d.id === b.docId)),
    bundle: bundle.rows,
    notesFacts: notesRes.facts,
    complianceCandidate: candidate,
    similar,
    counselPack,
    errors,
    usage: {
      calls: usage.filter((u) => !u.cached).length,
      cachedCalls: usage.filter((u) => u.cached).length,
      inputTokens: usage.reduce((s, u) => s + u.usage.inputTokens, 0),
      outputTokens: usage.reduce((s, u) => s + u.usage.outputTokens, 0),
      ms: Date.now() - t0,
    },
  };
}

/** Drop a citation already contained in another citation from the same document (fragments of one clause). */
function dedupeCitations(cites: Citation[]): Citation[] {
  const norm = (q: string) => q.toLowerCase().replace(/\*+/g, "").replace(/\s+/g, " ").trim();
  const parts = (q: string) => norm(q).split(/\s*…\s*/).filter(Boolean);
  return cites.filter((c, i) => {
    const mine = parts(c.quote);
    return !cites.some((o, j) => j !== i && o.docId === c.docId && (norm(o.quote).length > norm(c.quote).length || (norm(o.quote) === norm(c.quote) && j < i)) && mine.every((p) => norm(o.quote).includes(p)));
  });
}

/** One finding per key: max severity, union of citations, richer model-written text wins. */
function mergeFindings(input: Finding[]): Finding[] {
  // The deterministic insurance gate owns insurance findings; the playbook's view folds into it.
  const insuranceGate = input.find((f) => f.key.startsWith("gate:insurance:"))?.key;
  // Only citations that are actually about insurance come along (the model sometimes quotes a neighbouring clause).
  const list = insuranceGate
    ? input.map((f) => (f.key === "playbook:insurance" ? { ...f, key: insuranceGate, category: "gate" as const, citations: f.citations.filter((c) => /insur|coverage|policy|additional insured/i.test(c.quote)) } : f))
    : input;
  const out = new Map<string, Finding>();
  for (const f of list) {
    const prev = out.get(f.key);
    if (!prev) {
      out.set(f.key, { ...f, citations: [...f.citations] });
      continue;
    }
    const keepText = prev.category === "gate" || prev.title.length < f.title.length ? f : prev;
    const cites: Citation[] = [...prev.citations];
    for (const c of f.citations) if (!cites.some((x) => x.docId === c.docId && x.quote === c.quote)) cites.push(c);
    out.set(f.key, {
      ...prev,
      ...keepText,
      severity: SEVERITY_RANK[f.severity] > SEVERITY_RANK[prev.severity] ? f.severity : prev.severity,
      citations: cites,
      precedents: prev.precedents ?? f.precedents,
      missingItem: prev.missingItem ?? f.missingItem,
    });
  }
  return [...out.values()];
}

function factsCard(x: Extraction): FactField[] {
  const f = (field: string, label: string, value: string | null | undefined, src?: { clauseRef: string | null; quote: string | null }): FactField => ({
    field,
    label,
    value: value ?? "Not stated",
    clauseRef: src?.clauseRef ?? undefined,
    quote: src?.quote ?? undefined,
  });
  const ld = x.ld.present
    ? `${x.ld.ratePct ?? "?"}% of ${x.ld.base ?? "?"} per ${x.ld.period ?? "?"}, ${x.ld.capPct === null ? "uncapped" : `cap ${x.ld.capPct}% of ${x.ld.capBase ?? "?"}`}${x.ld.clientDelayExcluded === false ? ", no client-delay exclusion" : x.ld.clientDelayExcluded ? ", client delays excluded" : ""}`
    : "None";
  return [
    f("docType", "Document type", x.docType),
    f("parties", "Counterparty", `${x.counterparty}${x.counterpartyCountry ? ` (${x.counterpartyCountry})` : ""}`),
    f("entity", "AtliQ entity (parties)", x.atliqEntityNamed.value, x.atliqEntityNamed),
    f("invoicing", "AtliQ entity (invoicing)", x.invoicingEntity.value ?? "Not named separately", x.invoicingEntity),
    f("law", "Governing law", x.governingLaw.value, x.governingLaw),
    f("forum", "Forum", x.forum.value, x.forum),
    f("payment", "Payment", x.payment.payWhenPaid ? `Pay-when-paid${x.payment.days ? `, up to ${x.payment.days} days` : ""}` : x.payment.days ? `${x.payment.days} days` : null, x.payment),
    f("ld", "Delay penalties", ld, x.ld),
    f("liability", "Liability", x.liability.atliqCapped === false ? "Unlimited" : (x.liability.capText ?? null) + (x.liability.uncappedFor.length ? ` · uncapped for ${x.liability.uncappedFor.join(", ")}` : ""), x.liability),
    f("insurance", "Insurance required", x.insurance.length ? x.insurance.map((i) => `${i.type.replace(/_/g, " ")} ${i.amountUsd ? "$" + (i.amountUsd / 1e6).toFixed(1).replace(".0", "") + "M" : ""}`).join(", ") : "None"),
    f("annexes", "Annexes referenced", x.annexes.map((a) => a.name).join(", ") || "None"),
    f("scope", "Sectors · regions", `${x.sectors.join(", ")} · ${x.regions.join(", ")}`),
    f("data", "Data handled", x.dataTypes.join(", ") || "none"),
    ...(x.rates.length ? [f("rates", "Rates", x.rates.map((r) => `${r.role} $${r.ratePerHourUsd}/hr`).join(", "))] : []),
    ...(x.assets.length ? [f("assets", "Tools / IP reused", x.assets.join(", "))] : []),
  ];
}

const BriefText = z.object({
  headline: z.string().describe("≤ 14 words, starts with the verdict, e.g. 'HOLD: 1 blocker, 1 missing document'"),
  nextAction: z.string().describe("One sentence: the next concrete step and who takes it"),
});

async function briefText(a: { deal: Deal; verdict: string; findings: Finding[]; waitingFor: { item: string; owner: string }[]; hasCandidate: boolean }) {
  const fallback = {
    headline: templateHeadline(a.verdict as never, a.findings, a.waitingFor, false),
    nextAction: a.findings[0] ? `${a.findings[0].owner}: ${a.findings[0].counterPosition ?? a.findings[0].title}` : "Sign when ready.",
  };
  const input = JSON.stringify({
    today: appToday(),
    deal: a.deal.name,
    deadline: a.deal.deadline ?? null,
    verdict: a.verdict,
    complianceEventToConfirm: a.hasCandidate,
    waitingFor: a.waitingFor,
    findings: a.findings.filter((f) => f.severity !== "ok").slice(0, 12).map((f) => ({ severity: f.severity, title: f.title, owner: f.owner, resolution: f.resolution, needsJudgment: f.needsJudgment })),
  });
  const r = await callModel({
    task: "brief",
    system:
      "Write the top line of a contract decision brief from these structured findings ONLY. The verdict is fixed: start the headline with it exactly. Never recommend 'Reject'. Never say breach/enforceable. Recommend only: comply, renegotiate, seek consent/waiver, business fix, counsel. Nothing is sent by the system: the next action is something a named person does.",
    input,
    schema: BriefText,
  });
  if (!r.ok || !r.data.headline.toUpperCase().startsWith(a.verdict) || hasLegalConclusion(r.data.headline + r.data.nextAction) || /\breject\b/i.test(r.data.nextAction)) return fallback;
  return { headline: sanitize(r.data.headline), nextAction: sanitize(r.data.nextAction) };
}

export function nextVersion(dealId: string): number {
  const v = briefVersions(dealId);
  return v.length ? v[v.length - 1].version + 1 : 1;
}

/** Everything a brief depends on: prompts, register, playbook, document and note texts, and for AtliQ paper the client deal verdict. */
function inputsHash(docTexts: string[], noteTexts: string[], playbookVersion: string, endClientVerdict: string | null): string {
  // The end-client part is appended only when present, so briefs hashed before it existed still match.
  return hash([PROMPT_VERSION, ...providerTag(), registerVersion(), playbookVersion, ...docTexts, ...noteTexts, ...(endClientVerdict ? [`endclient:${endClientVerdict}`] : [])].join("|"));
}

/** Current input hash for a deal (resumable runs: a complete brief with the same hash needs no re-run). */
export function currentInputsHash(dealId: string): string | null {
  const deal = getDeal(dealId);
  if (!deal) return null;
  const docs = allDocuments();
  const texts = deal.documentIds.map((id) => docs.find((d) => d.id === id)?.text ?? "");
  const noteTexts = allNotes()
    .filter((n) => deal.noteIds.includes(n.id))
    .map((n) => n.text);
  const endClientVerdict = deal.endClientDealId ? (latestBrief(deal.endClientDealId)?.verdict ?? "none") : null;
  return inputsHash(texts, noteTexts, loadPlaybook().version, endClientVerdict);
}

/**
 * F3 cross-contract conflict check (FR-6).
 * Step 1 (code): STRUCTURED FILTER over register fields: type, bound entity (incl. affiliates),
 *   sector, region, assets, live/expired. Never similarity search: a relevant entry ranked just
 *   outside the top results would be dropped silently (PRD §5). Expired entries are never candidates.
 * Step 2 (code): reverse covenant scan: restrictions THIS contract would impose vs AtliQ's live and
 *   pipeline clients (FinServe §8.1 vs Trustline / PayTrack / FinEdge).
 * Step 3 (strong model): reasoning over definitions and scope for the filtered candidates only.
 * Output never asserts a legal conclusion; interpretive questions are labelled "needs judgment".
 */
import { z } from "zod";
import { appToday } from "../config";
import { intersectRegions, regionsOverlap } from "../geo";
import { callModel } from "../llm";
import { locateQuote } from "../quotes";
import type { Company, Deal, Document, RegisterEntry } from "../types";
import type { Extraction } from "./extract";
import type { Citation, Finding } from "./types";

const RESTRICTIVE = new Set(["non_compete", "exclusivity", "mfn_pricing", "ip_transfer", "ip_retention"]);

export type Candidate = { entry: RegisterEntry; why: string };

/** Step 1: exact, explainable field filter. Exported for evals and the seller check. */
export function filterRegister(
  entries: RegisterEntry[],
  facts: { entities: string[]; sectors: string[]; regions: string[]; assets: string[]; hasRates: boolean; services: string[]; partnership?: boolean },
  sourceTexts: Map<string, string>,
): Candidate[] {
  const out: Candidate[] = [];
  for (const e of entries) {
    if (e.rejected || e.routine || e.status === "expired" || !RESTRICTIVE.has(e.type)) continue;
    if (!e.bindsEntities.some((b) => facts.entities.includes(b))) continue;
    const sectorHit = e.scope.sectors.length === 0 || e.scope.sectors.some((s) => facts.sectors.includes(s));
    const regionHit = e.scope.regions.length === 0 || regionsOverlap(e.scope.regions, facts.regions);
    if (e.type === "non_compete" && sectorHit && regionHit) {
      out.push({ entry: e, why: `sector ${e.scope.sectors.filter((s) => facts.sectors.includes(s)).join("/") || "any"} · region ${intersectRegions(e.scope.regions, facts.regions).join(", ") || "any"}` });
    } else if (e.type === "exclusivity" && regionHit && facts.partnership) {
      out.push({ entry: e, why: `partnership/exclusivity scope · region ${intersectRegions(e.scope.regions, facts.regions).join(", ")}` });
    } else if (e.type === "mfn_pricing" && facts.hasRates) {
      out.push({ entry: e, why: "rates offered while a most-favoured pricing promise is live (any customer, any region)" });
    } else if (e.type === "ip_transfer" || e.type === "ip_retention") {
      const src = (sourceTexts.get(e.sourceDocId) ?? "").toLowerCase();
      const hit = facts.assets.find((a) => a.length > 2 && (src.includes(a.toLowerCase()) || e.scope.assets.some((x) => x.toLowerCase().includes(a.toLowerCase()))));
      if (hit) out.push({ entry: e, why: `asset "${hit}" appears in ${e.counterparty}'s signed contract` });
    }
  }
  return out;
}

/** Step 2: restrictions this contract imposes, matched against live/pipeline clients by sector + region. */
export function reverseScan(x: Extraction, company: Company, dealCounterparty: string) {
  const res: { restriction: Extraction["restrictionsOnAtliq"][number]; clients: Company["clients"] }[] = [];
  for (const r of x.restrictionsOnAtliq) {
    if (r.type === "non_solicit") continue;
    const clients = company.clients.filter(
      (c) =>
        !/ended|completed|expired/i.test(c.status) &&
        !c.name.toLowerCase().includes(dealCounterparty.toLowerCase().split(" ")[0]) &&
        c.sectors.some((s) => r.sectors.includes(s)) &&
        (r.regions.length === 0 || regionsOverlap(r.regions, c.regions)),
    );
    if (clients.length) res.push({ restriction: r, clients });
  }
  return res;
}

const Assessment = z.object({
  entries: z.array(
    z.object({
      entryId: z.string(),
      applies: z.enum(["yes", "arguable", "no"]).describe("yes = the plain reading of the commitment covers this deal; arguable = covered only under one reading of an ambiguous definition; no = it doesn't reach this deal"),
      reasoning: z.string().describe("Short, factual: which definitions/scope words reach (or don't reach) this deal. No legal conclusions."),
      readings: z.array(z.string()).describe("For 'arguable': the two readings, one sentence each"),
      incomingClauses: z.array(z.object({ clauseRef: z.string(), quote: z.string().describe("VERBATIM from the NEW contract") })).describe("Clauses of the new contract that collide, INCLUDING any warranty that AtliQ is not bound by restrictions (signing would make it untrue)"),
      severable: z.boolean().describe("true if only a separable part of the deal collides (e.g. 3 of 12 properties) and carving it out removes the collision"),
      suggestedChange: z.string().nullable(),
      waiverApplies: z.boolean().nullable().describe("If the entry has waivers: does any waiver cover this deal?"),
      waiverWhy: z.string().nullable(),
      resolution: z.enum(["waiver", "redline", "counsel", "business_fix"]),
      impact: z.string().describe("One plain-English sentence on the business impact, e.g. 'collides with the Al Noor promise, live until Sep 2029'"),
    }),
  ),
  covenants: z.array(
    z.object({
      clauseRef: z.string(),
      applies: z.enum(["yes", "arguable", "no"]),
      clientsAffected: z.array(z.string()),
      quote: z.string().describe("VERBATIM restriction text from the new contract"),
      impact: z.string(),
    }),
  ),
});

const SYSTEM = `You check whether a NEW contract collides with commitments AtliQ has ALREADY made (its obligations register), and whether restrictions in the new contract would stop AtliQ serving its existing clients.
AtliQ Technologies Pvt Ltd (India) and AtliQ Inc (USA, 100% owned by Pvt Ltd) are each other's Affiliates. Delivery for both entities is done from Pune, India.
Read the register entry's definitions carefully (e.g. who counts as a "Hospitality Business", what "in the GCC" means, who is an "Affiliate", what services are "substantially similar"). Switching the contracting entity or performing the work from India does not avoid a restriction that binds Affiliates "irrespective of where the services are performed".
Waivers are limited to their express terms.
Rules: quote the new contract VERBATIM. Never say "breach", "violate", "enforceable" or "unenforceable" and never give a legal conclusion: describe the collision and who should decide. Recommend only: comply, renegotiate, seek consent/waiver, business fix, or counsel. Never suggest workarounds to avoid an obligation.`;

export async function checkConflicts(args: {
  doc: Document;
  x: Extraction;
  deal: Deal;
  candidates: Candidate[];
  reverse: ReturnType<typeof reverseScan>;
  documents: Map<string, Document>;
}): Promise<{ findings: Finding[]; checked: string[]; error?: string }> {
  const { doc, candidates, reverse } = args;
  if (!candidates.length && !reverse.length) return { findings: [], checked: [] };

  const regBlock = candidates
    .map(({ entry: e, why }) =>
      [
        `### Register entry ${e.id} (${e.type}) · matched on: ${why}`,
        `Source: ${e.counterparty}, ${e.clauseRef} · binds ${e.bindsEntities.join(" + ")}${e.includesAffiliates ? " incl. Affiliates" : ""} · runs ${e.endRule ?? e.end ?? "?"} (status ${e.status})`,
        `Summary: ${e.summary}`,
        e.terms.rateFloor ? `Committed rates: ${e.terms.rateFloor.map((r) => `${r.role} $${r.ratePerHourUsd}/hr`).join(", ")}` : "",
        `Clause: "${e.quote}"`,
        ...e.relatedClauses.map((r) => `${r.clauseRef}: "${r.quote}"`),
        ...e.waivers.map((w) => `WAIVER (${args.documents.get(w.docId)?.title}): covers ${w.covers}. Text: "${w.quote}"`),
        e.waivers.length ? `Full waiver letter:\n${e.waivers.map((w) => args.documents.get(w.docId)?.text ?? "").join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
  const revBlock = reverse
    .map((r) => `### Restriction in the new contract (${r.restriction.clauseRef}): ${r.restriction.description}\nAtliQ clients in the same sector/region: ${r.clients.map((c) => `${c.name} (${c.status})`).join("; ")}`)
    .join("\n\n");

  const input = [
    `Today: ${appToday()}`,
    `New contract: ${doc.title} · counterparty ${args.deal.counterparty} · AtliQ entity named: ${args.x.atliqEntityNamed.value ?? "?"}`,
    candidates.length ? `## Register entries to assess (one result per entry)\n${regBlock}` : "## Register entries to assess\n(none)",
    reverse.length ? `## Restrictions to assess against AtliQ's clients (one result per restriction)\n${revBlock}` : "## Restrictions to assess\n(none)",
    "## NEW CONTRACT TEXT",
    doc.text,
  ].join("\n\n");

  const r = await callModel({ task: "conflict", system: SYSTEM, input, schema: Assessment });
  if (!r.ok) return { findings: [], checked: [], error: `Conflict check ${r.message} (${r.error.slice(0, 160)})` };

  const findings: Finding[] = [];
  const checked: string[] = [];
  for (const a of r.data.entries) {
    const cand = candidates.find((c) => c.entry.id === a.entryId);
    if (!cand) continue;
    const e = cand.entry;
    if (a.applies === "no") {
      checked.push(`${e.title} (${e.counterparty}): checked, doesn't reach this deal${a.waiverApplies ? " (covered by waiver)" : ""}`);
      continue;
    }
    const incoming: Citation[] = a.incomingClauses
      .map((c) => ({ c, q: locateQuote(doc.text, c.quote) }))
      .filter((v) => v.q)
      .map(({ c, q }) => ({ docId: doc.id, docTitle: doc.title, clauseRef: c.clauseRef, quote: q!, role: "incoming" as const }));
    const regCite: Citation = { docId: e.sourceDocId, docTitle: args.documents.get(e.sourceDocId)?.title ?? e.counterparty, clauseRef: e.clauseRef, quote: e.quote, role: "register" };
    const defs: Citation[] = e.relatedClauses.slice(0, 3).map((rc) => ({ docId: e.sourceDocId, docTitle: args.documents.get(e.sourceDocId)?.title ?? e.counterparty, clauseRef: rc.clauseRef, quote: rc.quote, role: "register" }));
    const judgment = a.applies === "arguable";
    const severity = judgment || a.severable ? "high" : "blocker";
    const w = e.waivers[0];
    findings.push({
      key: `conflict:${e.sourceDocId}:${e.type}`,
      category: "conflict",
      topic: e.type,
      title: `${judgment ? "Possible collision" : "Collides"} with ${e.counterparty}: ${e.title}`,
      impact: a.impact,
      severity,
      confidence: judgment ? "low" : "high",
      needsJudgment: judgment,
      readings: judgment ? a.readings : undefined,
      owner: a.resolution === "counsel" || judgment ? "counsel (via Karandeep)" : a.resolution === "business_fix" ? "Karandeep (business fix)" : "Karandeep",
      resolution: a.resolution,
      docId: doc.id,
      citations: [...incoming, regCite, ...defs],
      counterPosition: a.suggestedChange ?? undefined,
      registerEntryId: e.id,
      registerVerified: e.verified,
      expiry: e.end,
      waiver: w ? { docId: w.docId, covers: w.covers, applies: !!a.waiverApplies, why: a.waiverWhy ?? "" } : null,
    });
  }
  for (const c of r.data.covenants) {
    if (c.applies === "no") continue;
    const q = locateQuote(doc.text, c.quote);
    findings.push({
      key: `covenant:${reverse.find((x) => x.restriction.clauseRef === c.clauseRef)?.restriction.type ?? "non_compete"}`,
      category: "covenant",
      topic: "restrictive",
      title: `Restriction in this contract hits current clients: ${c.clientsAffected.join(", ")}`,
      impact: c.impact,
      severity: c.applies === "yes" ? "blocker" : "high",
      confidence: c.applies === "yes" ? "high" : "low",
      needsJudgment: c.applies === "arguable",
      owner: "Karandeep",
      resolution: "redline",
      docId: doc.id,
      citations: q ? [{ docId: doc.id, docTitle: doc.title, clauseRef: c.clauseRef, quote: q, role: "incoming" }] : [],
      counterPosition: "Delete the restriction (no non-competes inside an NDA or services agreement), or limit it to named competitors for the term only.",
    });
  }
  return { findings, checked };
}

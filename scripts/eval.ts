/**
 * npm run eval: runs every case in eval/cases.json (from docs/Eval_Set.md) and writes eval/results.md.
 * Briefs come from data/briefs (npm run review); version pairs re-run the pipeline (cached per call).
 * Evals use an in-memory state so they never touch the app's real state file.
 *   npm run eval            → all cases
 *   npm run eval -- --no-versions   → skip EV-V (no model calls at all)
 */
import "./_env";
import fs from "node:fs";
import path from "node:path";
import { checkRegister } from "./checkRegister";
import { canDecide, canViewBrief, canViewDeal, canViewRegister, canViewSimilarClauses } from "../lib/access";
import { splitSections } from "../lib/chunker";
import { loadIndex, searchMany } from "../lib/clauseIndex";
import { readJson } from "../lib/config";
import { baseDeals, baseDocuments } from "../lib/data";
import { briefVersions } from "../lib/deals";
import { proposeLink } from "../lib/linking";
import { locateQuote } from "../lib/quotes";
import { effectiveBrief } from "../lib/review/effective";
import { hasLegalConclusion } from "../lib/review/guardrails";
import { reviewDeal } from "../lib/review/pipeline";
import type { Brief, EffectiveBrief, Finding } from "../lib/review/types";
import { SEVERITY_RANK } from "../lib/review/types";
import { runSellerCheck, sellerBanner } from "../lib/seller";
import { mutate, readState, useMemoryState, type SellerInput } from "../lib/store";
import type { ClauseType, Document, EvalCase, RegisterEntry } from "../lib/types";
import { USERS } from "../lib/users";

type Spec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Result = { id: string; section: string; title: string; pass: boolean | null; detail: string };

const results: Result[] = [];
const cases = readJson<{ cases: (EvalCase & { spec: Spec })[] }>("../eval/cases.json").cases;
const docs = baseDocuments();
const deals = baseDeals();
const noVersions = process.argv.includes("--no-versions");

function record(c: EvalCase, pass: boolean | null, detail: string) {
  results.push({ id: c.id, section: c.section, title: c.title, pass, detail });
  console.log(`${pass === null ? "SKIP" : pass ? "PASS" : "FAIL"}  ${c.id.padEnd(6)} ${detail}`);
}

function v1(dealId: string): Brief | null {
  const p = path.join("data", "briefs", `${dealId}.json`);
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")) as Brief) : null;
}

function matches(f: Finding, pattern: string): boolean {
  if (pattern.startsWith("severity:")) return f.severity === pattern.slice(9);
  const [key, clause] = pattern.split("@");
  if (!f.key.startsWith(key)) return false;
  return !clause || f.citations.some((c) => c.role === "incoming" && c.clauseRef.includes(clause));
}

function checkFindings(b: EffectiveBrief, spec: Spec): string[] {
  const problems: string[] = [];
  for (const p of spec.mustFind ?? []) if (!b.findings.some((f) => matches(f, p))) problems.push(`missing ${p}`);
  for (const p of spec.mustNotFlag ?? []) {
    const hit = b.findings.find((f) => matches(f, p) && SEVERITY_RANK[f.severity] >= SEVERITY_RANK.medium);
    if (hit) problems.push(`flagged ${hit.key} (${hit.severity})`);
  }
  if (spec.maxMedium !== undefined) {
    const m = b.findings.filter((f) => f.severity === "medium").length;
    if (m > spec.maxMedium) problems.push(`${m} medium items > ${spec.maxMedium}`);
  }
  if (spec.expectRoute && b.route !== spec.expectRoute) problems.push(`route ${b.route}`);
  return problems;
}

function confirmAllCompliance(b: Brief) {
  if (!b.complianceCandidate) return;
  mutate((s) => {
    s.confirmations[b.dealId] = Object.fromEntries(b.complianceCandidate!.factIds.map((id) => [id, { status: "confirmed" as const, at: new Date().toISOString() }]));
  });
}

function syntheticDoc(file: string, meta: Partial<Document> & Pick<Document, "id" | "docType" | "counterparty" | "sideOfTable" | "paper">): Document {
  const text = fs.readFileSync(path.join("data", file), "utf8").replace(/\r\n/g, "\n");
  // The synthetic text must win over any text carried in the metadata (e.g. the original v1 document).
  return { kind: "uploaded", title: meta.title ?? meta.id, date: "2026-10-04", ocr: false, references: [], ...meta, file, text } as Document;
}

async function main() {
  // ---------------------------------------------------------------- A. register
  const reg = checkRegister(false);
  const row = (k: string) => reg.rows.find((r) => r.key === k);
  for (const c of cases.filter((c) => c.spec.kind === "register")) {
    const keys: string[] = c.spec.registerKeys;
    const bad = keys.filter((k) => !row(k)?.matched || row(k)!.mismatches.length);
    const ill = (c.spec.illegible ?? []).filter((x: string) => !reg.illegibleOk.find((i) => `${i.sourceDocId}:${i.clause}` === x)?.found);
    record(c, !bad.length && !ill.length, bad.length || ill.length ? `problems: ${[...bad.map((k) => `${k}: ${row(k)?.mismatches.join("; ") || "missing"}`), ...ill].join(" | ")}` : `${keys.join(", ")} present with quote + clause${ill.length === 0 && c.spec.illegible ? "; illegible clause reported" : ""}`);
  }
  const index = loadIndex();
  for (const c of cases.filter((c) => c.spec.kind === "labels")) {
    const bad = (c.spec.expectedPrecedents as { docId: string; label: string }[]).filter((p) => !index.some((x) => x.docId === p.docId && x.label === p.label));
    const asStandard = index.filter((x) => ["brightwater-msa", "meridian-nda"].includes(x.docId) && x.label === "standard");
    record(c, !bad.length && !asStandard.length, bad.length ? `labels missing: ${bad.map((b) => b.docId).join(", ")}` : "Brightwater=accident, Al Noor 10%=exception, Northwind law=concession, Meridian=accident; none labelled standard");
  }

  // ---------------------------------------------------------------- B. incoming contracts
  for (const c of cases.filter((c) => c.spec.kind === "review")) {
    useMemoryState();
    const b = v1(c.spec.dealId);
    if (!b) {
      record(c, false, `no brief for ${c.spec.dealId}: run npm run review`);
      continue;
    }
    if (c.spec.expectComplianceAlert) confirmAllCompliance(b);
    const e = effectiveBrief(b, null);
    const problems = checkFindings(e, c.spec);
    if (c.spec.expectedVerdict && e.verdict !== c.spec.expectedVerdict) problems.unshift(`verdict ${e.verdict} ≠ ${c.spec.expectedVerdict}`);
    if (c.spec.expectComplianceAlert && e.complianceAlert?.status !== "open") problems.push("no compliance alert");
    record(c, !problems.length, problems.length ? problems.join("; ") : `${e.verdict}${e.complianceAlert ? " + compliance alert" : ""} · found ${(c.spec.mustFind ?? []).join(", ") || "nothing to find"}${c.spec.mustNotFlag?.length ? " · clean on " + c.spec.mustNotFlag.join(", ") : ""}`);
  }
  for (const c of cases.filter((c) => c.spec.kind === "unverified")) {
    useMemoryState();
    const b = v1(c.spec.dealId)!;
    const before = effectiveBrief(b, null).findings.find((f) => f.key.startsWith(c.spec.mustFind[0]));
    mutate((s) => {
      if (before?.registerEntryId) s.registerOverrides[before.registerEntryId] = { verified: true, at: new Date().toISOString(), by: "eval" };
    });
    const after = effectiveBrief(b, null).findings.find((f) => f.key.startsWith(c.spec.mustFind[0]));
    record(c, !!before && before.registerVerified === false && after?.registerVerified === true, before ? `raised while unverified (labelled), label removed after verify (${before.registerEntryId})` : "conflict not raised");
  }

  // ---------------------------------------------------------------- B1. compliance alerts & notes
  for (const c of cases.filter((c) => c.spec.kind === "compliance")) {
    useMemoryState();
    const b = v1(c.spec.dealId)!;
    if (c.id === "EV-C1") {
      confirmAllCompliance(b);
      const open = effectiveBrief(b, null);
      mutate((s) => {
        s.alerts[b.dealId] = { status: "resolved", how: "note", note: "Harrington privacy officer confirmed deletion, 5 Oct", at: "2026-10-05T10:00:00.000Z" };
      });
      const closed = effectiveBrief(b, null);
      const ok = open.complianceAlert?.status === "open" && closed.complianceAlert?.status === "resolved" && /resolved by Karandeep's note/i.test(closed.complianceAlert?.resolution ?? "") && closed.findings.length === open.findings.length;
      record(c, ok, ok ? `alert open → "${closed.complianceAlert?.resolution}"; findings unchanged (${closed.findings.length}); verdict ${closed.verdict} from the other open items` : `alert states ${open.complianceAlert?.status} → ${closed.complianceAlert?.status}`);
    } else {
      const key = effectiveBrief(b, null).findings.find((f) => f.key.startsWith("conflict:alnoor-msa"))?.key;
      mutate((s) => {
        if (key) s.blockerNotes[b.dealId] = { [key]: { note: "Al Noor agreed verbally to waive for Gulf Crown", at: new Date().toISOString() } };
      });
      const e = effectiveBrief(b, null);
      const f = e.findings.find((x) => x.key === key);
      const ok = !!f && f.severity === "blocker" && !!f.pendingDocument && e.verdict === "HOLD";
      record(c, ok, ok ? `blocker stays open, "pending ${f!.pendingDocument}"; verdict HOLD` : "note cleared or changed the blocker");
    }
  }

  // ---------------------------------------------------------------- B2. deal linking
  for (const c of cases.filter((c) => c.spec.kind === "linking")) {
    const d = c.spec.docId ? docs.find((x) => x.id === c.spec.docId)! : null;
    const input = d ? { counterparty: d.counterparty, docType: d.docType, text: d.text, docId: d.id } : { ...c.spec.synthetic, docId: undefined };
    const p = proposeLink(input, deals, docs, c.spec.userChoice);
    const ex = c.spec.expect;
    const ok =
      p.mode === ex.mode &&
      (!ex.dealId || p.dealId === ex.dealId) &&
      (!ex.endClientDealId || p.endClientDealId === ex.endClientDealId) &&
      (!ex.notVersionOf || ex.notVersionOf.every((x: string) => p.notVersionOf.includes(x))) &&
      (!ex.note || p.note?.dealId === ex.note);
    record(c, ok, `${p.mode}${p.dealId ? ` → ${p.dealId}` : ""} (${p.reason})${p.endClientDealId ? ` · end client ${p.endClientDealId}` : ""}${p.note ? ` · note: ${p.note.text}` : ""}${p.options.length ? ` · options: ${p.options.map((o) => o.dealId).join("/")}` : ""}`);
  }

  // ---------------------------------------------------------------- B3. access control
  const jay = USERS.find((u) => u.id === "jay")!;
  const k = USERS.find((u) => u.id === "karandeep")!;
  for (const c of cases.filter((c) => c.spec.kind === "access")) {
    if (c.id === "EV-A1") {
      const own = deals.find((d) => d.owner === "Jay")!;
      const ok = canViewDeal(jay, own) && !canViewBrief(jay) && !canViewRegister(jay) && !canViewSimilarClauses(jay) && !canDecide(jay) && canViewBrief(k) && canViewRegister(k);
      record(c, ok, "Jay opens his deal; brief, register, similar clauses and decisions are Karandeep-only (also enforced by proxy.ts + server checks)");
    } else if (c.id === "EV-A2") {
      useMemoryState();
      const chk = await runSellerCheck("lakeshore", "Jay", sellerInput({ client: "US retail client", sectors: ["retail"], regions: ["USA"], services: ["data engineering"], rates: [{ role: "Senior Data Engineer", ratePerHourUsd: 72 }] }));
      const text = JSON.stringify(chk.items);
      const leak = ["Crestline", "$85", "85/hr", "85.00"].filter((w) => text.includes(w));
      record(c, chk.items.some((i) => i.status === "conflict") && !leak.length, leak.length ? `leaks ${leak.join(", ")}` : "says a pricing floor applies; no client name or rates revealed");
    } else {
      const other = deals.find((d) => d.owner === "Bhavin")!;
      record(c, !canViewDeal(jay, other), `Jay → ${other.name}: denied`);
    }
  }

  // ---------------------------------------------------------------- C. version pairs
  for (const c of cases.filter((c) => c.spec.kind === "version" || c.spec.kind === "skip")) {
    if (c.spec.kind === "skip") {
      record(c, null, c.spec.reason);
      continue;
    }
    if (noVersions) {
      record(c, null, "skipped (--no-versions)");
      continue;
    }
    useMemoryState();
    const base = v1(c.spec.dealId)!;
    const replace: Record<string, Document> = {};
    for (const [id, file] of Object.entries(c.spec.replace ?? {})) {
      const orig = docs.find((d) => d.id === id)!;
      replace[id] = { ...syntheticDoc(file as string, orig), id, kind: "incoming", title: orig.title + " (v2)" };
    }
    const add = (c.spec.add ?? []).map((file: string) =>
      file.includes("rheinwerk")
        ? syntheticDoc(file, { id: "rheinwerk-annex3", title: "Rheinwerk Annex 3: Data Processing Agreement (synthetic)", docType: "DPA", counterparty: "Rheinwerk Analytics GmbH", atliqEntity: "Pvt Ltd", sideOfTable: "supplier", paper: "client" })
        : syntheticDoc(file, { id: "ortiz-sub-baa", title: "Subcontractor BAA: Daniel Ortiz (synthetic)", docType: "BAA", counterparty: "Daniel Ortiz", atliqEntity: "Inc", sideOfTable: "buyer", paper: "atliq" }),
    );
    const v2 = await reviewDeal(c.spec.dealId, { trigger: "eval version pair", version: 2, replace, add, withoutSimilar: true });
    if (c.spec.expectComplianceAlert) confirmAllCompliance(v2);
    const e = effectiveBrief(v2, base);
    const resolvedKeys = e.changes!.resolved.map((f) => f.key);
    const problems = [
      ...c.spec.resolved.filter((k2: string) => !resolvedKeys.some((r) => r.startsWith(k2))).map((k2: string) => `not resolved: ${k2}`),
      ...c.spec.stillOpen.filter((k2: string) => !e.changes!.stillOpen.some((r) => r.startsWith(k2))).map((k2: string) => `not still open: ${k2}`),
    ];
    if (c.spec.expectedVerdict && e.verdict !== c.spec.expectedVerdict) problems.push(`verdict ${e.verdict}`);
    if (c.spec.expectComplianceAlert && e.complianceAlert?.status !== "open") problems.push("compliance alert not open");
    record(c, !problems.length, problems.length ? problems.join("; ") : `resolved ${resolvedKeys.join(", ")} · still open ${e.changes!.stillOpen.length} · new ${e.changes!.new.join(", ") || "none"} · ${e.verdict}`);
  }

  // ---------------------------------------------------------------- D. seller checks
  for (const c of cases.filter((c) => c.spec.kind?.startsWith("seller"))) {
    useMemoryState();
    if (c.spec.kind === "seller") {
      const chk = await runSellerCheck("gulfcrown", "Bhavin", sellerInput(c.spec.input));
      const ex = c.spec.expect;
      let ok: boolean;
      let detail: string;
      if (ex.freeTextStatus) {
        const ft = chk.items.find((i) => i.item.startsWith("Also promising"));
        ok = ft?.status === ex.freeTextStatus;
        detail = `free text → ${ft?.status}: ${ft?.todo}`;
      } else {
        // The item the case is about: rates → rate item, tools → reuse item, else sector & regions.
        const worst = c.spec.input.rates ? chk.items.find((i) => i.item.startsWith("Rate"))! : c.spec.input.assets ? chk.items.find((i) => i.item.startsWith("Reuse"))! : chk.items[0];
        const entry = worst.source ? readJson<{ entries: RegisterEntry[] }>("register.json").entries.find((e) => e.id === worst.source!.registerEntryId) : null;
        ok = worst.status === ex.status && (!ex.source || entry?.sourceDocId === ex.source) && !JSON.stringify(chk.items).match(/Crestline|Al Noor|Northwind|CloudSpan/);
        detail = `${worst.status}${entry ? ` (source ${entry.sourceDocId} ${entry.clauseRef}, name hidden)` : ""} · stamped as of ${chk.asOf}, register ${chk.registerVersion}`;
        if (c.spec.recheck) {
          const again = await runSellerCheck("gulfcrown", "Jay", sellerInput({ ...c.spec.input, ...c.spec.recheck }), chk);
          const st = again.items.find((i) => i.item.startsWith("Rate"))?.status;
          ok = ok && st === c.spec.recheck.status;
          detail += ` → re-check at $${c.spec.recheck.rates[0].ratePerHourUsd}: ${st}`;
        }
      }
      record(c, ok, detail);
    } else if (c.spec.kind === "seller-banner") {
      const chk = await runSellerCheck(c.spec.dealId, "Bhavin", sellerInput({ client: "Gulf Crown", sectors: ["hospitality"], regions: ["Saudi Arabia"], services: ["revenue management"] }));
      const before = sellerBanner(chk);
      mutate((s) => {
        s.briefs[c.spec.dealId] = [{ ...v1(c.spec.dealId)!, version: 2, trigger: "eval re-check", createdAt: new Date().toISOString() }];
      });
      const after = sellerBanner(chk);
      record(c, !before.show && after.show, `before: ${before.show ? "banner" : "no banner"} · after brief v2: ${after.show ? `banner (${after.reason})` : "no banner"}; old answer keeps its date ${chk.asOf}`);
      void briefVersions;
    } else {
      const input = sellerInput(c.spec.input);
      const first = await runSellerCheck("gulfcrown", "Bhavin", input);
      const alnoor = readJson<{ entries: RegisterEntry[] }>("register.json").entries.find((e) => e.sourceDocId === "alnoor-msa" && e.type === "non_compete")!;
      mutate((s) => {
        s.registerOverrides[alnoor.id] = {
          edits: { waivers: [...alnoor.waivers, { docId: "synthetic-waiver", clauseRef: "§12.4", covers: `revenue-management services to ${c.spec.waiverFor}, Saudi Arabia (synthetic waiver)`, quote: "" }] },
          at: new Date().toISOString(),
          by: "eval",
        };
        s.registerRevision += 1;
      });
      const banner = sellerBanner(first);
      const again = await runSellerCheck("gulfcrown", "Bhavin", input, first);
      const other = await runSellerCheck("gulfcrown", "Bhavin", { ...input, client: "Another Saudi hotel group" }, first);
      const ok = first.items[0].status === "conflict" && banner.show && again.items[0].status === "clear" && other.items[0].status === "conflict";
      record(c, ok, `conflict → register changed (banner: ${banner.show}) → re-run clear for ${c.spec.waiverFor}; other Saudi hotel group still ${other.items[0].status}`);
    }
  }

  // ---------------------------------------------------------------- E. similar past clauses
  let expected = 0;
  let found = 0;
  for (const c of cases.filter((c) => c.spec.kind === "similar")) {
    const q = c.spec.query;
    const doc = docs.find((d) => d.id === q.docId)!;
    const sec = splitSections(doc.text).find((s) => s.no === q.section);
    if (!sec) {
      record(c, false, `section ${q.section} not found in ${q.docId}`);
      continue;
    }
    const [hits] = await searchMany([{ text: `${sec.heading}\n${sec.text}`.slice(0, 3000), clauseType: q.clauseType as ClauseType }]);
    const problems: string[] = [];
    for (const e of c.spec.expect as { docId?: string; anyOf?: string[]; label: string }[]) {
      expected++;
      const ids = e.anyOf ?? [e.docId!];
      const h = hits.find((x) => ids.includes(x.chunk.docId));
      if (h && h.chunk.label === e.label) found++;
      else problems.push(`${ids.join("|")} (${e.label}) ${h ? `labelled ${h.chunk.label}` : "not in top 3"}`);
    }
    const drafts = hits.filter((h) => !docs.find((d) => d.id === h.chunk.docId && d.kind === "signed"));
    if (drafts.length) problems.push("unsigned document returned");
    const mislabelled = hits.filter((h) => (h.chunk.label === "exception" || h.chunk.label === "accident") && index.find((x) => x.id === h.chunk.id)?.label === "standard");
    if (mislabelled.length) problems.push("one-off shown as standard");
    if (c.spec.dealId) {
      const b = v1(c.spec.dealId);
      if (b) {
        useMemoryState();
        const withPanel = effectiveBrief(b, null).verdict;
        const without = effectiveBrief({ ...b, similar: [] }, null).verdict;
        if (withPanel !== without || withPanel !== c.spec.expectedVerdict) problems.push(`verdict ${withPanel} / without panel ${without}`);
      }
    }
    record(c, !problems.length, `top 3: ${hits.map((h) => `${h.chunk.counterparty} §${h.chunk.clauseNo} [${h.chunk.label}] ${h.score.toFixed(2)}`).join(" · ")}${problems.length ? ` | ${problems.join("; ")}` : ""}`);
  }

  // ---------------------------------------------------------------- cross-cutting: citations, guardrails, verdict independence, latency
  const briefs = deals.map((d) => v1(d.id)).filter((b): b is Brief => !!b);
  const noteTexts = readJson<{ id: string; text: string }[]>("notes.json");
  let cites = 0;
  let valid = 0;
  const invalid: string[] = [];
  for (const b of briefs)
    for (const f of [...b.findings, ...(b.complianceCandidate ? [{ key: "alert", citations: b.complianceCandidate.citations } as unknown as Finding] : [])])
      for (const c of f.citations) {
        cites++;
        const src = docs.find((d) => d.id === c.docId)?.text ?? noteTexts.find((n) => n.id === c.docId)?.text ?? deals.find((d) => d.id === b.dealId)?.trackerNotes.join("\n") ?? "";
        if (locateQuote(src, c.quote)) valid++;
        else invalid.push(`${b.dealId}/${f.key}/${c.docId} ${c.clauseRef}`);
      }
  const prose = briefs.flatMap((b) => [b.headline, b.nextAction, ...b.findings.flatMap((f) => [f.title, f.impact, f.counterPosition ?? ""]), ...b.similar.flatMap((p) => p.hits.map((h) => h.differs))]);
  const legal = prose.filter(hasLegalConclusion);
  const rejects = briefs.filter((b) => /reject/i.test(b.verdict) || /\breject (the|this)\b/i.test(b.nextAction));
  useMemoryState();
  const independent = briefs.every((b) => effectiveBrief(b, null).verdict === effectiveBrief({ ...b, similar: [] }, null).verdict);
  const ndaTimes = briefs.filter((b) => b.route === "nda_fast_lane").map((b) => `${b.dealId} ${(b.usage.ms / 1000).toFixed(0)}s${b.usage.calls === 0 ? " (cached)" : ""}`);

  const crossCutting = [
    { name: "Citation validity (all quotes string-matched to source)", pass: valid === cites, detail: `${valid}/${cites}${invalid.length ? ` · invalid: ${invalid.slice(0, 5).join(", ")}` : ""}` },
    { name: "Guardrails: no breach/enforceable in system prose; never Reject", pass: !legal.length && !rejects.length, detail: `${prose.length} prose strings checked; ${legal.length} legal conclusions; ${rejects.length} Reject recommendations` },
    { name: "Verdict identical with and without similar-clauses panel", pass: independent, detail: `${briefs.length} briefs` },
    { name: "NDA fast lane latency (<1 min)", pass: null, detail: ndaTimes.join(" · ") || "no NDA briefs" },
    { name: "Recall@3 on EV-P (≥80%)", pass: expected ? found / expected >= 0.8 : null, detail: `${found}/${expected} = ${expected ? Math.round((100 * found) / expected) : 0}%` },
  ];

  // ---------------------------------------------------------------- report
  const passCount = results.filter((r) => r.pass === true).length;
  const failCount = results.filter((r) => r.pass === false).length;
  const skipCount = results.filter((r) => r.pass === null).length;
  console.log(`\n${passCount} passed · ${failCount} failed · ${skipCount} skipped (of ${results.length})`);
  for (const x of crossCutting) console.log(`${x.pass === null ? "INFO" : x.pass ? "PASS" : "FAIL"}  ${x.name}: ${x.detail}`);

  const sections = [...new Set(results.map((r) => r.section))];
  const md = [
    `# Eval results`,
    ``,
    `Run ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · APP_TODAY ${process.env.APP_TODAY ?? "2026-10-04"} · cases from \`docs/Eval_Set.md\` via \`eval/cases.json\`.`,
    ``,
    `**${passCount} passed · ${failCount} failed · ${skipCount} skipped** (of ${results.length} cases)`,
    ``,
    `## Cross-cutting checks (PRD §11)`,
    ``,
    `| Check | Result | Detail |`,
    `|---|---|---|`,
    ...crossCutting.map((x) => `| ${x.name} | ${x.pass === null ? "info" : x.pass ? "✅" : "❌"} | ${x.detail.replace(/\|/g, "/")} |`),
    ``,
    ...sections.flatMap((s) => [
      `## ${s}`,
      ``,
      `| Case | Result | Detail |`,
      `|---|---|---|`,
      ...results.filter((r) => r.section === s).map((r) => `| ${r.id} ${r.title.slice(0, 60).replace(/\|/g, "/")} | ${r.pass === null ? "skip" : r.pass ? "✅" : "❌"} | ${r.detail.replace(/\|/g, "/").slice(0, 400)} |`),
      ``,
    ]),
  ].join("\n");
  fs.writeFileSync("eval/results.md", md + "\n");
  fs.writeFileSync("eval/results.json", JSON.stringify({ at: new Date().toISOString(), results, crossCutting }, null, 2) + "\n");
  console.log("\nwrote eval/results.md");
  void readState;
}

const rank = (s: string) => ({ clear: 0, couldnt_check: 1, attention: 2, conflict: 3 })[s] ?? 0;

function sellerInput(p: Partial<SellerInput>): SellerInput {
  return { client: "", sectors: [], regions: [], services: [], rates: [], assets: [], dataHandling: "", partnership: false, freeText: "", ...p };
}

main();

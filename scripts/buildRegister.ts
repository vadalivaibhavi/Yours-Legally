/**
 * Phase 1b: build the obligations register (F1, FR-1) by AI extraction from every signed document.
 * One strong-model call per document via lib/llm.ts, zod-validated. After extraction, code (not AI):
 *  - drops any entry whose quote is not an exact substring of the source (logged),
 *  - expands affiliate coverage to both AtliQ entities (Inc is 100% owned by Pvt Ltd),
 *  - computes end date + live/expired from AI-extracted term facts against APP_TODAY,
 *  - links waiver letters to the commitment they waive (Al Noor Seaside waiver).
 * All entries keep verified=false: verification happens on the Register screen (FR-2).
 */
import "./_env";
import fs from "node:fs";
import { z } from "zod";
import { appToday, readJson, writeJson } from "../lib/config";
import { computeEnd, computeStatus } from "../lib/dates";
import { callModel, drainUsage, modelsFor } from "../lib/llm";
import { locateQuote } from "../lib/quotes";
import { RegisterEntry, RegisterType, Region, Sector, type Document } from "../lib/types";

const ExtractedEntry = z.object({
  type: RegisterType,
  title: z.string().describe("Short name, e.g. 'GCC hospitality non-compete'"),
  summary: z.string().describe("One or two plain-English sentences: what AtliQ may not do / gave away / must keep doing, and for whom"),
  clauseRef: z.string().describe("Clause number(s) as printed, e.g. '§12.1' or '§6.4–6.5'"),
  quote: z.string().describe("VERBATIM text copied exactly from the document (one contiguous passage, max ~80 words)"),
  bindsEntities: z.array(z.enum(["Pvt Ltd", "Inc"])).describe("AtliQ entity/entities that this commitment binds directly"),
  includesAffiliates: z.boolean().describe("true if the clause expressly extends to the AtliQ party's Affiliates"),
  scope: z.object({
    sectors: z.array(Sector),
    regions: z.array(Region),
    services: z.array(z.string()),
    assets: z.array(z.string()).describe("Named tools/IP affected, e.g. 'PipeKit', 'pre-existing tools incorporated in Deliverables'"),
    counterparties: z.array(z.string()).describe("Specific people/companies the commitment is limited to, if any"),
  }),
  relatedClauses: z
    .array(z.object({ clauseRef: z.string(), quote: z.string().describe("VERBATIM") }))
    .describe("Definitions or companion clauses that decide the reach of this commitment (e.g. 'Affiliate', 'Hospitality Business', 'in the GCC', 'Restricted Period')"),
  start: z.string().describe("ISO date the commitment starts (usually the effective date)"),
  termEnd: z.string().nullable().describe("ISO date the agreement term ends, if stated or computable from the text"),
  tailMonths: z.number().nullable().describe("Months the commitment survives after the term ends, if any"),
  fixedEnd: z.string().nullable().describe("ISO end date if the commitment states its own end date"),
  perpetual: z.boolean().describe("true if it never expires (e.g. an IP assignment)"),
  endRule: z.string().nullable().describe("The end rule in words, e.g. 'Term (to 14 Mar 2028) + 18 months'"),
  rateFloor: z.array(z.object({ role: z.string(), ratePerHourUsd: z.number() })).nullable().describe("For pricing promises: the rates AtliQ has committed not to undercut"),
  routine: z.boolean().describe("true for routine items that should never be flagged (e.g. mutual staff non-solicit limited to people involved, ≤12 months)"),
  notes: z.string().nullable(),
});

const Extraction = z.object({
  entries: z.array(ExtractedEntry),
  illegible: z.array(z.object({ clauseRef: z.string(), note: z.string() })).describe("Clauses that are unreadable/garbled in the source. Never guess their content."),
  referencedButMissing: z.array(z.object({ name: z.string(), note: z.string() })).describe("Documents this one references that are not part of it (SOWs, side letters, the agreement it amends)"),
  waiverOf: z
    .object({ agreementRef: z.string(), clauseRef: z.string(), covers: z.string(), quote: z.string().describe("VERBATIM limiting language") })
    .nullable()
    .describe("If this document waives/consents under another agreement's restriction: which agreement and clause, and exactly what it covers"),
});
type Extraction = z.infer<typeof Extraction>;

const SYSTEM = `You build AtliQ's obligations register: a list of every commitment in a SIGNED contract that limits what AtliQ can do, gives something away, or must keep being performed.

AtliQ has two entities: AtliQ Technologies Pvt Ltd (India, parent) and AtliQ Inc (USA, 100% owned by Pvt Ltd). They are each other's Affiliates under any usual control-based definition.

Extract (one entry per distinct commitment):
- non_compete: AtliQ may not serve certain sectors / regions / customers / service lines (even if the word "non-compete" never appears).
- exclusivity: AtliQ may not partner with / resell / refer competing platforms or parties.
- mfn_pricing: AtliQ promised that one customer's prices stay no less favourable than others'. Capture the committed rate card in rateFloor.
- ip_transfer: AtliQ assigned IP beyond what was built specifically for the client (e.g. pre-existing tools or background IP incorporated in deliverables, IP vesting on creation). Name affected tools in scope.assets.
- ip_retention: a contractor/vendor of AtliQ KEPT ownership of work product AtliQ paid for (AtliQ only has a licence).
- data_location: data must stay in a country / offshore access limits.
- insurance: insurance AtliQ must maintain (types and amounts in summary).
- non_solicit: no-hire / non-solicit obligations on AtliQ (mark routine=true when mutual, limited to staff involved and ≤12 months after term).
- compliance: obligations AtliQ must keep performing: breach-notification windows, PHI/regulated-data handling rules, audit rights, engagement-limited BAAs (put the engagement/client in scope.counterparties).
- other: any other ongoing restriction (e.g. confidential information that may not be used for others).

Do NOT create entries for the normal pattern "client owns deliverables made for it, AtliQ keeps its background IP with a licence", generic mutual confidentiality, or payment terms.

Rules:
- "quote" and relatedClauses[].quote MUST be copied character-for-character from the document (you may omit markdown ** marks). Never paraphrase inside a quote. Keep each quote to one contiguous passage.
- Include affiliates only when the clause says so (includesAffiliates).
- Map sectors/regions onto the allowed vocabulary. Use "GCC" for the Gulf Cooperation Council. A definition like "anyone providing distribution / revenue-management services to hotels" covers sectors hospitality AND travel.
- Dates: give ISO dates. Compute termEnd from the text where possible (e.g. "three (3) years, expiring on 14 March 2028" → 2028-03-14; "24 months from 1 July 2022" → 2024-06-30). If the text gives no way to know the end, leave it null and explain in notes.
- Never guess illegible or garbled text: list it under illegible with the clause number.
- Do not judge whether a commitment is acceptable. Never use the words "breach" or "enforceable" in your own text.`;

function userPrompt(doc: Document): string {
  return [
    `Today: ${appToday()}`,
    `Document id: ${doc.id}`,
    `Title: ${doc.title}`,
    `Counterparty: ${doc.counterparty}`,
    `AtliQ entity that signed: ${doc.atliqEntity ?? "unknown"} · AtliQ's side: ${doc.sideOfTable} · Signed: ${doc.date}`,
    doc.ocr ? "NOTE: scanned copy with OCR errors (e.g. 0 for O, l for 1). Read through OCR noise, but quote the text exactly as it appears." : "",
    "",
    "----- DOCUMENT TEXT -----",
    doc.text,
    "----- END -----",
  ]
    .filter((x) => x !== "")
    .join("\n");
}

async function main() {
  const t0 = Date.now();
  const docs = readJson<Document[]>("documents.json").filter((d) => d.kind === "signed");
  const only = process.argv[2];
  const targets = only ? docs.filter((d) => d.id === only) : docs;
  const prior = only && fs.existsSync("data/register.json") ? readJson<{ entries: RegisterEntry[]; documents: unknown[] }>("register.json") : null;

  const results: { doc: Document; ex: Extraction | null; error?: string; ms: number; usage: { inputTokens: number; outputTokens: number }; model?: string; cached?: boolean }[] = [];
  const queue = [...targets];
  const workers = Array.from({ length: Number(process.env.CONCURRENCY || 2) }, async () => {
    while (queue.length) {
      const doc = queue.shift()!;
      const s = Date.now();
      const r = await callModel({ task: "register", system: SYSTEM, input: userPrompt(doc), schema: Extraction });
      const ms = Date.now() - s;
      if (r.ok) {
        results.push({ doc, ex: r.data, ms, usage: r.usage, model: r.model, cached: r.cached });
        console.log(`✓ ${doc.id.padEnd(16)} ${String(r.data.entries.length).padStart(2)} entries  ${r.cached ? "(cached)" : `${(ms / 1000).toFixed(1)}s ${r.model}`}`);
      } else {
        results.push({ doc, ex: null, error: r.error, ms, usage: { inputTokens: 0, outputTokens: 0 } });
        console.log(`✗ ${doc.id.padEnd(16)} ${r.message}: ${r.error.slice(0, 300)}`);
      }
    }
  });
  await Promise.all(workers);

  const entries: RegisterEntry[] = [];
  const coverage: { docId: string; counterparty: string; entryCount: number; dropped: number; illegible: { clauseRef: string; note: string }[]; referencedButMissing: { name: string; note: string }[]; error?: string }[] = [];
  const dropped: { docId: string; clauseRef: string; quote: string; reason: string }[] = [];
  const waiverLinks: { fromDoc: Document; w: NonNullable<Extraction["waiverOf"]> }[] = [];

  for (const { doc, ex, error } of results.sort((a, b) => a.doc.id.localeCompare(b.doc.id))) {
    if (!ex) {
      coverage.push({ docId: doc.id, counterparty: doc.counterparty, entryCount: 0, dropped: 0, illegible: [], referencedButMissing: [], error });
      continue;
    }
    let n = 0;
    let d = 0;
    for (const e of ex.entries) {
      const exact = locateQuote(doc.text, e.quote);
      if (!exact) {
        d++;
        dropped.push({ docId: doc.id, clauseRef: e.clauseRef, quote: e.quote.slice(0, 160), reason: "quote not found verbatim in source" });
        continue;
      }
      const related = e.relatedClauses
        .map((r) => ({ clauseRef: r.clauseRef, quote: locateQuote(doc.text, r.quote) }))
        .filter((r): r is { clauseRef: string; quote: string } => !!r.quote);
      const binds = new Set(e.bindsEntities.length ? e.bindsEntities : doc.atliqEntity ? [doc.atliqEntity] : []);
      if (e.includesAffiliates) {
        binds.add("Pvt Ltd");
        binds.add("Inc");
      }
      const end = computeEnd(e);
      n++;
      entries.push(
        RegisterEntry.parse({
          id: `${doc.id}#${n}`,
          type: e.type,
          title: e.title,
          summary: e.summary,
          sourceDocId: doc.id,
          counterparty: doc.counterparty,
          clauseRef: e.clauseRef,
          quote: exact,
          bindsEntities: [...binds],
          includesAffiliates: e.includesAffiliates,
          scope: e.scope,
          relatedClauses: related,
          start: e.start,
          end,
          endRule: e.endRule,
          perpetual: e.perpetual,
          waivers: [],
          terms: e.rateFloor?.length ? { rateFloor: e.rateFloor } : {},
          status: computeStatus(end, e.perpetual),
          verified: false,
          rejected: false,
          routine: e.routine,
          notes: e.notes ?? undefined,
        }),
      );
    }
    coverage.push({ docId: doc.id, counterparty: doc.counterparty, entryCount: n, dropped: d, illegible: ex.illegible, referencedButMissing: ex.referencedButMissing });
    if (ex.waiverOf) waiverLinks.push({ fromDoc: doc, w: ex.waiverOf });
  }

  // Link waivers (code, not AI): the waived agreement is found by its printed reference number.
  const allDocs = readJson<Document[]>("documents.json");
  const merged = prior ? [...(prior.entries as RegisterEntry[]).filter((e) => !targets.some((t) => t.id === e.sourceDocId)), ...entries] : entries;
  for (const { fromDoc, w } of waiverLinks) {
    const target = allDocs.find((d) => d.id !== fromDoc.id && d.kind === "signed" && (d.references.some((r) => w.agreementRef.includes(r) || r.includes(w.agreementRef)) || fromDoc.references.some((r) => d.references.includes(r))));
    const sec = (w.clauseRef.match(/\d+/) ?? [""])[0];
    const restricted = merged.filter((e) => target && e.sourceDocId === target.id && ["non_compete", "exclusivity"].includes(e.type) && (e.clauseRef.match(/\d+/) ?? [""])[0] === sec);
    const quote = locateQuote(fromDoc.text, w.quote) ?? "";
    for (const e of restricted) e.waivers.push({ docId: fromDoc.id, clauseRef: w.clauseRef, covers: w.covers, quote });
    console.log(`waiver ${fromDoc.id} → ${target?.id ?? "?"} §${sec}: linked to ${restricted.map((e) => e.id).join(", ") || "nothing"}`);
  }

  const usage = drainUsage();
  const run = {
    script: "buildRegister",
    at: new Date().toISOString(),
    models: modelsFor("register"),
    documents: results.length,
    entries: merged.length,
    dropped: dropped.length,
    calls: usage.filter((u) => !u.cached).length,
    cachedCalls: usage.filter((u) => u.cached).length,
    inputTokens: usage.reduce((s, u) => s + u.usage.inputTokens, 0),
    outputTokens: usage.reduce((s, u) => s + u.usage.outputTokens, 0),
    seconds: Math.round((Date.now() - t0) / 1000),
    perDoc: results.map((r) => ({ docId: r.doc.id, ms: r.ms, model: r.model, cached: r.cached, ...r.usage })),
  };
  writeJson(`runs/register-${run.at.slice(0, 19).replace(/[:T]/g, "-")}.json`, run);
  writeJson("register.json", {
    version: `reg-${run.at.slice(0, 10)}-${merged.length}`,
    builtAt: run.at,
    today: appToday(),
    models: run.models,
    entries: merged,
    documents: prior ? [...(prior.documents as typeof coverage).filter((c) => !targets.some((t) => t.id === c.docId)), ...coverage] : coverage,
    dropped,
  });
  console.log(`\nregister: ${merged.length} entries (${merged.filter((e) => e.status === "live").length} live, ${merged.filter((e) => e.status === "expired").length} expired, ${merged.filter((e) => e.status === "unknown").length} unknown); dropped ${dropped.length} for unmatched quotes`);
  console.log(`tokens in/out: ${run.inputTokens}/${run.outputTokens}; ${run.calls} calls (+${run.cachedCalls} cached); ${run.seconds}s`);
  const failed = coverage.filter((c) => c.error);
  if (failed.length) {
    console.log(`FAILED: ${failed.map((c) => c.docId).join(", ")}: re-run to retry (successful documents are cached)`);
    process.exitCode = 1;
  }
}

main();

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
import { appToday, readJson, writeJson } from "../lib/config";
import { callModel, drainUsage, modelsFor } from "../lib/llm";
import { locateQuote } from "../lib/quotes";
import { Extraction, SYSTEM, toEntries, userPrompt } from "../lib/registerExtract";
import type { RegisterEntry, Document } from "../lib/types";

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
    const built = toEntries(doc, ex);
    entries.push(...built.entries);
    dropped.push(...built.dropped);
    const n = built.entries.length;
    const d = built.dropped.length;
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

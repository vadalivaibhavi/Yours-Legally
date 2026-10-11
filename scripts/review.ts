/**
 * Phase 2: run the review pipeline and write the v1 brief per deal to data/briefs/<deal>.json
 * (data/briefs-ollama/ with LLM_PROVIDER=ollama: local runs never overwrite the final Gemini briefs)
 * (committed, so the deployed app is instant and Vercel never runs the heavy jobs).
 *
 *   npm run review                         → every deal that isn't already complete and current
 *   npm run review -- --deal gulfcrown     → one deal (bare ids work too: `npm run review -- gulfcrown`)
 *   npm run review -- --force              → re-run even complete, current briefs
 *
 * Free-tier friendly: one deal at a time by default (REVIEW_CONCURRENCY), model calls spaced out
 * (LLM_MIN_INTERVAL_MS), 429s wait Google's retry delay. When every model's daily quota is used up the
 * run stops cleanly ("daily quota reached, resume tomorrow"); re-running resumes: completed model calls
 * are cached and complete, current briefs are skipped. A complete brief is never overwritten by an
 * incomplete one. AtliQ-paper deals wait for the client deal they serve (Kriti → Rheinwerk …).
 */
import "./_env";
import fs from "node:fs";
import path from "node:path";
import { checkIds, parseArgs } from "./_args";
import { baseDeals } from "../lib/data";
import { briefsDir, writeJson } from "../lib/config";
import { isQuotaExhausted, withRunContext } from "../lib/llm";
import { currentInputsHash, reviewDeal } from "../lib/review/pipeline";
import type { Brief } from "../lib/review/types";
import type { Deal } from "../lib/types";

const CONCURRENCY = Math.max(1, Number(process.env.REVIEW_CONCURRENCY || 1));

type Totals = { calls: number; cached: number; inTok: number; outTok: number };

function existingBrief(id: string): Brief | null {
  const p = `data/${briefsDir()}/${id}.json`;
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")) as Brief) : null;
}

/** Complete = no failed steps and every similar-clause comparison line written. */
function isComplete(b: Brief): boolean {
  return !b.errors.length && b.similar.every((p) => p.hits.every((h) => !!h.differs));
}

async function reviewOne(d: Deal, totals: Totals): Promise<{ line?: string; quota?: string }> {
  const t = Date.now();
  if (process.env.REVIEW_DRY) {
    // Scheduling check without model calls: REVIEW_DRY=1 npm run review
    console.log(`  start  ${d.id}${d.endClientDealId ? ` (after ${d.endClientDealId})` : ""}`);
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 600));
    console.log(`  finish ${d.id}`);
    return {};
  }
  try {
    const brief = await withRunContext({ script: "review", dealId: d.id }, () =>
      reviewDeal(d.id, { trigger: "initial review", version: 1, log: (m) => console.log(`  [${d.id}] ${m}`) }),
    );
    // Never replace a complete brief with an incomplete one.
    const existing = existingBrief(d.id);
    if (!isComplete(brief) && existing && isComplete(existing)) {
      writeJson(`${briefsDir()}/failed/${d.id}.json`, brief);
      console.log(`  [${d.id}] ! kept the existing complete brief; incomplete run saved to data/${briefsDir()}/failed/${d.id}.json`);
    } else {
      writeJson(`${briefsDir()}/${d.id}.json`, brief);
      if (isComplete(brief)) fs.rmSync(`data/${briefsDir()}/failed/${d.id}.json`, { force: true }); // superseded
    }
    totals.calls += brief.usage.calls;
    totals.cached += brief.usage.cachedCalls;
    totals.inTok += brief.usage.inputTokens;
    totals.outTok += brief.usage.outputTokens;
    const count = (s: string) => brief.findings.filter((f) => f.severity === s).length;
    const line = `${d.id.padEnd(13)} ${brief.verdict.padEnd(19)} ${count("blocker")}B ${count("high")}H ${count("medium")}M  ${((Date.now() - t) / 1000).toFixed(0)}s  ${isComplete(brief) ? "" : "INCOMPLETE " + brief.errors.join(" | ").slice(0, 120)}`;
    console.log(`✓ ${line}\n    ${brief.headline}`);
    return { line };
  } catch (e) {
    if (isQuotaExhausted(e)) return { quota: e.message }; // nothing written for this deal: it resumes tomorrow
    console.log(`✗ ${d.id}: ${String(e)}`);
    process.exitCode = 1;
    return {};
  }
}

/** Tokens per task and model for this run, from the call log (data/runs/calls-<date>.jsonl). */
function usageByTaskAndModel(since: string) {
  const rows = new Map<string, { calls: number; cached: number; failed: number; inTok: number; outTok: number }>();
  const dir = "data/runs";
  for (const f of fs.readdirSync(dir).filter((x) => x.startsWith("calls-") && x.endsWith(".jsonl"))) {
    for (const l of fs.readFileSync(path.join(dir, f), "utf8").split("\n")) {
      if (!l.trim()) continue;
      const r = JSON.parse(l);
      if (r.at < since || r.script !== "review") continue;
      const k = `${r.task}\t${r.model}`;
      const v = rows.get(k) ?? { calls: 0, cached: 0, failed: 0, inTok: 0, outTok: 0 };
      if (r.cached) v.cached++;
      else if (!r.ok) v.failed++;
      else v.calls++;
      v.inTok += r.inputTokens ?? 0;
      v.outTok += r.outputTokens ?? 0;
      rows.set(k, v);
    }
  }
  return [...rows.entries()].map(([k, v]) => ({ task: k.split("\t")[0], model: k.split("\t")[1], ...v })).sort((a, b) => a.task.localeCompare(b.task) || a.model.localeCompare(b.model));
}

async function main() {
  const t0 = Date.now();
  const since = new Date().toISOString();
  const args = parseArgs();
  const asked = [...args.deals, ...args.positional];
  checkIds("deal", asked, baseDeals().map((d) => d.id));
  const force = args.flags.has("force");
  const all = baseDeals().filter((d) => !asked.length || asked.includes(d.id));

  // Resumable: skip deals whose brief is complete and built from the current inputs.
  const skipped: string[] = [];
  const deals = all.filter((d) => {
    const b = existingBrief(d.id);
    if (!force && b && isComplete(b) && b.inputsHash === currentInputsHash(d.id)) {
      skipped.push(d.id);
      return false;
    }
    return true;
  });
  if (skipped.length) console.log(`already complete and current (skipped; --force to redo): ${skipped.join(", ")}`);
  if (!deals.length) return console.log("nothing to review");

  const inRun = new Set(deals.map((d) => d.id));
  const totals: Totals = { calls: 0, cached: 0, inTok: 0, outTok: 0 };
  const rows: string[] = [];
  const settled = new Set<string>();
  const ready = (d: Deal) => !d.endClientDealId || !inRun.has(d.endClientDealId) || settled.has(d.endClientDealId);
  const queue = [...deals].sort((a, b) => Number(!!a.endClientDealId) - Number(!!b.endClientDealId));
  let quotaStop: string | null = null;
  const local = (process.env.LLM_PROVIDER || "").toLowerCase() === "ollama";
  console.log(`reviewing ${deals.length} deal(s), ${CONCURRENCY} at a time, ${local ? "on the local model (no call spacing)" : `model calls spaced ${Number(process.env.LLM_MIN_INTERVAL_MS ?? 4000) / 1000}s apart`}`);

  await new Promise<void>((resolveAll) => {
    let running = 0;
    const pump = () => {
      while (!quotaStop && running < CONCURRENCY) {
        const idx = queue.findIndex(ready);
        if (idx < 0) break;
        const [d] = queue.splice(idx, 1);
        running++;
        void reviewOne(d, totals).then((r) => {
          if (r.line) rows.push(r.line);
          if (r.quota) quotaStop = r.quota;
          settled.add(d.id);
          running--;
          pump();
        });
      }
      if (running === 0 && (quotaStop || !queue.length)) resolveAll();
    };
    pump();
  });

  const seconds = Math.round((Date.now() - t0) / 1000);
  const usage = usageByTaskAndModel(since);
  console.log(`\n${rows.join("\n")}`);
  if (usage.length) {
    console.log(`\nTokens by task and model (this run):`);
    for (const u of usage) console.log(`  ${u.task.padEnd(10)} ${u.model.padEnd(28)} calls ${String(u.calls).padStart(3)} · cached ${String(u.cached).padStart(3)} · failed ${String(u.failed).padStart(2)} · in ${String(u.inTok).padStart(7)} · out ${String(u.outTok).padStart(7)}`);
  }
  console.log(`\nLLM calls ${totals.calls} (+${totals.cached} cached) · tokens in/out ${totals.inTok}/${totals.outTok} · ${seconds}s wall clock`);
  if (quotaStop) {
    const left = [...queue.map((d) => d.id)];
    console.log(`\n■ Stopped: ${quotaStop}.\n  Not yet reviewed: ${left.join(", ") || "(the deal in progress)"}. Re-run the same command after the reset (midnight Pacific); finished steps are cached.`);
    process.exitCode = 3;
  }
  writeJson(`runs/review-${since.slice(0, 19).replace(/[:T]/g, "-")}.json`, {
    deals: deals.map((d) => d.id),
    skipped,
    concurrency: CONCURRENCY,
    minIntervalMs: Number(process.env.LLM_MIN_INTERVAL_MS ?? 4000),
    seconds,
    quotaStop,
    ...totals,
    byTaskAndModel: usage,
    rows,
  });
}

main();

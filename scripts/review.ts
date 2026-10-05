/**
 * Phase 2: run the review pipeline and write the v1 brief per deal to data/briefs/<deal>.json
 * (committed, so the deployed app is instant and Vercel never runs the heavy jobs).
 *   npm run review              → all deals
 *   npm run review -- gulfcrown → one deal
 *
 * Unrelated deals run in parallel (REVIEW_CONCURRENCY, default 3: free tiers cap requests per minute).
 * A deal on AtliQ's own paper waits for the client deal it serves (Kriti → Rheinwerk, Marcus → Lakeshore,
 * Ortiz → Harrington), because its brief reads that deal's verdict (dependency finding) and contract
 * (flow-down check). A waiting deal never holds a slot an unrelated deal could use.
 */
import "./_env";
import fs from "node:fs";
import { baseDeals } from "../lib/data";
import { writeJson } from "../lib/config";
import { reviewDeal } from "../lib/review/pipeline";
import type { Deal } from "../lib/types";

const CONCURRENCY = Math.max(1, Number(process.env.REVIEW_CONCURRENCY || 3));

async function reviewOne(d: Deal, totals: { calls: number; cached: number; inTok: number; outTok: number }): Promise<string | null> {
  const t = Date.now();
  if (process.env.REVIEW_DRY) {
    // Scheduling check without model calls: REVIEW_DRY=1 npm run review
    console.log(`  start  ${d.id}${d.endClientDealId ? ` (after ${d.endClientDealId})` : ""}`);
    await new Promise((r) => setTimeout(r, 200 + Math.random() * 600));
    console.log(`  finish ${d.id}`);
    return null;
  }
  try {
    const brief = await reviewDeal(d.id, { trigger: "initial review", version: 1, log: (m) => console.log(`  [${d.id}] ${m}`) });
    // Never replace a complete brief with an incomplete one (e.g. a run that hit the model quota).
    const existing = fs.existsSync(`data/briefs/${d.id}.json`) ? JSON.parse(fs.readFileSync(`data/briefs/${d.id}.json`, "utf8")) : null;
    if (brief.errors.length && existing && !existing.errors.length) {
      writeJson(`briefs/failed/${d.id}.json`, brief);
      console.log(`  [${d.id}] ! kept the existing complete brief; incomplete run saved to data/briefs/failed/${d.id}.json`);
    } else {
      writeJson(`briefs/${d.id}.json`, brief);
      fs.rmSync(`data/briefs/failed/${d.id}.json`, { force: true }); // superseded by a complete run
    }
    totals.calls += brief.usage.calls;
    totals.cached += brief.usage.cachedCalls;
    totals.inTok += brief.usage.inputTokens;
    totals.outTok += brief.usage.outputTokens;
    const count = (s: string) => brief.findings.filter((f) => f.severity === s).length;
    const line = `${d.id.padEnd(13)} ${brief.verdict.padEnd(19)} ${count("blocker")}B ${count("high")}H ${count("medium")}M  ${((Date.now() - t) / 1000).toFixed(0)}s  ${brief.errors.length ? "ERR " + brief.errors.join(" | ").slice(0, 140) : ""}`;
    console.log(`✓ ${line}\n    ${brief.headline}\n    keys: ${brief.findings.map((f) => `${f.key}(${f.severity})`).join(", ")}`);
    return line;
  } catch (e) {
    console.log(`✗ ${d.id}: ${String(e)}`);
    process.exitCode = 1;
    return null;
  }
}

async function main() {
  const t0 = Date.now();
  const only = process.argv.slice(2);
  const deals = baseDeals().filter((d) => !only.length || only.includes(d.id));
  const inRun = new Set(deals.map((d) => d.id));
  const totals = { calls: 0, cached: 0, inTok: 0, outTok: 0 };
  const rows: string[] = [];
  const settled = new Set<string>(); // finished (success or failure): dependants may start
  const ready = (d: Deal) => !d.endClientDealId || !inRun.has(d.endClientDealId) || settled.has(d.endClientDealId);

  // Client deals first so their dependants unblock early.
  const queue = [...deals].sort((a, b) => Number(!!a.endClientDealId) - Number(!!b.endClientDealId));
  console.log(`reviewing ${deals.length} deal(s), up to ${CONCURRENCY} at a time`);

  await new Promise<void>((resolveAll) => {
    let running = 0;
    const pump = () => {
      while (running < CONCURRENCY) {
        const idx = queue.findIndex(ready);
        if (idx < 0) break; // empty, or only deals still waiting on their client deal
        const [d] = queue.splice(idx, 1);
        running++;
        void reviewOne(d, totals).then((line) => {
          if (line) rows.push(line);
          settled.add(d.id);
          running--;
          pump();
        });
      }
      if (!queue.length && running === 0) resolveAll();
    };
    pump();
  });

  const seconds = Math.round((Date.now() - t0) / 1000);
  console.log(`\n${rows.join("\n")}\n\nLLM calls ${totals.calls} (+${totals.cached} cached) · tokens in/out ${totals.inTok}/${totals.outTok} · ${seconds}s wall clock`);
  writeJson(`runs/review-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`, { deals: deals.map((d) => d.id), concurrency: CONCURRENCY, seconds, ...totals, rows });
}

main();

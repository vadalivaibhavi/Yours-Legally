/**
 * Phase 2: run the review pipeline and write the v1 brief per deal to data/briefs/<deal>.json
 * (committed, so the deployed app is instant and Vercel never runs the heavy jobs).
 *   npm run review              → all deals
 *   npm run review -- gulfcrown → one deal
 * Client deals run before the AtliQ-paper deals that depend on them (Kriti → Rheinwerk).
 */
import "./_env";
import { baseDeals } from "../lib/data";
import { writeJson } from "../lib/config";
import { reviewDeal } from "../lib/review/pipeline";

async function main() {
  const only = process.argv.slice(2);
  const deals = baseDeals()
    .filter((d) => !only.length || only.includes(d.id))
    .sort((a, b) => Number(!!a.endClientDealId) - Number(!!b.endClientDealId));
  const totals = { calls: 0, cached: 0, inTok: 0, outTok: 0 };
  const rows: string[] = [];
  for (const d of deals) {
    const t = Date.now();
    try {
      const brief = await reviewDeal(d.id, { trigger: "initial review", version: 1, log: (m) => console.log(`  · ${m}`) });
      writeJson(`briefs/${d.id}.json`, brief);
      totals.calls += brief.usage.calls;
      totals.cached += brief.usage.cachedCalls;
      totals.inTok += brief.usage.inputTokens;
      totals.outTok += brief.usage.outputTokens;
      const line = `${d.id.padEnd(13)} ${brief.verdict.padEnd(19)} ${brief.findings.filter((f) => f.severity === "blocker").length}B ${brief.findings.filter((f) => f.severity === "high").length}H ${brief.findings.filter((f) => f.severity === "medium").length}M  ${((Date.now() - t) / 1000).toFixed(0)}s  ${brief.errors.length ? "ERR " + brief.errors.join(" | ").slice(0, 140) : ""}`;
      rows.push(line);
      console.log(`✓ ${line}\n    ${brief.headline}\n    keys: ${brief.findings.map((f) => `${f.key}(${f.severity})`).join(", ")}`);
    } catch (e) {
      console.log(`✗ ${d.id}: ${String(e)}`);
      process.exitCode = 1;
    }
  }
  console.log(`\n${rows.join("\n")}\n\nLLM calls ${totals.calls} (+${totals.cached} cached) · tokens in/out ${totals.inTok}/${totals.outTok}`);
  writeJson(`runs/review-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`, { deals: deals.map((d) => d.id), ...totals, rows });
}

main();

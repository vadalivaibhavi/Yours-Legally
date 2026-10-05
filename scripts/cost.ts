/**
 * npm run cost: token totals from data/runs/ (every script run logs calls, tokens and time)
 * and from the committed briefs: the input for the Step 4 cost estimate (Build Plan §2).
 * Prices are placeholders: pass your provider's $/1M tokens as env vars.
 */
import fs from "node:fs";
import path from "node:path";

const IN = Number(process.env.PRICE_IN_PER_M ?? 0.3);
const OUT = Number(process.env.PRICE_OUT_PER_M ?? 2.5);

const runs = fs.readdirSync("data/runs").map((f) => ({ f, j: JSON.parse(fs.readFileSync(path.join("data/runs", f), "utf8")) }));
const reg = runs.filter((r) => r.f.startsWith("register-")).map((r) => r.j);
const firstReg = reg.reduce((best, r) => (r.inputTokens > (best?.inputTokens ?? 0) ? r : best), null as null | { inputTokens: number; outputTokens: number; documents: number; seconds: number });

const briefs = fs.readdirSync("data/briefs").map((f) => JSON.parse(fs.readFileSync(path.join("data/briefs", f), "utf8")));
const per = briefs.map((b) => ({ deal: b.dealId, route: b.route, docs: b.documentIds.length, in: b.usage.inputTokens, out: b.usage.outputTokens, calls: b.usage.calls + b.usage.cachedCalls }));

const usd = (i: number, o: number) => (i / 1e6) * IN + (o / 1e6) * OUT;
console.log(`Prices used: $${IN}/1M input, $${OUT}/1M output (override with PRICE_IN_PER_M / PRICE_OUT_PER_M)\n`);
if (firstReg) console.log(`Register build (one-off, ${firstReg.documents} signed docs): ${firstReg.inputTokens} in / ${firstReg.outputTokens} out tokens ≈ $${usd(firstReg.inputTokens, firstReg.outputTokens).toFixed(3)} · ${firstReg.seconds}s`);
console.log(`\nPer-deal review (tokens from the run that produced the committed brief; 0 = fully cached):`);
for (const p of per) console.log(`  ${p.deal.padEnd(13)} ${p.route.padEnd(14)} docs ${p.docs} · calls ${String(p.calls).padStart(2)} · ${String(p.in).padStart(7)} in / ${String(p.out).padStart(6)} out ≈ $${usd(p.in, p.out).toFixed(4)}`);
const measured = per.filter((p) => p.in > 0);
if (measured.length) {
  const avgIn = measured.reduce((s, p) => s + p.in, 0) / measured.length;
  const avgOut = measured.reduce((s, p) => s + p.out, 0) / measured.length;
  console.log(`\nAverage per reviewed deal: ${Math.round(avgIn)} in / ${Math.round(avgOut)} out ≈ $${usd(avgIn, avgOut).toFixed(4)}`);
  console.log(`At ~9 contracts/month: ≈ $${(9 * usd(avgIn, avgOut)).toFixed(2)}/month; at 20/month: ≈ $${(20 * usd(avgIn, avgOut)).toFixed(2)}/month (model cost only)`);
}

/**
 * npm run cost: what the model calls cost, from the per-call log (data/runs/calls-<date>.jsonl: provider,
 * model, task, deal, input/output tokens) and, for runs before that log existed, the committed briefs.
 * The cost estimate for the demo must come from the demo provider (Groq):
 *   npm run cost                      → the current LLM_PROVIDER
 *   npm run cost -- --provider groq   → one provider's calls (log lines without a provider are Gemini)
 *   npm run cost -- --since 2026-10-06
 *   npm run cost -- --deal kriti
 * Prices: $/1M tokens per model below (Groq list prices, Oct 2026; Gemini placeholders). Unknown models
 * use PRICE_IN_PER_M / PRICE_OUT_PER_M.
 */
import "./_env";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "./_args";

const PRICES: Record<string, { in: number; out: number }> = {
  "openai/gpt-oss-120b": { in: 0.15, out: 0.6 },
  "openai/gpt-oss-20b": { in: 0.075, out: 0.3 },
};
const FALLBACK = { in: Number(process.env.PRICE_IN_PER_M ?? 0.3), out: Number(process.env.PRICE_OUT_PER_M ?? 2.5) };
const price = (model: string) => PRICES[model] ?? FALLBACK;
const usd = (model: string, i: number, o: number) => (i / 1e6) * price(model).in + (o / 1e6) * price(model).out;

const args = parseArgs();
const flag = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
};
const prov = (flag("provider") ?? process.env.LLM_PROVIDER ?? "gemini").toLowerCase();
const since = flag("since") ?? "";
const deals = args.deals;

type Call = { at: string; provider?: string; script?: string; dealId?: string; caseId?: string; task: string; model: string; inputTokens: number; outputTokens: number; ms: number; cached: boolean; ok: boolean };
const calls: Call[] = fs
  .readdirSync("data/runs")
  .filter((f) => f.startsWith("calls-") && f.endsWith(".jsonl"))
  .flatMap((f) => fs.readFileSync(path.join("data/runs", f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Call))
  .filter((c) => (c.provider ?? "gemini") === prov && c.at >= since && !c.cached && (!deals.length || deals.includes(c.dealId ?? "")));

console.log(`Provider ${prov}${since ? ` · since ${since}` : ""}${deals.length ? ` · deals ${deals.join(", ")}` : ""} · ${calls.length} billed calls in the call log (cache hits are free and excluded)\n`);

if (calls.length) {
  // By script and model
  const groups = new Map<string, { n: number; inT: number; outT: number; usd: number }>();
  for (const c of calls) {
    const k = `${(c.script ?? "app").padEnd(8)} ${c.model}`;
    const g = groups.get(k) ?? { n: 0, inT: 0, outT: 0, usd: 0 };
    g.n++;
    g.inT += c.inputTokens;
    g.outT += c.outputTokens;
    g.usd += usd(c.model, c.inputTokens, c.outputTokens);
    groups.set(k, g);
  }
  console.log("By script and model:");
  for (const [k, g] of [...groups].sort()) console.log(`  ${k.padEnd(40)} calls ${String(g.n).padStart(4)} · ${String(g.inT).padStart(9)} in / ${String(g.outT).padStart(8)} out ≈ $${g.usd.toFixed(4)}`);
  const total = calls.reduce((s, c) => s + usd(c.model, c.inputTokens, c.outputTokens), 0);
  console.log(`  ${"total".padEnd(40)} ≈ $${total.toFixed(4)}\n`);

  // Per deal: the most recent review run of each deal (a full, uncached review is the real per-contract cost)
  const reviews = calls.filter((c) => c.script === "review" && c.dealId);
  const byDeal = new Map<string, Call[]>();
  for (const c of reviews) byDeal.set(c.dealId!, [...(byDeal.get(c.dealId!) ?? []), c]);
  if (byDeal.size) {
    console.log("Per-deal review (billed calls only; a deal reviewed partly from cache shows only the new calls):");
    const per = [...byDeal].map(([deal, cs]) => ({ deal, n: cs.length, inT: cs.reduce((s, c) => s + c.inputTokens, 0), outT: cs.reduce((s, c) => s + c.outputTokens, 0), usd: cs.reduce((s, c) => s + usd(c.model, c.inputTokens, c.outputTokens), 0), secs: cs.reduce((s, c) => s + c.ms, 0) / 1000 }));
    for (const p of per.sort((a, b) => a.deal.localeCompare(b.deal))) console.log(`  ${p.deal.padEnd(13)} calls ${String(p.n).padStart(3)} · ${String(p.inT).padStart(8)} in / ${String(p.outT).padStart(7)} out ≈ $${p.usd.toFixed(4)} · ${p.secs.toFixed(0)}s of model time`);
    const avg = per.reduce((s, p) => s + p.usd, 0) / per.length;
    console.log(`\nAverage per reviewed deal ≈ $${avg.toFixed(4)} → ~9 contracts/month ≈ $${(9 * avg).toFixed(2)}, 20/month ≈ $${(20 * avg).toFixed(2)} (model cost only; embeddings are Gemini free tier)`);
  }
} else if (prov === "gemini") {
  // Before the call log existed: fall back to the token counts stored in the committed briefs.
  const briefs = fs.readdirSync("data/briefs").filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join("data/briefs", f), "utf8")));
  const measured = briefs.filter((b) => b.usage.inputTokens > 0 && (!deals.length || deals.includes(b.dealId)));
  console.log("From the committed briefs (the run that produced each brief; Gemini placeholder prices):");
  for (const b of measured) console.log(`  ${b.dealId.padEnd(13)} ${b.usage.inputTokens} in / ${b.usage.outputTokens} out ≈ $${usd("", b.usage.inputTokens, b.usage.outputTokens).toFixed(4)}`);
} else {
  console.log(`No billed ${prov} calls logged yet. Run the evals / pre-warm the briefs on ${prov} first (see README "Switching to Groq").`);
}

// One-off register build (Gemini, before the call log): from its run summary.
const reg = fs
  .readdirSync("data/runs")
  .filter((f) => f.startsWith("register-") && f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join("data/runs", f), "utf8")) as { inputTokens: number; outputTokens: number; documents: number; seconds: number })
  .reduce((best, r) => (r.inputTokens > (best?.inputTokens ?? 0) ? r : best), null as null | { inputTokens: number; outputTokens: number; documents: number; seconds: number });
if (reg && prov === "gemini") console.log(`\nRegister build (one-off, ${reg.documents} signed docs): ${reg.inputTokens} in / ${reg.outputTokens} out ≈ $${usd("", reg.inputTokens, reg.outputTokens).toFixed(3)} · ${reg.seconds}s`);

/**
 * npm run consistency: the same deals reviewed several times with fresh model answers (LLM_CACHE=off, so the
 * cache the stored briefs rely on is untouched). Reports how stable the verdict, the counted findings
 * (blocker/high) and the deal's eval case are across runs. Uses an in-memory state, like the eval.
 *   npm run consistency                              → travelhub, datavane, kriti, loopmart × 3
 *   npm run consistency -- --deal harrington --runs=2
 *   npm run consistency -- --force                   → redo runs already recorded
 * Resumable: each finished run is saved to eval/consistency[-ollama].json at once; a run stopped by the daily
 * quota is simply not recorded, so the next day's command carries on from there.
 * A run where a step failed (e.g. the provider's 503 "high demand") comes out HOLD by design and measures
 * reliability, not consistency: it is kept and reported apart, and the deal gets another run (up to 3 extra)
 * so the agreement numbers rest on complete runs.
 */
import "./_env";
import fs from "node:fs";
import { checkIds, parseArgs } from "./_args";
import { checkFindings } from "./_grade";
import { readJson } from "../lib/config";
import { baseDeals } from "../lib/data";
import { isQuotaExhausted, provider, withRunContext } from "../lib/llm";
import { effectiveBrief } from "../lib/review/effective";
import { reviewDeal } from "../lib/review/pipeline";
import type { Finding } from "../lib/review/types";
import { useMemoryState } from "../lib/store";
import type { EvalCase } from "../lib/types";

type Run = { at: string; verdict: string; counted: string[]; casePass: boolean | null; problems: string[]; errors: string[]; ms: number };
type Spec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const args = parseArgs();
const runs = Number([...args.flags].find((f) => f.startsWith("runs="))?.slice(5) ?? 3);
const dealIds = args.deals.length ? args.deals : ["travelhub", "datavane", "kriti", "loopmart"];
checkIds("deal", dealIds, baseDeals().map((d) => d.id));
const NAME = provider() === "gemini" ? "consistency" : `consistency-${provider()}`;
const file = `eval/${NAME}.json`;
const cases = readJson<{ cases: (EvalCase & { spec: Spec })[] }>("../eval/cases.json").cases.filter((c) => c.spec.kind === "review" && c.spec.expectedVerdict);

const counted = (f: Finding) => f.severity === "blocker" || f.severity === "high";

async function main() {
  useMemoryState();
  process.env.LLM_CACHE = "off";
  const store: Record<string, Run[]> = fs.existsSync(file) && !args.flags.has("force") ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  console.log(`${provider()}: ${dealIds.join(", ")} × ${runs} (fresh answers, cache untouched)`);
  outer: for (const id of dealIds) {
    const c = cases.find((x) => x.spec.dealId === id);
    const complete = () => (store[id] ?? []).filter((r) => !r.errors.length).length;
    for (let i = (store[id] ?? []).length; complete() < runs && i < runs + 3; i++) {
      const t0 = Date.now();
      try {
        const b = await withRunContext({ script: "consistency", dealId: id, caseId: `run${i + 1}` }, () => reviewDeal(id, { trigger: "consistency", version: i + 1, withoutSimilar: true }));
        const e = effectiveBrief(b, null);
        const problems = c ? checkFindings(e, c.spec) : [];
        if (c && e.verdict !== c.spec.expectedVerdict) problems.unshift(`verdict ${e.verdict} ≠ ${c.spec.expectedVerdict}`);
        const run: Run = { at: new Date().toISOString(), verdict: e.verdict, counted: e.findings.filter(counted).map((f) => f.key).sort(), casePass: c ? !problems.length : null, problems, errors: b.errors, ms: Date.now() - t0 };
        (store[id] ??= []).push(run);
        fs.writeFileSync(file, JSON.stringify(store, null, 2));
        console.log(`${id} run ${i + 1}: ${run.verdict} · ${run.counted.length} counted · ${c ? (run.casePass ? `${c.id} pass` : `${c.id} FAIL (${problems.join("; ")})`) : "no case"}${b.errors.length ? ` · ${b.errors.length} step errors` : ""} · ${Math.round(run.ms / 1000)} s`);
      } catch (err) {
        if (!isQuotaExhausted(err)) throw err;
        console.log(`stopped: ${(err as Error).message}. Run the same command tomorrow to carry on.`);
        process.exitCode = 3;
        break outer;
      }
    }
  }
  report(store);
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a), B = new Set(b);
  const union = new Set([...A, ...B]).size;
  return union ? [...A].filter((x) => B.has(x)).length / union : 1;
}

function report(store: Record<string, Run[]>) {
  const rows: string[] = [];
  let verdictSame = 0, total = 0, failed = 0, failedSafe = 0, attempts = 0;
  for (const id of dealIds) {
    const all = store[id] ?? [];
    const rs = all.filter((r) => !r.errors.length); // complete runs only: a failed step is reliability, not judgment
    failed += all.length - rs.length;
    failedSafe += all.filter((r) => r.errors.length && r.verdict === "HOLD").length;
    attempts += all.length;
    if (!rs.length) continue;
    const c = cases.find((x) => x.spec.dealId === id);
    const tally = new Map<string, number>();
    for (const r of rs) tally.set(r.verdict, (tally.get(r.verdict) ?? 0) + 1);
    const [mode, n] = [...tally].sort((a, b) => b[1] - a[1])[0];
    const pairs: number[] = [];
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) pairs.push(jaccard(rs[i].counted, rs[j].counted));
    const overlap = pairs.length ? pairs.reduce((s, x) => s + x, 0) / pairs.length : 1;
    const always = rs[0].counted.filter((k) => rs.every((r) => r.counted.includes(k)));
    const sometimes = [...new Set(rs.flatMap((r) => r.counted))].filter((k) => !always.includes(k));
    verdictSame += n;
    total += rs.length;
    rows.push(
      `| ${id} | ${c?.id ?? "–"} | ${rs.length}${all.length > rs.length ? ` (+${all.length - rs.length} with a failed step)` : ""} | ${rs.map((r) => r.verdict).join(" · ")} | ${n}/${rs.length} ${mode} | ${Math.round(overlap * 100)}% | ${sometimes.length ? sometimes.join(", ") : "none"} | ${c ? `${rs.filter((r) => r.casePass).length}/${rs.length}` : "–"} |`,
    );
  }
  const md = [
    `# Consistency (${provider()})`,
    "",
    `Same deals, fresh model answers each run (\`npm run consistency\`). Written ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`,
    "",
    `**Verdict agreement: ${verdictSame}/${total} complete runs give their deal's most common verdict.** Counted findings = blocker and high (what moves the verdict); overlap = average Jaccard between runs.`,
    "",
    `**Reliability:** ${failed} of ${attempts} runs had a step fail (the provider's overload / timeouts); ${failedSafe} of those came out HOLD, i.e. never a clean verdict on a partial review. They are left out of the agreement numbers.`,
    "",
    "| Deal | Case | Runs | Verdicts | Agreement | Counted-findings overlap | Found only in some runs | Case passes |",
    "|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
  fs.writeFileSync(`eval/${NAME}.md`, md);
  console.log(`\n${md}`);
}

main();

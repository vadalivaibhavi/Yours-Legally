/**
 * The whole evaluation, in order. Two entry points:
 *   npm run check     → everything that needs no review-model call (typecheck, upload detection, file reading,
 *                       the eval on the stored briefs incl. guardrails and finding grades, held-out grading).
 *                       Fast and free: run it on every change. Needs a Gemini key only for query embeddings
 *                       (similar clauses) and the 2 OCR scans, which are cached after the first run.
 *   npm run eval:all  → the model batch, each step resumable: stale briefs regenerated → full eval (version
 *                       pairs, injection end-to-end) → consistency (complete runs) → held-out register →
 *                       held-out reviews → held-out grading → cost. On the free tier it stops at the daily
 *                       quota; run the same command the next day and it carries on where it stopped.
 *   npm run eval:masked → FR-26: masked reviews of every deal, the masked eval, and EV-M3 (within 2 cases of unmasked).
 * Prints one summary table; exit code 3 = stopped by the quota (resume tomorrow), 1 = a check failed.
 */
import { spawn } from "node:child_process";
import path from "node:path";

/** summary: the line of the step's output shown in the table. */
type Step = { name: string; cmd: string[]; model: boolean; summary?: RegExp };
const tsx = (script: string, ...args: string[]) => [path.join("node_modules", "tsx", "dist", "cli.mjs"), `scripts/${script}.ts`, ...args];

const CHECK: Step[] = [
  { name: "masking (FR-26): leaks and round trips", cmd: tsx("checkMask"), model: false, summary: /EV-M1 leaks: \d+.*/ },
  // Next's page types (PageProps, RouteContext) are generated into .next/, which a fresh clone or CI doesn't have.
  { name: "page types (next typegen)", cmd: [path.join("node_modules", "next", "dist", "bin", "next"), "typegen"], model: false },
  { name: "typecheck", cmd: [path.join("node_modules", "typescript", "bin", "tsc"), "--noEmit"], model: false },
  { name: "upload detection", cmd: tsx("checkUploadDetect"), model: false, summary: /all correct|\d+ wrong/ },
  { name: "file reading (PDF / Word / scans)", cmd: tsx("checkFileRead"), model: false, summary: /all files read back|\d+ file\(s\) below their bar/ },
  { name: "eval on stored briefs (no version pairs)", cmd: tsx("eval", "--no-versions", "--no-write"), model: false, summary: /This run: .+/ },
  { name: "held-out grading", cmd: tsx("evalHoldout"), model: false, summary: /\*\*Verdicts [^*]+/ },
];
/** FR-26 EV-M3/M4: every deal reviewed with masking on, then the eval on the masked briefs (a full run of model calls). */
const MASKED: Step[] = [
  { name: "masking check (free)", cmd: tsx("checkMask"), model: false, summary: /EV-M1 leaks: \d+.*/ },
  { name: "masked reviews (13 deals, MASKING=on)", cmd: tsx("masked", "review"), model: true, summary: /LLM calls .+/ },
  { name: "masked eval (eval/results-masked.md)", cmd: tsx("masked", "eval"), model: true, summary: /This run: .+/ },
  { name: "EV-M3 / EV-M4 against the unmasked run", cmd: tsx("eval", "--no-versions", "--no-write"), model: false, summary: /EV-M3 [^\n]+/ },
];
const ALL: Step[] = [
  { name: "regenerate stale briefs", cmd: tsx("review"), model: true, summary: /LLM calls .+/ },
  { name: "full eval (version pairs, injection e2e)", cmd: tsx("eval"), model: true, summary: /This run: .+/ },
  { name: "consistency (4 deals × 3 complete runs)", cmd: tsx("consistency"), model: true, summary: /\*\*Verdict agreement: [^*]+/ },
  { name: "held-out register (10 new contracts)", cmd: tsx("holdout", "buildRegister"), model: true },
  { name: "held-out reviews (10 deals)", cmd: tsx("holdout", "review"), model: true, summary: /LLM calls .+/ },
  { name: "held-out grading", cmd: tsx("evalHoldout"), model: false, summary: /\*\*Verdicts [^*]+/ },
  { name: "cost and latency", cmd: tsx("cost", "--provider", "gemini"), model: false, summary: /Average per reviewed deal[^\n]+/ },
];

function run(step: Step): Promise<{ code: number; quota: boolean; tail: string }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, step.cmd, { stdio: ["ignore", "pipe", "pipe"] });
    let tail = "";
    const keep = (b: Buffer) => {
      const s = b.toString();
      process.stdout.write(s);
      tail = (tail + s).slice(-40000);
    };
    p.stdout.on("data", keep);
    p.stderr.on("data", keep);
    p.on("close", (code) => resolve({ code: code ?? 1, quota: code === 3 || /daily quota reached/i.test(tail), tail }));
  });
}

const summaryLine = (s: Step, tail: string) => (s.summary ? (tail.match(new RegExp(s.summary.source, "g")) ?? []).slice(-1)[0]?.replace(/\*/g, "").trim() ?? "" : "");

async function main() {
  const mode = process.argv[2] === "all" ? "all" : process.argv[2] === "masked" ? "masked" : "check";
  const steps = mode === "all" ? ALL : mode === "masked" ? MASKED : CHECK;
  const rows: string[] = [];
  let exit = 0;
  for (const s of steps) {
    console.log(`\n━━ ${s.name} ━━`);
    const t0 = Date.now();
    const r = await run(s);
    const secs = Math.round((Date.now() - t0) / 1000);
    const status = r.quota ? "STOPPED (quota)" : r.code === 0 ? "ok" : "FAILED";
    rows.push(`${status.padEnd(16)} ${s.name.padEnd(44)} ${String(secs).padStart(5)} s  ${summaryLine(s, r.tail)}`);
    if (r.quota) {
      exit = 3;
      rows.push(`${"".padEnd(16)} … the remaining steps wait for tomorrow's quota: run npm run eval:${mode} again`);
      break;
    }
    if (r.code !== 0) exit = exit || 1;
  }
  console.log(`\n━━ summary (npm run ${mode === "check" ? "check" : `eval:${mode}`}) ━━\n${rows.join("\n")}`);
  process.exitCode = exit;
}

main();

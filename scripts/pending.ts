/**
 * npm run pending: rebuilds the auto-detected part of docs/Pending_Work.md from the committed briefs and
 * the last eval run, so the list of work blocked by model quota or tooling stays accurate.
 * Everything between the AUTO markers is regenerated; the rest of the file is kept as written.
 *   npm run pending                 → regenerate the tracker
 *   npm run pending -- --deal kriti → print what's pending for one deal (the tracker file is not touched)
 */
import fs from "node:fs";
import path from "node:path";
import { checkIds, parseArgs } from "./_args";

type Brief = {
  dealId: string;
  createdAt: string;
  playbookVersion: string;
  models: string[];
  errors: string[];
  similar: { hits: { differs: string }[] }[];
};

const FILE = "docs/Pending_Work.md";
const START = "<!-- AUTO:START -->";
const END = "<!-- AUTO:END -->";

const args = parseArgs();
const only = [...args.deals, ...args.positional];
const allBriefs: Brief[] = fs
  .readdirSync("data/briefs")
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join("data/briefs", f), "utf8")));
checkIds("deal", only, allBriefs.map((b) => b.dealId));
const briefs = allBriefs.filter((b) => !only.length || only.includes(b.dealId));
const playbook = JSON.parse(fs.readFileSync("data/playbook.json", "utf8")).version as string;

const rows: string[] = [];
const missingDiffers = briefs
  .map((b) => {
    const hits = b.similar.flatMap((p) => p.hits);
    return { deal: b.dealId, empty: hits.filter((h) => !h.differs).length, total: hits.length };
  })
  .filter((x) => x.empty > 0);
if (missingDiffers.length)
  rows.push(
    `| Comparison lines ("Worse for AtliQ than …") missing | ${missingDiffers.map((x) => `${x.deal} (${x.empty}/${x.total})`).join(", ")} | model quota ran out during the regeneration | \`npm run review\` (resumes: complete deals are skipped, finished calls are cached; one deal: \`--deal ${missingDiffers[0].deal}\`) |`,
  );
const withErrors = briefs.filter((b) => b.errors.length);
if (withErrors.length) rows.push(`| Brief steps that couldn't complete ("review manually") | ${withErrors.map((b) => `${b.dealId}: ${b.errors.map((e) => e.split(" (")[0]).join("; ")}`).join(" · ")} | model quota / overload | \`npm run review -- --deal ${withErrors.map((b) => b.dealId).join(",")}\` |`);
const stalePlaybook = briefs.filter((b) => b.playbookVersion !== playbook);
if (stalePlaybook.length) rows.push(`| Briefs on an older playbook than ${playbook} | ${stalePlaybook.map((b) => `${b.dealId} (${b.playbookVersion})`).join(", ")} | re-run blocked by quota | \`npm run review -- --deal ${stalePlaybook.map((b) => b.dealId).join(",")}\` |`);
const failedDir = "data/briefs/failed";
const failed = fs.existsSync(failedDir) ? fs.readdirSync(failedDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", "")).filter((d) => !only.length || only.includes(d)) : [];
if (failed.length) rows.push(`| Re-runs that failed and were set aside (the previous complete brief was kept) | ${failed.join(", ")} | model quota | re-run those deals; then delete \`data/briefs/failed/\` |`);

let evalLine = "No eval results yet: run `npm run eval`.";
if (fs.existsSync("eval/results.json")) {
  const ev = JSON.parse(fs.readFileSync("eval/results.json", "utf8")) as { at: string; results: { id: string; pass: boolean | null; status?: string; detail: string }[] };
  // Older result files have no status: derive it from pass.
  const st = (r: (typeof ev.results)[number]) => r.status ?? (r.pass === null ? "skip" : r.pass ? "pass" : "fail");
  const ids = (s: string) => ev.results.filter((r) => st(r) === s).map((r) => r.id);
  evalLine = `Last eval run ${ev.at.slice(0, 16).replace("T", " ")} UTC: ${ids("pass").length} passed, ${ids("fail").length} failed (${ids("fail").join(", ") || "none"}), ${ids("quota").length} not run because of quota${ids("quota").length ? ` (${ids("quota").join(", ")}: re-run with \`npm run eval -- --case ${ids("quota").join(",")}\`)` : ""}, ${ids("skip").length} skipped (${ids("skip").join(", ")}).`;
}

const auto = [
  START,
  `_Regenerated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC by \`npm run pending\` from data/briefs and eval/results.json._`,
  "",
  rows.length ? ["| What | Where | Why it's pending | How to clear it |", "|---|---|---|---|", ...rows].join("\n") : "Nothing auto-detected: every brief is complete, current and has its comparison lines.",
  "",
  evalLine,
  END,
].join("\n");

if (only.length) {
  console.log(rows.length ? rows.join("\n") : `Nothing pending for ${only.join(", ")}.`);
  process.exit(0);
}

const current = fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8") : "";
const next = current.includes(START) ? current.replace(new RegExp(`${START}[\\s\\S]*?${END}`), auto) : `${current}\n${auto}\n`;
fs.writeFileSync(FILE, next);
console.log(auto);

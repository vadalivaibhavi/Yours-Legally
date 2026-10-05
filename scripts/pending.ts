/**
 * npm run pending: rebuilds the auto-detected part of docs/Pending_Work.md from the committed briefs and
 * the last eval run, so the list of work blocked by model quota or tooling stays accurate.
 * Everything between the AUTO markers is regenerated; the rest of the file is kept as written.
 */
import fs from "node:fs";
import path from "node:path";

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

const briefs: Brief[] = fs
  .readdirSync("data/briefs")
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join("data/briefs", f), "utf8")));
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
    `| Comparison lines ("Worse for AtliQ than …") missing | ${missingDiffers.map((x) => `${x.deal} (${x.empty}/${x.total})`).join(", ")} | model quota ran out during the regeneration | \`npm run review\` (only the missing lines call the model; everything else is cached) |`,
  );
const withErrors = briefs.filter((b) => b.errors.length);
if (withErrors.length) rows.push(`| Brief steps that couldn't complete ("review manually") | ${withErrors.map((b) => `${b.dealId}: ${b.errors.map((e) => e.split(" (")[0]).join("; ")}`).join(" · ")} | model quota / overload | \`npm run review -- ${withErrors.map((b) => b.dealId).join(" ")}\` |`);
const stalePlaybook = briefs.filter((b) => b.playbookVersion !== playbook);
if (stalePlaybook.length) rows.push(`| Briefs on an older playbook than ${playbook} | ${stalePlaybook.map((b) => `${b.dealId} (${b.playbookVersion})`).join(", ")} | re-run blocked by quota | \`npm run review -- ${stalePlaybook.map((b) => b.dealId).join(" ")}\` |`);
const failedDir = "data/briefs/failed";
const failed = fs.existsSync(failedDir) ? fs.readdirSync(failedDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", "")) : [];
if (failed.length) rows.push(`| Re-runs that failed and were set aside (the previous complete brief was kept) | ${failed.join(", ")} | model quota | re-run those deals; then delete \`data/briefs/failed/\` |`);

let evalLine = "No eval results yet: run `npm run eval`.";
if (fs.existsSync("eval/results.json")) {
  const ev = JSON.parse(fs.readFileSync("eval/results.json", "utf8")) as { at: string; results: { id: string; pass: boolean | null; detail: string }[] };
  const skipped = ev.results.filter((r) => r.pass === null);
  const failedCases = ev.results.filter((r) => r.pass === false);
  evalLine = `Last eval run ${ev.at.slice(0, 16).replace("T", " ")} UTC: ${ev.results.filter((r) => r.pass).length} passed, ${failedCases.length} failed (${failedCases.map((r) => r.id).join(", ") || "none"}), ${skipped.length} skipped (${skipped.map((r) => r.id).join(", ")}).`;
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

const current = fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8") : "";
const next = current.includes(START) ? current.replace(new RegExp(`${START}[\\s\\S]*?${END}`), auto) : `${current}\n${auto}\n`;
fs.writeFileSync(FILE, next);
console.log(auto);

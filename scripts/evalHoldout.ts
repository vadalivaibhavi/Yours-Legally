/**
 * npm run holdout:eval: the held-out set (DATA_PROFILE=holdout), graded against eval/holdout_cases.json, which
 * was written from the SYN answer key before any held-out review ran. No model calls: it grades the briefs
 * in data/holdout/briefs (npm run holdout:review) and the register in data/holdout/register.json
 * (npm run holdout:register).
 * Reports item-level numbers, not only pass/fail per deal: verdict accuracy, conflict recall (each signed
 * contract a conflict must cite), playbook/entity recall, false alarms on the clean draft, and the register
 * key (type, end date, expiry, affiliates). Writes eval/holdout-results.md + .json.
 */
import "./_env";
process.env.DATA_PROFILE = "holdout";
import fs from "node:fs";
import path from "node:path";
import { matches } from "./_grade";
import { briefsDir, readJson } from "../lib/config";
import { provider } from "../lib/llm";
import { registerEntries } from "../lib/register";
import { effectiveBrief } from "../lib/review/effective";
import type { Brief, EffectiveBrief, Finding } from "../lib/review/types";
import { SEVERITY_RANK } from "../lib/review/types";
import { useMemoryState } from "../lib/store";

type HCase = { id: string; answerKey: string; dealId: string; expectedVerdict: string; why: string; mustCite: string[]; mustFind: string[]; mustNotCite?: string[]; mustNotFlag?: string[] };
type RegKey = { id: string; docId: string; types: string[]; end?: string; perpetual?: boolean; expired?: boolean; affiliates?: boolean };
const spec = readJson<{ cases: HCase[]; register: { entries: RegKey[] }; changes: unknown[] }>("../eval/holdout_cases.json");
type Label = { label: "correct" | "partly" | "duplicate" | "noise" | "wrong"; severity: "ok" | "too_high" | "too_low"; note: string };
const labels = readJson<{ labels: Record<string, Record<string, Label>> }>("../eval/holdout_finding_labels.json", { labels: {} }).labels;

const counted = (f: Finding) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK.high;
const cites = (f: Finding, docId: string) => f.key.includes(docId) || f.citations.some((c) => c.docId === docId) || f.registerEntryId?.startsWith(docId);
const anyOf = (e: EffectiveBrief, pattern: string) => pattern.split("|").some((p) => e.findings.some((f) => matches(f, p)));

function main() {
  useMemoryState();
  const rows: string[] = [];
  const out: Record<string, unknown>[] = [];
  let verdictOk = 0, graded = 0, citeHit = 0, citeAll = 0, findHit = 0, findAll = 0, falseAlarms = 0;
  const tally: Record<string, number> = { correct: 0, partly: 0, duplicate: 0, noise: 0, wrong: 0 };
  let sevOff = 0;
  const ungraded: string[] = [];
  let missedPointed = 0, missedAll = 0;
  const pointed: string[] = [];
  for (const c of spec.cases) {
    const p = path.join("data", briefsDir(), `${c.dealId}.json`);
    if (!fs.existsSync(p)) {
      rows.push(`| ${c.id} | ${c.dealId} | ${c.expectedVerdict} | not reviewed yet | | | |`);
      out.push({ id: c.id, reviewed: false });
      continue;
    }
    graded++;
    const b = JSON.parse(fs.readFileSync(p, "utf8")) as Brief;
    const e = effectiveBrief(b, null);
    const vOk = e.verdict === c.expectedVerdict;
    if (vOk) verdictOk++;
    const citeRes = c.mustCite.map((d) => ({ d, ok: e.findings.some((f) => counted(f) && cites(f, d)) }));
    const findRes = c.mustFind.map((k) => ({ k, ok: anyOf(e, k) }));
    const alarms = [
      ...(c.mustNotCite ?? []).flatMap((d) => e.findings.filter((f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK.medium && cites(f, d)).map((f) => `${f.key} (${f.severity})`)),
      ...(c.mustNotFlag ?? []).flatMap((k) => e.findings.filter((f) => matches(f, k)).map((f) => `${f.key} (${f.severity})`)),
    ];
    for (const f of e.findings) {
      const l = labels[c.dealId]?.[f.key];
      if (!l) ungraded.push(`${c.dealId}:${f.key}`);
      else {
        tally[l.label]++;
        if (l.severity !== "ok") sevOff++;
      }
    }
    // A conflict the check missed: does the brief's "check by hand" list (lib/review/unchecked.ts) point at that contract?
    for (const x of citeRes.filter((r) => !r.ok)) {
      missedAll++;
      if (e.unchecked.items.some((u) => u.sourceDocId === x.d)) {
        missedPointed++;
        pointed.push(`${c.dealId} → ${x.d}`);
      }
    }
    citeHit += citeRes.filter((x) => x.ok).length;
    citeAll += citeRes.length;
    findHit += findRes.filter((x) => x.ok).length;
    findAll += findRes.length;
    falseAlarms += new Set(alarms).size;
    const pass = vOk && citeRes.every((x) => x.ok) && findRes.every((x) => x.ok) && !alarms.length;
    const fmt = (xs: { ok: boolean }[], name: (x: never) => string) => (xs.length ? xs.map((x) => `${x.ok ? "✓" : "✗"} ${name(x as never)}`).join(", ") : "–");
    rows.push(
      `| ${c.id} | ${c.dealId} | ${c.expectedVerdict} | ${vOk ? "✓" : "✗"} ${e.verdict} | ${fmt(citeRes, (x: { d: string }) => x.d)} | ${fmt(findRes, (x: { k: string }) => x.k)} | ${alarms.length ? [...new Set(alarms)].join(", ") : "none"} | ${pass ? "**pass**" : "fail"}${b.errors.length ? ` (${b.errors.length} step errors)` : ""} |`,
    );
    out.push({ id: c.id, dealId: c.dealId, expected: c.expectedVerdict, verdict: e.verdict, pass, cites: citeRes, finds: findRes, alarms, errors: b.errors, findings: e.findings.map((f) => ({ key: f.key, severity: f.severity, title: f.title })) });
  }

  // Register key: one entry per signed SYN contract with an acceptable type, the right end date / expiry, and affiliates.
  const reg = registerEntries();
  const regRows: string[] = [];
  let regOk = 0;
  for (const k of spec.register.entries) {
    const es = reg.filter((r) => r.sourceDocId === k.docId);
    const main = es.find((r) => k.types.includes(r.type));
    const checks: [string, boolean][] = [
      ["found", !!main],
      ...(k.end ? [[`end ${k.end}`, es.some((r) => k.types.includes(r.type) && r.end === k.end)] as [string, boolean]] : []),
      ...(k.perpetual ? [["perpetual", es.some((r) => k.types.includes(r.type) && r.perpetual)] as [string, boolean]] : []),
      ...(k.expired ? [["expired", !!main && main.status === "expired"] as [string, boolean]] : []),
      ...(k.affiliates ? [["binds both entities", !!main && main.bindsEntities.length === 2] as [string, boolean]] : []),
    ];
    const ok = checks.every(([, v]) => v);
    if (ok) regOk++;
    regRows.push(`| ${k.id} | ${k.docId} | ${k.types.join(" / ")} | ${es.length ? es.map((r) => `${r.type}${r.end ? ` → ${r.end}` : r.perpetual ? " (perpetual)" : ""}`).join(", ") : "none"} | ${checks.map(([n, v]) => `${v ? "✓" : "✗"} ${n}`).join(", ")} |`);
  }

  const pct = (a: number, b: number) => (b ? `${a}/${b} = ${Math.round((100 * a) / b)}%` : "–");
  const md = [
    "# Held-out evaluation",
    "",
    `The dataset's SYN_ extension: 10 incoming drafts (read from Word / PDF / scanned files), 10 signed contracts added to the register, 6 notes without narrator lines. Never used to build, prompt or tune anything; cases written from the answer key before the first run (\`eval/holdout_cases.json\`, ${spec.changes.length ? `${spec.changes.length} logged change(s)` : "unchanged since"}). Model: ${provider()}. Run ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC.`,
    "",
    `Every finding graded (\`eval/holdout_finding_labels.json\`): ${(() => { const n = Object.values(tally).reduce((a, x) => a + x, 0); const p = (k: string) => (n ? Math.round((100 * tally[k]) / n) : 0); return `${n} findings · **${p("correct")}% correct** (+${p("partly")}% partly) · noise ${p("noise")}% · wrong ${tally.wrong} · severity off ${sevOff}${ungraded.length ? ` · UNGRADED: ${ungraded.join(", ")}` : ""}`; })()}`,
    "",
    `**Verdicts ${pct(verdictOk, graded)} · conflicts found (the right signed contract cited at blocker/high) ${pct(citeHit, citeAll)} · playbook / entity points ${pct(findHit, findAll)} · false alarms on the clean draft: ${falseAlarms} · register key ${pct(regOk, spec.register.entries.length)}** (${graded}/${spec.cases.length} deals reviewed)`,
    "",
    `Missed conflicts that the brief's "check by hand" list points to (commitment kinds the conflict check doesn't compare): ${pct(missedPointed, missedAll)}${pointed.length ? ` (${pointed.join("; ")})` : ""}`,
    "",
    "| Case | Deal | Expected | Verdict | Conflict must cite | Must find | False alarms | Result |",
    "|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    "## Register key (signed SYN contracts)",
    "",
    "| Key | Document | Expected type | Extracted | Checks |",
    "|---|---|---|---|---|",
    ...regRows,
    "",
  ].join("\n");
  fs.writeFileSync("eval/holdout-results.md", md);
  fs.writeFileSync("eval/holdout-results.json", JSON.stringify({ at: new Date().toISOString(), provider: provider(), verdictOk, graded, citeHit, citeAll, findHit, findAll, falseAlarms, regOk, cases: out }, null, 2));
  console.log(md);
}

main();

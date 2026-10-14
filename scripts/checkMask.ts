/**
 * npm run check:mask (FR-26, Masking_Lite_Spec §4; EV-M1 on the dataset): no AI calls, no cost.
 * For every document, note and register entry (main dataset and the held-out set):
 *  - mask it, then run the leak check: target 0 (EV-M1);
 *  - unmask it: the result must equal the original exactly (round trip);
 *  - plus unit cases: aliases share a label, line-broken names, possessives, AtliQ's entity labels.
 * Prints counts by type and the 20 most frequent capitalised words left unmasked, to spot names missing
 * from data/seed/mask_people.json. Exit code 1 on any leak or round-trip difference.
 */
import "./_env";
import fs from "node:fs";
import { dictionary, leaks, mask, MaskTable, unmask, type Counts } from "../lib/mask";

export type MaskCheck = { items: number; leaks: number; leakFiles: string[]; roundTripFails: string[]; counts: Counts; unitFails: string[]; topUnmasked: [string, number][] };

function texts(profile: string): { id: string; text: string }[] {
  const dir = profile ? `data/${profile}` : "data";
  const docs = JSON.parse(fs.readFileSync(`${dir}/documents.json`, "utf8")) as { id: string; text: string }[];
  const notes = JSON.parse(fs.readFileSync(`${dir}/notes.json`, "utf8")) as { id: string; text: string }[];
  const regFile = fs.existsSync(`${dir}/register.json`) ? `${dir}/register.json` : "data/register.json";
  const reg = JSON.parse(fs.readFileSync(regFile, "utf8")).entries as { id: string; quote: string; summary: string; title: string }[];
  return [...docs.map((d) => ({ id: d.id, text: d.text })), ...notes.map((n) => ({ id: n.id, text: n.text })), ...reg.map((e) => ({ id: e.id, text: `${e.title}\n${e.summary}\n${e.quote}` }))];
}

function unit(): string[] {
  const fails: string[] = [];
  const t = new MaskTable();
  const a = mask("Harrington Health Systems Inc signed. Harrington's team and HARRINGTON agree.", t);
  if (!/^\[CLIENT_1\] signed\. \[CLIENT_1\]'s team and \[CLIENT_1\] agree\.$/.test(a)) fails.push(`aliases + possessive: ${a}`);
  const b = mask("between Al\nNoor Hospitality Group and AtliQ Technologies Pvt Ltd", new MaskTable());
  if (!/\[CLIENT_1\]/.test(b) || /Noor/.test(b) || !b.includes("[ATLIQ_PVT_LTD]")) fails.push(`line-broken name / AtliQ label: ${b}`);
  const c = mask("AtliQ Inc shall invoice USD 78,000; contact rebecca.lowe@example.com or +1 312 555 0182.", new MaskTable());
  if (!c.includes("[ATLIQ_INC]") || /78,000|rebecca|555/.test(c)) fails.push(`entity / amount / email / phone: ${c}`);
  const keep = "PipeKit, 1% per week, 60 days, Germany, clause 12.1, 31 March 2027";
  if (mask(keep, new MaskTable()) !== keep) fails.push(`kept visible changed: ${mask(keep, new MaskTable())}`);
  const t2 = new MaskTable();
  const m = mask("Pay Crestline Retail Inc $85 per hour.", t2);
  if (unmask(m.replace("[CLIENT_1]", "CLIENT_1"), t2) !== "Pay Crestline Retail Inc $85 per hour.") fails.push("tolerant unmask (CLIENT_1 without brackets)");
  return fails;
}

export function checkMask(): MaskCheck {
  // The held-out files also carry the main documents: only its own (SYN) texts are checked there.
  const mainIds = new Set(texts("").map((x) => x.id));
  // Each set is masked with its own dictionary (its own deals and register), as a real run would be.
  const items = [...texts("").map((x) => ({ ...x, profile: "" })), ...(fs.existsSync("data/holdout/documents.json") ? texts("holdout").filter((x) => !mainIds.has(x.id)).map((x) => ({ ...x, profile: "holdout" })) : [])];
  const counts: Counts = { atliq: 0, client: 0, person: 0, email: 0, phone: 0, bank: 0, id: 0, amount: 0 };
  const leakFiles: string[] = [];
  const roundTripFails: string[] = [];
  let leakCount = 0;
  const left = new Map<string, number>();
  const before = process.env.DATA_PROFILE;
  for (const it of items) {
    process.env.DATA_PROFILE = it.profile;
    const table = new MaskTable();
    const masked = mask(it.text, table);
    const l = leaks(masked);
    if (l.length) {
      leakCount += l.length;
      leakFiles.push(`${it.id} (${[...new Set(l)].join(", ")})`);
    }
    if (unmask(masked, table, true) !== it.text) roundTripFails.push(it.id);
    for (const k of Object.keys(counts) as (keyof Counts)[]) counts[k] += table.counts[k];
    for (const w of masked.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?\b/g) ?? []) left.set(w, (left.get(w) ?? 0) + 1);
  }
  if (before === undefined) delete process.env.DATA_PROFILE; // assigning undefined would set the string "undefined"
  else process.env.DATA_PROFILE = before;
  const topUnmasked = [...left].sort((a, b) => b[1] - a[1]).slice(0, 20);
  return { items: items.length, leaks: leakCount, leakFiles, roundTripFails, counts, unitFails: unit(), topUnmasked };
}

if (process.argv[1]?.endsWith("checkMask.ts")) {
  const r = checkMask();
  console.log(`dictionary: ${dictionary().terms.length} terms`);
  console.log(`masked ${r.items} texts (documents, notes, register entries; main + held-out)`);
  console.log(`counts: ${Object.entries(r.counts).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  console.log(`EV-M1 leaks: ${r.leaks}${r.leakFiles.length ? ` in ${r.leakFiles.slice(0, 10).join(", ")}` : ""}`);
  console.log(`round trip: ${r.items - r.roundTripFails.length}/${r.items} exact${r.roundTripFails.length ? ` · differ: ${r.roundTripFails.slice(0, 10).join(", ")}` : ""}`);
  console.log(`unit cases: ${r.unitFails.length ? r.unitFails.join("\n  ") : "all right"}`);
  console.log(`most frequent capitalised words left visible (check for missed names): ${r.topUnmasked.map(([w, n]) => `${w} (${n})`).join(", ")}`);
  process.exitCode = r.leaks || r.roundTripFails.length || r.unitFails.length ? 1 : 0;
}

/**
 * Phase 1b exit check: compare the AI-built register (data/register.json) with the hand-built
 * answer key (data/expected/register.expected.json, from docs/Obligations_Register.md §A–D).
 * Prints matched / missing / extra entries and field mismatches. Target: 100% of "must" entries
 * present, ≥90% of compared fields exact (PRD §11 Register accuracy & coverage; EV-R1–R4).
 */
import "./_env";
import { daysBetween, readJson } from "../lib/config";
import { expandRegions } from "../lib/geo";
import type { RegisterEntry } from "../lib/types";

type Expected = {
  key: string;
  title: string;
  sourceDocId: string;
  types: string[];
  clause?: string;
  bindsEntities?: string[];
  includesAffiliates?: boolean;
  regions?: string[];
  sectors?: string[];
  assets?: string[];
  counterparties?: string[];
  end?: string;
  status?: string;
  waiverDocId?: string;
  rateFloorRoles?: number;
  must?: boolean;
};

const section = (ref: string) => (ref.match(/\d+/) ?? [""])[0];

export function checkRegister(log = true) {
  const reg = readJson<{ entries: RegisterEntry[]; documents: { docId: string; illegible: { clauseRef: string; note: string }[] }[]; version: string }>("register.json");
  const exp = readJson<{ entries: Expected[]; illegible: { sourceDocId: string; clause: string; note: string }[] }>("expected/register.expected.json");
  const used = new Set<string>();
  let fieldsTotal = 0;
  let fieldsOk = 0;
  const rows: { key: string; title: string; must: boolean; matched: string | null; mismatches: string[] }[] = [];

  for (const e of exp.entries) {
    const candidates = reg.entries.filter((r) => r.sourceDocId === e.sourceDocId && e.types.includes(r.type) && !used.has(r.id));
    const byClause = e.clause ? candidates.filter((r) => section(r.clauseRef) === e.clause || r.clauseRef.includes(`${e.clause}.`)) : candidates;
    const hit = byClause[0] ?? candidates[0] ?? null;
    const mismatches: string[] = [];
    if (hit) {
      used.add(hit.id);
      const check = (name: string, ok: boolean, detail: string) => {
        fieldsTotal++;
        if (ok) fieldsOk++;
        else mismatches.push(`${name}: ${detail}`);
      };
      check("type", e.types.includes(hit.type), hit.type);
      if (e.clause) check("clause", section(hit.clauseRef) === e.clause || hit.clauseRef.includes(`${e.clause}.`), hit.clauseRef);
      if (e.bindsEntities) check("binds", [...e.bindsEntities].sort().join("+") === [...hit.bindsEntities].sort().join("+"), hit.bindsEntities.join("+"));
      if (e.includesAffiliates !== undefined) check("affiliates", hit.includesAffiliates === e.includesAffiliates, String(hit.includesAffiliates));
      if (e.regions) {
        const got = expandRegions(hit.scope.regions);
        check("regions", [...expandRegions(e.regions)].every((r) => got.has(r)), hit.scope.regions.join(", "));
      }
      if (e.sectors) check("sectors", e.sectors.every((s) => hit.scope.sectors.includes(s as never)), hit.scope.sectors.join(", "));
      if (e.assets) check("assets", e.assets.every((a) => hit.scope.assets.join(" ").toLowerCase().includes(a.toLowerCase())), hit.scope.assets.join(", "));
      if (e.counterparties) check("counterparties", e.counterparties.every((c) => hit.scope.counterparties.join(" ").toLowerCase().includes(c.toLowerCase())), hit.scope.counterparties.join(", "));
      if (e.end) check("end", !!hit.end && Math.abs(daysBetween(hit.end, e.end)) <= 45, String(hit.end));
      if (e.status) check("status", hit.status === e.status, hit.status);
      if (e.waiverDocId) check("waiver", hit.waivers.some((w) => w.docId === e.waiverDocId), hit.waivers.map((w) => w.docId).join(", ") || "none linked");
      if (e.rateFloorRoles) check("rateFloor", (hit.terms.rateFloor?.length ?? 0) >= e.rateFloorRoles, String(hit.terms.rateFloor?.length ?? 0));
    }
    rows.push({ key: e.key, title: e.title, must: !!e.must, matched: hit?.id ?? null, mismatches });
  }

  const extra = reg.entries.filter((r) => !used.has(r.id));
  const illegibleOk = exp.illegible.map((i) => ({
    ...i,
    found: reg.documents.some((d) => d.docId === i.sourceDocId && d.illegible.some((x) => section(x.clauseRef) === i.clause)),
  }));

  const must = rows.filter((r) => r.must);
  const mustFound = must.filter((r) => r.matched).length;
  const fieldPct = fieldsTotal ? (100 * fieldsOk) / fieldsTotal : 0;
  const pass = mustFound === must.length && fieldPct >= 90 && illegibleOk.every((i) => i.found);

  if (log) {
    console.log(`Register ${reg.version}: ${reg.entries.length} entries vs ${exp.entries.length} expected\n`);
    for (const r of rows) {
      const mark = !r.matched ? "MISSING" : r.mismatches.length ? "PARTIAL" : "OK";
      console.log(`${r.must ? "*" : " "} ${r.key.padEnd(4)} ${mark.padEnd(8)} ${r.title.padEnd(52)} ${r.matched ?? ""}`);
      for (const m of r.mismatches) console.log(`             ↳ ${m}`);
    }
    console.log(`\nIllegible clauses reported (never guessed):`);
    for (const i of illegibleOk) console.log(`  ${i.found ? "OK " : "MISSING"} ${i.sourceDocId} §${i.clause}: ${i.note}`);
    console.log(`\nExtra entries (not in the hand-built key: review, may be valid):`);
    for (const x of extra) console.log(`  ${x.id.padEnd(18)} ${x.type.padEnd(13)} ${x.status.padEnd(7)} ${x.clauseRef.padEnd(10)} ${x.title}${x.routine ? " (routine)" : ""}`);
    console.log(`\nMust-have entries present: ${mustFound}/${must.length} (target 100%)`);
    console.log(`Fields exact: ${fieldsOk}/${fieldsTotal} = ${fieldPct.toFixed(1)}% (target ≥90%)`);
    console.log(pass ? "\nPASS" : "\nFAIL");
  }
  return { pass, mustFound, mustTotal: must.length, fieldPct, rows, extra: extra.length, illegibleOk };
}

if (process.argv[1]?.includes("checkRegister")) {
  const r = checkRegister();
  if (!r.pass) process.exitCode = 1;
}

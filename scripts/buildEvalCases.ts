/**
 * Phase 1d: docs/Eval_Set.md → eval/cases.json (EV-R, EV-01–15, B1–B3, C, D, EV-P).
 * The human-readable row comes from the markdown tables; the machine-checkable expectations
 * (finding keys, verdicts) come from eval/case_keys.json. Phase 2's `npm run eval` reads cases.json.
 */
import fs from "node:fs";

type Keys = { cases: Record<string, Record<string, unknown>> };

function parseTables(md: string): { section: string; row: Record<string, string> }[] {
  const out: { section: string; row: Record<string, string> }[] = [];
  let section = "";
  let header: string[] | null = null;
  let lastHeader: string[] | null = null;
  for (const line of md.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      section = line.replace(/^##\s+/, "").trim();
      header = lastHeader = null;
      continue;
    }
    if (!line.trim().startsWith("|")) {
      header = null;
      continue;
    }
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (cells.every((c) => /^-+$/.test(c))) continue;
    if (!header) {
      // A table fragment without its own header row (e.g. EV-R5) reuses the section's last header.
      if (/^EV-/.test(cells[0]) && lastHeader) header = lastHeader;
      else {
        header = lastHeader = cells;
        continue;
      }
    }
    const row = Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
    if (/^EV-/.test(cells[0])) out.push({ section, row });
  }
  return out;
}

function main() {
  const md = fs.readFileSync("docs/Eval_Set.md", "utf8");
  const keys: Keys = JSON.parse(fs.readFileSync("eval/case_keys.json", "utf8"));
  const rows = parseTables(md);
  const cases = rows.map(({ section, row }) => {
    const id = Object.values(row)[0];
    const k = keys.cases[id] ?? { kind: "unmapped" };
    const title = row["Contract"] || row["Input"] || row["Situation"] || row["Upload"] || row["Incoming clause"] || row["Seller plans to offer…"] || row["v1 → v2 change"] || "";
    return {
      id,
      section,
      title: title.replace(/\*\*/g, ""),
      inputs: [],
      dealId: k.dealId,
      expectedVerdict: k.expectedVerdict,
      expectComplianceAlert: k.expectComplianceAlert,
      mustFind: (k.mustFind as string[]) ?? [],
      mustNotFlag: (k.mustNotFlag as string[]) ?? [],
      expectedPrecedents: k.expectedPrecedents,
      spec: k,
      source: row,
    };
  });
  const missing = Object.keys(keys.cases).filter((id) => !cases.some((c) => c.id === id));
  fs.writeFileSync("eval/cases.json", JSON.stringify({ builtAt: new Date().toISOString(), from: "docs/Eval_Set.md + eval/case_keys.json", cases }, null, 2) + "\n");
  const bySection = new Map<string, number>();
  for (const c of cases) bySection.set(c.section, (bySection.get(c.section) ?? 0) + 1);
  console.log(`eval/cases.json: ${cases.length} cases`);
  for (const [s, n] of bySection) console.log(`  ${String(n).padStart(2)}  ${s}`);
  const unmapped = cases.filter((c) => c.spec.kind === "unmapped").map((c) => c.id);
  if (unmapped.length) console.log(`unmapped (no case_keys entry): ${unmapped.join(", ")}`);
  if (missing.length) console.log(`keys without a row in Eval_Set.md: ${missing.join(", ")}`);
}

main();

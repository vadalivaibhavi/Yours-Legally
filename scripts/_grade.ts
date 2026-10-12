/** Incoming-contract grading shared by npm run eval and npm run consistency (eval/cases.json specs). */
import type { EffectiveBrief, Finding } from "../lib/review/types";
import { SEVERITY_RANK } from "../lib/review/types";

type Spec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function matches(f: Finding, pattern: string): boolean {
  if (pattern.startsWith("severity:")) return f.severity === pattern.slice(9);
  const [key, clause] = pattern.split("@");
  if (!f.key.startsWith(key)) return false;
  return (
    !clause ||
    f.citations.some(
      (c) => c.role === "incoming" && c.clauseRef.includes(clause),
    )
  );
}

export function checkFindings(b: EffectiveBrief, spec: Spec): string[] {
  const problems: string[] = [];
  for (const p of spec.mustFind ?? [])
    if (!b.findings.some((f) => matches(f, p))) problems.push(`missing ${p}`);
  for (const p of spec.mustNotFlag ?? []) {
    const hit = b.findings.find(
      (f) => matches(f, p) && SEVERITY_RANK[f.severity] >= SEVERITY_RANK.medium,
    );
    if (hit) problems.push(`flagged ${hit.key} (${hit.severity})`);
  }
  if (spec.maxMedium !== undefined) {
    const m = b.findings.filter((f) => f.severity === "medium").length;
    if (m > spec.maxMedium)
      problems.push(`${m} medium items > ${spec.maxMedium}`);
  }
  if (spec.expectRoute && b.route !== spec.expectRoute)
    problems.push(`route ${b.route}`);
  return problems;
}

/**
 * Verdict = plain rules over structured findings (PRD §9.1, §9.2). Fixed vocabulary:
 * SIGN · SIGN AFTER CHANGES · SEND BACK · HOLD. The system never recommends Reject.
 *
 * Takes findings only: similar past clauses are not an input, so they cannot change the verdict
 * (FR-22, EV-P "verdict identical with and without the panel"). Deal value and deadline are not
 * inputs either (PRD §7.2 pressure bias).
 */
import { SEVERITY_RANK, type Finding, type Verdict } from "./types";

export type VerdictInput = {
  findings: Finding[];
  complianceAlertOpen: boolean;
  waitingFor: { item: string; owner: string }[];
};

export function isSendBack(f: Finding): boolean {
  return f.resolution === "document" && f.owner === "the other side" && SEVERITY_RANK[f.severity] >= SEVERITY_RANK.high && !f.missingItem;
}

export function computeVerdict({ findings, complianceAlertOpen, waitingFor }: VerdictInput): Verdict {
  if (complianceAlertOpen) return "HOLD"; // FR-21: never SIGN while a compliance alert is open
  if (findings.some((f) => f.severity === "blocker")) return "HOLD";
  if (waitingFor.length) return "HOLD"; // waiting for input: brief issued anyway, items + owners listed
  if (findings.some(isSendBack)) return "SEND BACK";
  const high = findings.filter((f) => f.severity === "high").length;
  const medium = findings.filter((f) => f.severity === "medium").length;
  if (high > 0 || medium > 1) return "SIGN AFTER CHANGES";
  return "SIGN"; // clean: 0 blockers, ≤1 medium (PRD §11 precision on clean contracts)
}

export function templateHeadline(verdict: Verdict, findings: Finding[], waitingFor: { item: string }[], alertOpen: boolean): string {
  const blockers = findings.filter((f) => f.severity === "blocker").length;
  const high = findings.filter((f) => f.severity === "high").length;
  const parts: string[] = [];
  if (alertOpen) parts.push("compliance alert open");
  if (blockers) parts.push(`${blockers} blocker${blockers > 1 ? "s" : ""}`);
  if (waitingFor.length) parts.push(`${waitingFor.length} missing input${waitingFor.length > 1 ? "s" : ""}`);
  if (high) parts.push(`${high} must-fix item${high > 1 ? "s" : ""}`);
  if (!parts.length) parts.push(verdict === "SIGN" ? "nothing blocks signature" : "negotiable deviations only");
  return `${verdict}: ${parts.join(", ")}`;
}

export function sortFindings(findings: Finding[]): Finding[] {
  const catOrder = ["conflict", "covenant", "bundle", "notes", "gate", "flowdown", "nda", "playbook", "dependency", "mismatch"];
  return [...findings].sort(
    (a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || catOrder.indexOf(a.category) - catOrder.indexOf(b.category) || a.key.localeCompare(b.key),
  );
}

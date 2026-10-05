/**
 * Review completeness for one deal's latest brief: which blocker and high findings Karandeep has reacted to
 * (medium items are worth negotiating, not deal-breaking, so they are optional), whether
 * notes facts behind a compliance event are answered, and whether a decision is chosen. The review can
 * be finalised (status "Decided") only when nothing is left; partial work stays "Review in progress".
 */
import { briefVersions } from "../deals";
import { readState } from "../store";

export type ReviewProgress = {
  total: number;
  reacted: number;
  factsTotal: number;
  factsAnswered: number;
  decision?: string;
  finalised: boolean;
  finalisedAt?: string;
  missing: string[];
  complete: boolean;
  started: boolean;
};

/** Severities that need a reaction before the review can be finalised. */
export const REQUIRED = new Set(["blocker", "high"]);

export function reviewProgress(dealId: string): ReviewProgress | null {
  const versions = briefVersions(dealId);
  const brief = versions[versions.length - 1];
  if (!brief) return null;
  const s = readState();
  const reactions = s.reactions[dealId] ?? {};
  const confirmations = s.confirmations[dealId] ?? {};
  const o = s.dealOverrides[dealId] ?? {};
  // Findings that must be answered before finalising: blocker and high, including ones Karandeep dismissed.
  const items = brief.findings.filter((f) => REQUIRED.has(f.severity));
  const reacted = items.filter((f) => reactions[f.key]).length;
  const facts = brief.complianceCandidate?.factIds ?? [];
  const factsAnswered = facts.filter((id) => confirmations[id]).length;
  const missing: string[] = [];
  if (reacted < items.length) missing.push(`${items.length - reacted} blocker or high finding${items.length - reacted === 1 ? "" : "s"} to react to (medium items are optional)`);
  if (factsAnswered < facts.length) missing.push("the compliance fact from the deal notes to confirm");
  if (!o.decision) missing.push("a decision to choose");
  return {
    total: items.length,
    reacted,
    factsTotal: facts.length,
    factsAnswered,
    decision: o.decision,
    finalised: !!o.finalised,
    finalisedAt: o.finalisedAt,
    missing,
    complete: missing.length === 0,
    started: Object.keys(reactions).length > 0 || factsAnswered > 0 || !!o.decision,
  };
}

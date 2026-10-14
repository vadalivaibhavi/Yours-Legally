/**
 * A stored brief is the analysis. The effective brief overlays what Karandeep has done since:
 * confirmations of note facts (→ compliance alert), alert closure (FR-21), reactions and severity
 * changes (FR-12), notes on blockers (EV-C2: pending written waiver), register verification
 * (removes the "unverified" label, EV-R5). Verdict and waiting-for list are recomputed by rule.
 */
import { registerEntries } from "../register";
import { readState } from "../store";
import { baseDeals } from "../data";
import { coverageNote, requireEvidence, sanitize, sanitizeFinding } from "./guardrails";
import { adjustForDealSize } from "./materiality";
import { ownerRole, rolesInText, OWNER } from "./owners";
import { expandRegions } from "../geo";
import { latestSellerCheck } from "../sellerChecks";
import { uncheckedCommitments } from "./unchecked";
import { expiredContext } from "./expiredContext";
import type { Brief, EffectiveBrief, Finding, Severity } from "./types";
import { computeVerdict, sortFindings, templateHeadline } from "./verdict";

export function effectiveBrief(brief: Brief, prev: Brief | null): EffectiveBrief {
  const s = readState();
  const reactions = s.reactions[brief.dealId] ?? {};
  const notesOnBlockers = s.blockerNotes[brief.dealId] ?? {};
  const confirmations = s.confirmations[brief.dealId] ?? {};
  const register = new Map(registerEntries({ includeRejected: true }).map((e) => [e.id, e]));
  const value = [...baseDeals(), ...s.newDeals].find((d) => d.id === brief.dealId)?.valueUsd;

  const findings: Finding[] = [];
  for (const f0 of withLiveMismatch(brief)) {
    const f: Finding = adjustForDealSize(requireEvidence(sanitizeFinding({ ...f0 })), value); // A1 evidence; plain wording; small-deal deviations count lower
    f.owner = ownerRole(f.owner, f); // roles, not names (briefs stored with names)
    if (f.missingItem) f.missingItem = { ...f.missingItem, owner: ownerRole(f.missingItem.owner, f) };
    const r = reactions[f.key];
    if (r?.reaction === "disagree") continue; // dismissed by Karandeep (reason logged): shown separately, not in the verdict
    if (r?.reaction === "severity" && r.severity) f.severity = r.severity as Severity;
    if (f.registerEntryId) {
      const e = register.get(f.registerEntryId);
      f.registerVerified = e?.verified ?? false;
    }
    if (notesOnBlockers[f.key] && (f.category === "conflict" || f.category === "covenant")) {
      f.pendingDocument = f.waiver ? "written waiver" : "written waiver or amendment";
    }
    findings.push(f);
  }

  // Note facts: unconfirmed compliance events are a missing input; confirmed ones raise the alert.
  const waitingFor: { item: string; owner: string }[] = [];
  for (const f of findings) if (f.missingItem) waitingFor.push(f.missingItem);
  // PRD §8: a failed check never returns "clean". Each failed step is an open item for Karandeep.
  for (const e of brief.errors) waitingFor.push({ item: `Review manually: ${e.split(" (")[0]}`, owner: "Karandeep" });
  let complianceAlert: EffectiveBrief["complianceAlert"] = null;
  const cand = brief.complianceCandidate;
  if (cand) {
    const states = cand.factIds.map((id) => confirmations[id]?.status);
    const confirmed = states.some((x) => x === "confirmed" || x === "edited");
    const allDenied = states.length > 0 && states.every((x) => x === "not_true");
    if (confirmed) {
      const closure = s.alerts[brief.dealId];
      complianceAlert = {
        ...cand,

        owner: ownerRole(cand.owner),
        status: closure?.status === "resolved" ? "resolved" : "open",
        resolution:
          closure?.status === "resolved"
            ? closure.how === "note"
              ? `Resolved by Karandeep's note, ${fmt(closure.at)}: ${closure.note}`
              : `Resolved with evidence (${[closure.evidenceFile?.name, closure.evidence].filter(Boolean).join(": ")}), ${fmt(closure.at)}`
            : undefined,
        evidenceFile: closure?.status === "resolved" ? closure.evidenceFile : undefined,
      };
    } else if (!allDenied) {
      waitingFor.push({ item: `Confirm from deal notes: ${cand.title}`, owner: "Karandeep" });
    }
  }

  const alertOpen = complianceAlert?.status === "open";
  const verdict = computeVerdict({ findings, complianceAlertOpen: alertOpen, waitingFor });
  const sorted = sortFindings(findings);

  let changes: EffectiveBrief["changes"] = null;
  if (prev) {
    const prevKeys = new Set(prev.findings.map((f) => f.key));
    const nowKeys = new Set(brief.findings.map((f) => f.key));
    changes = {
      new: brief.findings.filter((f) => !prevKeys.has(f.key)).map((f) => f.key),
      stillOpen: brief.findings.filter((f) => prevKeys.has(f.key)).map((f) => f.key),
      resolved: prev.findings.filter((f) => !nowKeys.has(f.key)),
    };
  }

  return {
    ...brief,
    findings: sorted,
    verdict,
    headline: verdict === brief.verdict ? sanitize(brief.headline) : templateHeadline(verdict, sorted, waitingFor, alertOpen),
    nextAction: rolesInText(sanitize(brief.nextAction)),
    notSeen: brief.notSeen.map((x) =>
      x
        .replace(/^Register built from (\d+) signed documents\..*$/, (_m, n) => coverageNote(Number(n)))
        // Raw model errors are for the logs; the reader gets what it means.
        .replace(/^Similar past clauses for (.+?): comparison lines couldn't be written \(.*$/, "Comparisons with similar past clauses in $1 couldn't be written this time (model busy); the matching clauses are still shown."),
    ),
    similar: brief.similar.map((p) => ({ ...p, hits: p.hits.map((h) => ({ ...h, differs: sanitize(h.differs) })) })),
    unchecked: uncheckedCommitments(brief), // never a finding, never in the verdict
    expired: expiredContext(brief), // FR-25: context only, never a finding, never in the verdict
    complianceAlert,
    changes,
    waitingFor,
  };
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * FR-20, live: the contract reaches regions the seller's latest deal check didn't declare, so AtliQ's
 * commitments there were never checked for the seller. Plain comparison, recomputed on every view, so a
 * new seller check never makes a brief out of date. Contract regions come from each document's fact card
 * ("sectors · regions"); a mismatch stored by older briefs is replaced by the live one.
 */
function withLiveMismatch(brief: Brief): Finding[] {
  const rest = brief.findings.filter((f) => f.category !== "mismatch");
  const sc = latestSellerCheck(brief.dealId);
  if (!sc) return rest;
  const deal = [...baseDeals(), ...readState().newDeals].find((d) => d.id === brief.dealId);
  const regionsOf = (v: string) => (v.split(" · ")[1] ?? "").split(",").map((r) => r.trim()).filter(Boolean);
  // As in the register check: AtliQ delivers from Pune, so "India" in a non-Indian client's contract is the delivery location, not a market.
  const inContract = [...new Set(brief.documents.flatMap((d) => regionsOf(d.facts.find((x) => x.field === "scope")?.value ?? "")))].filter(
    (r) => !(r === "India" && deal?.clientCountry && deal.clientCountry !== "India"),
  );
  const declared = expandRegions(sc.input.regions);
  // Named as in the contract (one name per region), flagged if any part of it lies outside what the seller declared.
  const extra = inContract.filter((r) => [...expandRegions([r])].some((x) => !declared.has(x) && x !== "Worldwide" && x !== "Other"));
  if (!extra.length) return rest;
  return [
    ...rest,
    {
      key: "mismatch:regions",
      category: "mismatch",
      topic: "regions",
      title: `Contract covers ${extra.join(", ")}: not in the seller's deal check (declared: ${sc.input.regions.join(", ") || "none"})`,
      impact: `The seller's check on ${sc.at.slice(0, 10)} was answered for ${sc.input.regions.join(", ") || "no regions"} only, so AtliQ's commitments covering ${extra.join(", ")} were never checked for the seller.`,
      severity: "medium",
      confidence: "high",
      needsJudgment: false,
      owner: OWNER.seller,
      resolution: "confirm",
      citations: [],
    },
  ];
}

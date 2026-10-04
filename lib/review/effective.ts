/**
 * A stored brief is the analysis. The effective brief overlays what Karandeep has done since:
 * confirmations of note facts (→ compliance alert), alert closure (FR-21), reactions and severity
 * changes (FR-12), notes on blockers (EV-C2: pending written waiver), register verification
 * (removes the "unverified" label, EV-R5). Verdict and waiting-for list are recomputed by rule.
 */
import { registerEntries } from "../register";
import { readState } from "../store";
import type { Brief, EffectiveBrief, Finding, Severity } from "./types";
import { computeVerdict, sortFindings, templateHeadline } from "./verdict";

export function effectiveBrief(brief: Brief, prev: Brief | null): EffectiveBrief {
  const s = readState();
  const reactions = s.reactions[brief.dealId] ?? {};
  const notesOnBlockers = s.blockerNotes[brief.dealId] ?? {};
  const confirmations = s.confirmations[brief.dealId] ?? {};
  const register = new Map(registerEntries({ includeRejected: true }).map((e) => [e.id, e]));

  const findings: Finding[] = [];
  for (const f0 of brief.findings) {
    const f: Finding = { ...f0 };
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
        status: closure?.status === "resolved" ? "resolved" : "open",
        resolution: closure?.status === "resolved" ? (closure.how === "note" ? `Resolved by Karandeep's note, ${fmt(closure.at)}: ${closure.note}` : `Resolved with evidence (${closure.evidence}), ${fmt(closure.at)}`) : undefined,
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
    headline: verdict === brief.verdict ? brief.headline : templateHeadline(verdict, sorted, waitingFor, alertOpen),
    complianceAlert,
    changes,
    waitingFor,
  };
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

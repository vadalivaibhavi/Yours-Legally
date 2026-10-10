/**
 * Deal size (Karandeep's materiality): on a small deal he accepts deviations from AtliQ's standard terms
 * that he would push back on for a large one. So, by rule (never by the model):
 *  - below the small-deal threshold (data/deal_size.json), a deviation from the standard terms counts one
 *    step lower: high → medium, medium → low (playbook deviations; the LD, liability-cap, payment,
 *    insurance and governing-law rule checks);
 *  - blockers, conflicts with what AtliQ already promised other clients, compliance, paperwork and entity
 *    checks never change: breaking a promise to another client costs the same whatever this deal is worth.
 *    Those findings only get the deal size as context.
 * Deals with no value on file are never adjusted.
 */
import { readJson } from "../config";
import { usd } from "../format";
import type { Finding, Severity } from "./types";

const config = () => readJson<{ smallDealUsd: number }>("deal_size.json", { smallDealUsd: 50_000 });

const SIZE_SENSITIVE_RULES = new Set(["ld", "liability", "payment", "insurance", "governing_law"]);
const CONTEXT_ONLY = new Set(["conflict", "covenant"]);

export function isSmallDeal(valueUsd?: number | null): boolean {
  return !!valueUsd && valueUsd < config().smallDealUsd;
}

/** The finding as it counts for this deal's size (used by the brief, the verdict and the finalise check). */
export function adjustForDealSize(f: Finding, valueUsd?: number | null): Finding {
  if (!isSmallDeal(valueUsd)) return f;
  const size = `${usd(valueUsd)} deal (small: under ${usd(config().smallDealUsd)})`;
  if (CONTEXT_ONLY.has(f.category)) return { ...f, sizeNote: `${size}. This is a promise already made to another client, so it counts the same at any deal size.` };
  const sensitive = f.category === "playbook" || (f.category === "gate" && SIZE_SENSITIVE_RULES.has(f.topic));
  const lower: Partial<Record<Severity, Severity>> = { high: "medium", medium: "low" };
  const to = sensitive ? lower[f.severity] : undefined;
  return to ? { ...f, severity: to, sizeNote: `${size}: counted as ${to} instead of ${f.severity}, a deviation you usually accept at this size.` } : f;
}

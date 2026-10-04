import { appToday } from "./config";

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function isIsoDate(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10)) && !Number.isNaN(Date.parse(s.slice(0, 10)));
}

/**
 * Expiry is computed by rule from AI-extracted facts (FR-1): end = fixedEnd, else termEnd + tail months.
 * Expired commitments are kept for history and never flagged (PRD §9.2 "Expired obligation").
 */
export function computeEnd(f: { fixedEnd: string | null; termEnd: string | null; tailMonths: number | null; perpetual: boolean }): string | null {
  if (f.perpetual) return null;
  if (isIsoDate(f.fixedEnd)) return f.fixedEnd.slice(0, 10);
  if (isIsoDate(f.termEnd)) return addMonths(f.termEnd, f.tailMonths ?? 0);
  return null;
}

export function computeStatus(end: string | null, perpetual: boolean, today = appToday()): "live" | "expired" | "unknown" {
  if (perpetual) return "live";
  if (!end) return "unknown";
  return end < today ? "expired" : "live";
}

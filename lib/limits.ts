/**
 * Character limits for every free-text input. Enforced twice: in the browser (maxLength + live counter,
 * components/Fields.tsx) and on the server (field(), used by every server action), so a crafted request
 * can't bypass them.
 */
export const LIMITS = {
  name: 120, // client name, register title
  clauseRef: 40, // "§7.2"
  evidence: 200, // evidence reference for closing an alert
  list: 300, // comma-separated regions / services / tools
  freeText: 300, // seller's "anything else you're promising?"
  note: 500, // notes, reasons, corrections
  rates: 500, // rates by role, one per line
  summary: 1000, // register summary
  contract: 200_000, // pasted contract text
  fileBytes: 4_000_000, // uploaded contract file (PDF / Word / text); Vercel caps a request at 4.5 MB
  evidenceBytes: 5_000_000, // evidence attached to close a compliance alert
} as const;

/** Read a trimmed text field and reject it if it's over the limit. */
export function field(form: FormData, key: string, max: number, label = key): string {
  const v = String(form.get(key) ?? "").trim();
  if (v.length > max) throw new Error(`${label} is too long (${v.length} characters; the limit is ${max}).`);
  return v;
}

/** Evidence files accepted when closing a compliance alert. */
export const EVIDENCE_TYPES = [".pdf", ".png", ".jpg", ".jpeg", ".docx", ".doc", ".txt", ".md", ".eml", ".msg"];

/** What the app shows when an action stops on the daily quota. */
export const QUOTA_MESSAGE = "Daily AI quota reached, so this check couldn't run. Nothing was lost: try again tomorrow (the quota resets at midnight Pacific).";

import { appToday, daysBetween } from "./config";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m) return iso;
  return `${d ? d + " " : ""}${MONTHS[m - 1]} ${y}`;
}

/** FR-14: "due in X days" / "overdue" from APP_TODAY. Deadline affects order only, never risk. */
export function dueLabel(deadline?: string): { text: string; tone: "overdue" | "soon" | "ok" | "none"; days: number | null } {
  if (!deadline) return { text: "No deadline", tone: "none", days: null };
  const days = daysBetween(appToday(), deadline);
  if (days < 0) return { text: `Overdue by ${-days} day${days === -1 ? "" : "s"}`, tone: "overdue", days };
  if (days === 0) return { text: "Due today", tone: "soon", days };
  return { text: `Due in ${days} day${days === 1 ? "" : "s"}`, tone: days <= 3 ? "soon" : "ok", days };
}

/** "5 Oct, 19:42": real clock time of an action (decisions, uploads), as opposed to the fixed demo date. */
export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function usd(n?: number | null): string {
  if (n === undefined || n === null) return "—";
  return "$" + Math.round(n).toLocaleString("en-US");
}

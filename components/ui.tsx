import type { ReactNode } from "react";
import { dueLabel } from "@/lib/format";
import { ClampedText } from "@/components/Fields";

export type Verdict = "SIGN" | "SIGN AFTER CHANGES" | "SEND BACK" | "HOLD";

const VERDICT_STYLE: Record<Verdict, string> = {
  SIGN: "bg-sign-soft text-sign",
  "SIGN AFTER CHANGES": "bg-change-soft text-change",
  "SEND BACK": "bg-sendback-soft text-sendback",
  HOLD: "bg-hold-soft text-hold",
};

export function VerdictBadge({ verdict, size = "sm" }: { verdict: Verdict; size?: "sm" | "lg" }) {
  return (
    <span className={`chip ${VERDICT_STYLE[verdict]} ${size === "lg" ? "!text-base !px-3 !py-1" : ""}`}>{verdict}</span>
  );
}

export function DueBadge({ deadline }: { deadline?: string }) {
  const d = dueLabel(deadline);
  const cls =
    d.tone === "overdue" ? "bg-hold-soft text-hold" : d.tone === "soon" ? "bg-change-soft text-change" : d.tone === "ok" ? "bg-brand-soft text-brand" : "bg-gray-100 text-muted";
  return <span className={`chip ${cls}`}>{d.text}</span>;
}

const SEVERITY_STYLE: Record<string, string> = {
  blocker: "bg-hold text-white",
  high: "bg-sendback-soft text-sendback",
  medium: "bg-change-soft text-change",
  low: "bg-gray-100 text-muted",
  ok: "bg-sign-soft text-sign",
};
export function SeverityBadge({ severity }: { severity: string }) {
  return <span className={`chip uppercase ${SEVERITY_STYLE[severity] ?? "bg-gray-100"}`}>{severity}</span>;
}

const LABEL_STYLE: Record<string, string> = {
  standard: "bg-sign-soft text-sign",
  exception: "bg-change-soft text-change",
  concession: "bg-brand-soft text-brand",
  accident: "bg-hold-soft text-hold",
  untagged: "bg-gray-100 text-muted",
};
export function IntentBadge({ label }: { label: string }) {
  const text = label === "exception" || label === "accident" ? `${label}: one-off, not a precedent` : label;
  return <span className={`chip ${LABEL_STYLE[label] ?? "bg-gray-100"}`}>{text}</span>;
}

export function Chip({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "brand" | "warn" | "bad" | "good" }) {
  const cls = { gray: "bg-gray-100 text-muted", brand: "bg-brand-soft text-brand", warn: "bg-change-soft text-change", bad: "bg-hold-soft text-hold", good: "bg-sign-soft text-sign" }[tone];
  return <span className={`chip ${cls}`}>{children}</span>;
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="label">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Quote({ children, cite }: { children: ReactNode; cite?: string }) {
  return (
    <figure className="space-y-1">
      {cite && <figcaption className="text-xs font-semibold text-muted">{cite}</figcaption>}
      <blockquote className="quote text-sm">{typeof children === "string" ? <ClampedText text={clean(children)} /> : children}</blockquote>
    </figure>
  );
}

/** Display only: drop markdown emphasis marks from verbatim spans (the stored quote stays exact). */
export function clean(text: string): string {
  return text.replace(/\*\*/g, "").replace(/(^|\s)\*(\S)/g, "$1$2");
}

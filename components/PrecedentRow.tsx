import type { ReactNode } from "react";
import { fmtDate } from "@/lib/format";

const LABEL_STYLE: Record<string, string> = {
  standard: "bg-sign-soft text-sign",
  exception: "bg-change-soft text-change",
  concession: "bg-brand-soft text-brand",
  accident: "bg-hold-soft text-hold",
  untagged: "bg-gray-100 text-muted",
};

/**
 * One layout for every precedent (playbook precedents and similar past clauses):
 * fixed-width intent badge | client · clause · date (+ one-off marker) / detail lines.
 * Exceptions and accidents always carry "one-off: not a precedent" (PRD §10).
 */
export function PrecedentRow({
  label,
  client,
  clauseRef,
  date,
  children,
}: {
  label: string;
  client: string;
  clauseRef?: string;
  date?: string;
  children?: ReactNode;
}) {
  const oneOff = label === "exception" || label === "accident";
  return (
    <li className="grid grid-cols-[6.5rem_1fr] items-start gap-x-3 py-2 text-sm">
      <span className={`chip justify-center capitalize ${LABEL_STYLE[label] ?? LABEL_STYLE.untagged}`}>{label}</span>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <b>{client}</b>
          {clauseRef && <span className="text-muted">{clauseRef}</span>}
          {date && <span className="text-muted">· {fmtDate(date)}</span>}
          {oneOff && <span className="text-xs font-semibold text-hold">One-off: not a precedent</span>}
        </div>
        {children}
      </div>
    </li>
  );
}

export function PrecedentList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-line">{children}</ul>;
}

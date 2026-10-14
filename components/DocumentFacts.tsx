import type { DocumentReview } from "@/lib/review/types";

/**
 * Contract facts card (FR-4): each extracted field with its source clause, and the rule checks run on them.
 * The "Liability capped" rule checks AtliQ's own exposure. Where AtliQ is the buyer (vendor and contractor
 * agreements) that tick alone would read as "liability is fine" even when the other side is left uncapped, so
 * the row says "AtliQ's liability capped" and, when the mirror test found the other side uncapped, shows a
 * warning pointing to that finding.
 */
export function DocumentFacts({ review, buyerSide = false, otherSideUncapped }: { review: DocumentReview; buyerSide?: boolean; otherSideUncapped?: string }) {
  return (
    <div className="mt-3 grid gap-4 lg:grid-cols-2">
      <div>
        <div className="label mb-1">Key facts</div>
        <table className="text-sm">
          <tbody>
            {review.facts.map((f) => (
              <tr key={f.field} className="align-top">
                <td className="w-40 py-1 pr-3 text-muted">{f.label}</td>
                <td className="py-1">
                  {f.value}
                  {f.quote && (
                    <details>
                      <summary className="text-xs text-brand">{f.clauseRef ? `See ${f.clauseRef}` : "Source"}</summary>
                      <blockquote className="quote mt-1 text-xs">{f.quote.replace(/\*\*/g, "")}</blockquote>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <div className="label mb-1">Rule checks</div>
        <ul className="space-y-1 text-sm">
          {review.gate.map((g) => {
            const mirror = buyerSide && g.rule === "liability_cap";
            const warn = mirror && g.pass === true && !!otherSideUncapped;
            return (
              <li key={g.rule} className="flex gap-2">
                <span className={warn ? "text-change" : g.pass === true ? "text-sign" : g.pass === false ? "text-hold" : "text-muted"}>{warn ? "!" : g.pass === true ? "✓" : g.pass === false ? "✗" : "–"}</span>
                <span>
                  <b>{mirror ? "AtliQ's liability capped" : g.label}</b>: {g.detail}
                  {warn && <span className="block text-xs text-change">AtliQ is capped, but the other side is not: see the finding &ldquo;{otherSideUncapped}&rdquo;.</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

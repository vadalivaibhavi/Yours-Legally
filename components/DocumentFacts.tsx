import type { DocumentReview } from "@/lib/review/types";

/** Contract facts card (FR-4): each extracted field with its source clause, and the rule checks run on them. */
export function DocumentFacts({ review }: { review: DocumentReview }) {
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
          {review.gate.map((g) => (
            <li key={g.rule} className="flex gap-2">
              <span className={g.pass === true ? "text-sign" : g.pass === false ? "text-hold" : "text-muted"}>{g.pass === true ? "✓" : g.pass === false ? "✗" : "–"}</span>
              <span>
                <b>{g.label}</b>: {g.detail}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

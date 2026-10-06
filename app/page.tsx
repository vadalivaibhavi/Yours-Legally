import Link from "next/link";
import { Chip, DueBadge } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { reviewProgress } from "@/lib/review/progress";
import { visibleDeals } from "@/lib/access";
import { allDeals, latestBrief } from "@/lib/deals";
import { dueLabel } from "@/lib/format";
import { currentUser } from "@/lib/session";

const STATUS_TEXT: Record<string, string> = { open: "In review", waiting_for_input: "Waiting for input", decided: "Decided", signed: "Signed" };
/** Status colours: green = done, orange = in progress, red = waiting for input, blue = not started. */
const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "brand"> = { open: "brand", waiting_for_input: "bad", decided: "good", signed: "good" };

/** A verdict or decision as plain text in a neutral chip (the verdict column has no colour). */
function Plain({ children }: { children: string }) {
  return <span className="chip bg-gray-100 uppercase text-ink">{children}</span>;
}

/** Queue (F8, FR-14): due in / overdue from APP_TODAY, sorted by deadline. Deadline orders the list; it never changes risk. */
export default async function QueuePage(props: PageProps<"/">) {
  const user = await currentUser();
  const sp = await props.searchParams;
  const visible = visibleDeals(user, allDeals());
  // A signed copy closes the deal: it leaves the active queue (its commitments are now in the register).
  const signed = visible.filter((d) => d.status === "signed").sort((a, b) => (b.signedAt ?? "").localeCompare(a.signedAt ?? ""));
  const deals = visible.filter((d) => d.status !== "signed").sort((a, b) => {
    const da = dueLabel(a.deadline).days ?? 9999;
    const db = dueLabel(b.deadline).days ?? 9999;
    return da - db || a.name.localeCompare(b.name);
  });
  const isK = user.role === "karandeep";

  return (
    <div className="space-y-5">
      {sp.denied && (
        <div className="card border-hold/30 bg-hold-soft px-4 py-3 text-sm text-hold">
          That page is for Karandeep only. Sellers see their own deals, deal checks and re-check banners.
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Contract queue</h1>
          <p className="text-sm text-muted">
            {deals.length} open {deals.length === 1 ? "deal" : "deals"} · sorted by deadline
          </p>
        </div>
        {isK && (
          <Link href="/upload" className="btn btn-primary">
            Upload a contract
          </Link>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="label px-4 py-2">Deal</th>
              <th className="label px-4 py-2">Requested by</th>
              <th className="label px-4 py-2">Deadline</th>
              <th className="label px-4 py-2">{isK ? "Decision / system verdict" : "Decision"}</th>
              <th className="label px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((d) => {
              const brief = isK ? latestBrief(d.id) : null;
              const progress = isK && brief ? reviewProgress(d.id) : null;
              return (
                <tr key={d.id} className="border-b border-line last:border-0 hover:bg-paper/60">
                  <td className="px-4 py-3">
                    <Link href={`/deal/${d.id}`} className="font-semibold hover:underline">
                      {d.name}
                    </Link>
                    <div className="text-xs text-muted">
                      {d.documentIds.length} document{d.documentIds.length === 1 ? "" : "s"}
                      {d.clientCountry ? ` · ${d.clientCountry}` : ""}
                    </div>
                  </td>
                  <td className="px-4 py-3">{d.owner}</td>
                  <td className="px-4 py-3">
                    <DueBadge deadline={d.deadline} />
                  </td>
                  <td className="px-4 py-3">
                    {/* One plain style for every verdict: the subtext says whose call it is. Colour is for status only. */}
                    {d.decision && (d.finalised || isK) ? (
                      <div className="space-y-1">
                        <Plain>{d.decision}</Plain>
                        <div className="text-xs text-muted">
                          {d.finalised ? `Karandeep's decision${d.finalisedAt ? `, ${fmtDateTime(d.finalisedAt)}` : ""}` : "Draft decision, not finalised"}
                          {brief && ` · system verdict ${brief.verdict} (v${brief.version})`}
                        </div>
                      </div>
                    ) : brief ? (
                      <div className="space-y-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <Plain>{brief.verdict}</Plain>
                          {brief.complianceAlert && brief.complianceAlert.status !== "resolved" && <Chip tone="bad">Compliance alert</Chip>}
                        </span>
                        <div className="text-xs text-muted">System verdict, v{brief.version} · awaiting your decision</div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted">{isK ? "Not reviewed yet" : "No decision yet"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {d.finalised ? (
                      <Chip tone="good">Decided</Chip>
                    ) : progress?.started ? (
                      <Chip tone="warn">{progress.complete ? "Ready to finalise" : `Review in progress · ${progress.reacted}/${progress.total}`}</Chip>
                    ) : d.status === "waiting_for_input" ? (
                      <Chip tone="bad">Waiting for input</Chip>
                    ) : (
                      <Chip tone={STATUS_TONE[d.status]}>{STATUS_TEXT[d.status]}</Chip>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {signed.length > 0 && (
        <details className="card">
          <summary className="px-4 py-3 text-sm font-semibold">
            Signed · {signed.length} <span className="font-normal text-muted">· closed; their commitments are in the register</span>
          </summary>
          <table className="w-full border-t border-line text-sm">
            <tbody>
              {signed.map((d) => (
                <tr key={d.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2">
                    <Link href={`/deal/${d.id}`} className="font-semibold hover:underline">
                      {d.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{d.owner}</td>
                  <td className="px-4 py-2">
                    <Chip tone="good">Signed {d.signedAt ? fmtDateTime(d.signedAt) : ""}</Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      {!isK && (
        <p className="text-xs text-muted">Open a deal to check it before promising the client anything.</p>
      )}
    </div>
  );
}


import Link from "next/link";
import { Chip, DecisionBadge, DueBadge, VerdictBadge } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { reviewProgress } from "@/lib/review/progress";
import { visibleDeals } from "@/lib/access";
import { allDeals, latestBrief } from "@/lib/deals";
import { dueLabel } from "@/lib/format";
import { currentUser } from "@/lib/session";

const STATUS_TEXT: Record<string, string> = { open: "In review", waiting_for_input: "Waiting for input", decided: "Decided", signed: "Signed" };

/** Queue (F8, FR-14): due in / overdue from APP_TODAY, sorted by deadline. Deadline orders the list; it never changes risk. */
export default async function QueuePage(props: PageProps<"/">) {
  const user = await currentUser();
  const sp = await props.searchParams;
  const deals = visibleDeals(user, allDeals()).sort((a, b) => {
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
                    {/* Karandeep's decision is the headline once he has made it; the system verdict stays visible, smaller. */}
                    {d.decision && d.finalised ? (
                      <div className="space-y-1">
                        <DecisionBadge decision={d.decision} size="lg" />
                        <div className="text-xs text-muted">
                          Karandeep&apos;s decision{d.finalisedAt ? `, ${fmtDateTime(d.finalisedAt)}` : ""}
                          {brief && (
                            <>
                              {" "}· system: <b>{brief.verdict}</b> (v{brief.version})
                            </>
                          )}
                        </div>
                      </div>
                    ) : d.decision && isK ? (
                      <div className="space-y-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs text-muted">Draft:</span>
                          <DecisionBadge decision={d.decision} />
                        </span>
                        {brief && <div className="text-xs text-muted">System verdict {brief.verdict} (v{brief.version}) · not finalised</div>}
                      </div>
                    ) : brief ? (
                      <div className="space-y-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <VerdictBadge verdict={brief.verdict} />
                          {brief.complianceAlert && brief.complianceAlert.status !== "resolved" && <Chip tone="bad">Compliance alert</Chip>}
                        </span>
                        <div className="text-xs text-muted">System verdict, v{brief.version} · awaiting your decision</div>
                      </div>
                    ) : isK ? (
                      <span className="text-xs text-muted">Not reviewed yet</span>
                    ) : (
                      <span className="text-xs text-muted">No decision yet</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {d.finalised ? (
                      <Chip tone="brand">Decided</Chip>
                    ) : progress?.started ? (
                      <Chip tone="warn">
                        {progress.complete ? "Ready to finalise" : `Review in progress · ${progress.reacted}/${progress.total}`}
                      </Chip>
                    ) : d.status === "waiting_for_input" ? (
                      <Chip tone="warn">Waiting for input{d.waitingOn ? `: ${d.waitingOn}` : ""}</Chip>
                    ) : (
                      <Chip>{STATUS_TEXT[d.status]}</Chip>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!isK && (
        <p className="text-xs text-muted">Open a deal to check it before promising the client anything.</p>
      )}
    </div>
  );
}


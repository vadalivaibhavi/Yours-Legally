import Link from "next/link";
import { DueBadge, Chip, VerdictBadge } from "@/components/ui";
import { visibleDeals } from "@/lib/access";
import { allDeals, latestBrief } from "@/lib/deals";
import { dueLabel, usd } from "@/lib/format";
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
          <h1 className="font-serif text-2xl font-semibold">{isK ? "Contract queue" : `${user.name}'s deals`}</h1>
          <p className="text-sm text-muted">
            {deals.length} open {deals.length === 1 ? "deal" : "deals"} · sorted by client deadline · urgency sets the order, never how risks are judged
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
              <th className="label px-4 py-2">Owner</th>
              <th className="label px-4 py-2">Deadline</th>
              <th className="label px-4 py-2">Status</th>
              {isK && <th className="label px-4 py-2">Latest verdict</th>}
              <th className="label px-4 py-2 text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((d) => {
              const brief = isK ? latestBrief(d.id) : null;
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
                    {d.status === "waiting_for_input" ? <Chip tone="warn">Waiting for input{d.waitingOn ? `: ${d.waitingOn}` : ""}</Chip> : <Chip>{STATUS_TEXT[d.status]}</Chip>}
                    {d.decision && <div className="mt-1 text-xs text-muted">Decision: {d.decision}</div>}
                  </td>
                  {isK && (
                    <td className="px-4 py-3">
                      {brief ? (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <VerdictBadge verdict={brief.verdict} />
                          {brief.complianceAlert && brief.complianceAlert.status !== "resolved" && <Chip tone="bad">Compliance alert</Chip>}
                          <span className="text-xs text-muted">v{brief.version}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-muted">Not reviewed yet</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right tabular-nums">{usd(d.valueUsd)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!isK && (
        <p className="text-xs text-muted">
          You see your own deals only. Open a deal to run a deal check before promising the client anything.
        </p>
      )}
    </div>
  );
}

import Link from "next/link";
import { Chip, DueBadge } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { reviewProgress } from "@/lib/review/progress";
import { visibleDeals } from "@/lib/access";
import {
  allDeals,
  dealDocuments,
  getDeal,
  latestBrief,
  SIGN_DECISIONS,
} from "@/lib/deals";
import type { Deal } from "@/lib/types";
import { storeInRegister } from "@/app/deal/actions";
import { SaveButton } from "@/components/BriefControls";
import { QUOTA_MESSAGE } from "@/lib/limits";
import { dueLabel } from "@/lib/format";
import { currentUser } from "@/lib/session";

const STATUS_TEXT: Record<string, string> = {
  open: "In review",
  waiting_for_input: "Waiting for input",
  decided: "Decided",
};
/** Status colours: green = done, orange = in progress, red = waiting for input, blue = not started. */
const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "brand"> = {
  open: "brand",
  waiting_for_input: "bad",
  decided: "good",
};

/** A verdict or decision as plain text in a neutral chip (the verdict column has no colour). */
/** Queue sections by AtliQ's side of the table (from the deal's main document). */
const SECTIONS: [string, string][] = [
  ["supplier", "AtliQ selling: client deals"],
  ["buyer", "AtliQ buying: vendors and contractors"],
  ["partner", "Partnerships"],
  ["mutual", "Mutual NDAs"],
];
function sideOf(d: Deal): string {
  return dealDocuments(d)[0]?.sideOfTable ?? "supplier";
}

function Plain({ children }: { children: string }) {
  return (
    <span className="chip bg-gray-100 uppercase text-ink">{children}</span>
  );
}

/** Queue (F8, FR-14): due in / overdue from APP_TODAY, sorted by deadline. Deadline orders the list; it never changes risk. */
export default async function QueuePage(props: PageProps<"/">) {
  const user = await currentUser();
  const sp = await props.searchParams;
  const visible = visibleDeals(user, allDeals());
  // Deals stored in the contract register are done: they leave the queue.
  const deals = visible
    .filter((d) => d.status !== "signed")
    .sort((a, b) => {
      const da = dueLabel(a.deadline).days ?? 9999;
      const db = dueLabel(b.deadline).days ?? 9999;
      return da - db || a.name.localeCompare(b.name);
    });
  const isK = user.role === "karandeep";

  return (
    <div className="space-y-5">
      {typeof sp.stored === "string" && (
        <div className="card border-sign/40 bg-sign-soft px-4 py-3 text-sm text-sign">
          <b>{getDeal(sp.stored)?.name}</b> is stored in the contract register:{" "}
          {sp.n ?? 0} commitment{sp.n === "1" ? "" : "s"} added, unverified
          until you verify them.{" "}
          <Link href="/register" className="underline">
            Open the register
          </Link>
        </div>
      )}
      {typeof sp.storeFailed === "string" && (
        <div className="card bg-change-soft px-4 py-3 text-sm text-change">
          {sp.quota === "1" ? (
            QUOTA_MESSAGE
          ) : (
            <>
              Couldn&apos;t read <b>{getDeal(sp.storeFailed)?.name}</b> just now
              (the model is busy). It stays in the queue: try again in a minute.
            </>
          )}
        </div>
      )}
      {sp.denied && (
        <div className="card border-hold/30 bg-hold-soft px-4 py-3 text-sm text-hold">
          That page is for Karandeep only. Sellers see their own deals, deal
          checks and re-check banners.
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Contract queue</h1>
          <p className="text-sm text-muted">
            {deals.length} open {deals.length === 1 ? "deal" : "deals"} · sorted
            by deadline
          </p>
        </div>
        {isK && (
          <Link href="/upload" className="btn btn-primary">
            Upload a contract
          </Link>
        )}
      </div>

      {SECTIONS.map(([side, title]) => {
        const rows = deals.filter((d) => sideOf(d) === side);
        if (!rows.length) return null;
        return (
          <section key={side} className="space-y-2">
            <h2 className="label">
              {title} · {rows.length}
            </h2>
            <div className="card overflow-x-auto">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col className="w-[32%]" />
                  <col className="w-[13%]" />
                  <col className="w-[13%]" />
                  <col className="w-[24%]" />
                  <col className="w-[18%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="label px-4 py-2">Deal</th>
                    <th className="label px-4 py-2">Requested by</th>
                    <th className="label px-4 py-2">Deadline</th>
                    <th className="label px-4 py-2">
                      {isK ? "Decision / system verdict" : "Decision"}
                    </th>
                    <th className="label px-4 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => {
                    const brief = isK ? latestBrief(d.id) : null;
                    const progress = isK && brief ? reviewProgress(d.id) : null;
                    return (
                      <tr
                        key={d.id}
                        className="border-b border-line last:border-0 hover:bg-paper/60"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/deal/${d.id}`}
                            className="font-semibold hover:underline"
                          >
                            {d.name}
                          </Link>
                          <div className="text-xs text-muted">
                            {d.documentIds.length} document
                            {d.documentIds.length === 1 ? "" : "s"}
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
                                {d.finalised
                                  ? `Karandeep's decision${d.finalisedAt ? `, ${fmtDateTime(d.finalisedAt)}` : ""}`
                                  : "Draft decision, not finalised"}
                                {brief &&
                                  ` · system verdict ${brief.verdict} (v${brief.version})`}
                              </div>
                            </div>
                          ) : brief ? (
                            <div className="space-y-1">
                              <span className="flex flex-wrap items-center gap-1.5">
                                <Plain>{brief.verdict}</Plain>
                                {brief.complianceAlert &&
                                  brief.complianceAlert.status !==
                                    "resolved" && (
                                    <Chip tone="bad">Compliance alert</Chip>
                                  )}
                              </span>
                              <div className="text-xs text-muted">
                                System verdict, v{brief.version} · awaiting your
                                decision
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted">
                              {isK ? "Not reviewed yet" : "No decision yet"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {d.finalised ? (
                            <Chip tone="good">Decided</Chip>
                          ) : progress?.started ? (
                            <Chip tone="warn">
                              {progress.complete
                                ? "Ready to finalise"
                                : `Review in progress · ${progress.reacted}/${progress.total}`}
                            </Chip>
                          ) : d.status === "waiting_for_input" ? (
                            <Chip tone="bad">Waiting for input</Chip>
                          ) : (
                            <Chip tone={STATUS_TONE[d.status]}>
                              {STATUS_TEXT[d.status]}
                            </Chip>
                          )}
                          {isK && SIGN_DECISIONS.includes(d.decision ?? "") && (
                            <form
                              action={storeInRegister}
                              className="mt-1.5 flex justify-center"
                            >
                              <input type="hidden" name="dealId" value={d.id} />
                              <SaveButton
                                className="btn !py-1 !text-xs"
                                pendingLabel="Storing… (about 1 min)"
                                savedLabel="Stored ✓"
                              >
                                Store in contract register
                              </SaveButton>
                            </form>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      {!isK && (
        <p className="text-xs text-muted">
          Open a deal to check it before promising the client anything.
        </p>
      )}
    </div>
  );
}

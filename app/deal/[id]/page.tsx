import Link from "next/link";
import { notFound } from "next/navigation";
import { Chip, DueBadge, Section, VerdictBadge } from "@/components/ui";
import { canViewBrief, canViewDeal } from "@/lib/access";
import { briefVersions, dealContextDocuments, dealDocuments, dealNotes, getDeal, latestBrief } from "@/lib/deals";
import { fmtDate, usd } from "@/lib/format";
import { currentUser } from "@/lib/session";
import { sellerChecksFor } from "@/lib/sellerChecks";
import { SellerCheckPanel } from "@/components/SellerCheckPanel";
import { recheckDeal } from "@/app/deal/actions";


/** Re-checks run the review pipeline inside server actions on this page (Vercel: up to 300s). */
export const maxDuration = 300;

export default async function DealPage(props: PageProps<"/deal/[id]">) {
  const { id } = await props.params;
  const user = await currentUser();
  const deal = getDeal(id);
  if (!deal) notFound();
  if (!canViewDeal(user, deal)) {
    return <div className="card p-6 text-sm">This deal belongs to {deal.owner}. Sellers can only open their own deals (EV-A3).</div>;
  }
  const isK = canViewBrief(user);
  const docs = dealDocuments(deal);
  const context = dealContextDocuments(deal);
  const notes = dealNotes(deal);
  const versions = isK ? briefVersions(deal.id) : [];
  const latest = isK ? latestBrief(deal.id) : null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href="/" className="text-sm text-muted hover:underline">
          ← Queue
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-2xl font-semibold">{deal.name}</h1>
          <DueBadge deadline={deal.deadline} />
          {deal.status === "waiting_for_input" && <Chip tone="warn">Waiting for input: {deal.waitingOn}</Chip>}
          {deal.decision && <Chip tone="brand">Decision recorded: {deal.decision}</Chip>}
        </div>
        <p className="text-sm text-muted">
          {deal.counterparty} · owner {deal.owner} · {deal.clientCountry ?? "country unknown"} · {usd(deal.valueUsd)}
          {deal.deadlineNote ? ` · ${deal.deadlineNote}` : ""}
        </p>
      </div>

      {isK && (
        <Section title="Decision brief">
          {latest ? (
            <div className="card flex flex-wrap items-center gap-3 p-4">
              <VerdictBadge verdict={latest.verdict} size="lg" />
              <span className="font-medium">{latest.headline}</span>
              <Link href={`/deal/${deal.id}/brief/${latest.version}`} className="btn btn-primary ml-auto">
                Open brief v{latest.version}
              </Link>
              {versions.length > 1 && (
                <div className="w-full text-xs text-muted">
                  Versions:{" "}
                  {versions.map((v) => (
                    <Link key={v.version} href={`/deal/${deal.id}/brief/${v.version}`} className="mr-2 underline">
                      v{v.version} ({v.trigger}, {fmtDate(v.createdAt)})
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="card p-4 text-sm text-muted">No brief yet. Run `npm run review -- {deal.id}`.</div>
          )}
        </Section>
      )}

      <Section title={isK ? "Seller deal check (what the seller was told)" : "Deal check: is AtliQ free to offer this?"}>
        <SellerCheckPanel deal={deal} checks={sellerChecksFor(deal.id)} />
      </Section>

      <Section
        title={`Documents in this deal · ${docs.length}`}
        aside={
          <div className="flex gap-2">
            <Link href={`/upload?deal=${deal.id}`} className="btn !py-1 !text-xs">
              Upload into this deal
            </Link>
            {isK && (
              <form action={recheckDeal}>
                <input type="hidden" name="dealId" value={deal.id} />
                <button className="btn btn-primary !py-1 !text-xs">Re-check now</button>
              </form>
            )}
          </div>
        }
      >
        <div className="space-y-2">
          {docs.map((d) => (
            <details key={d.id} className="card p-4">
              <summary className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{d.title}</span>
                <Chip tone="brand">{d.docType}</Chip>
                <Chip>{d.paper === "atliq" ? "AtliQ's paper" : "Their paper"}</Chip>
                <span className="text-xs text-muted">received {fmtDate(d.date)}</span>
              </summary>
              <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded bg-paper p-3 font-serif text-sm">{d.text}</pre>
            </details>
          ))}
          {context.map((d) => (
            <details key={d.id} className="card p-4">
              <summary className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{d.title}</span>
                <Chip tone="good">Signed · context</Chip>
                <span className="text-xs text-muted">{fmtDate(d.date)}</span>
              </summary>
              <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded bg-paper p-3 font-serif text-sm">{d.text}</pre>
            </details>
          ))}
        </div>
      </Section>

      <div className="grid gap-6 md:grid-cols-2">
        <Section title={`Meeting notes · ${notes.length}`}>
          {notes.length ? (
            <div className="space-y-2">
              {notes.map((n) => (
                <details key={n.id} className="card p-4">
                  <summary className="font-medium">
                    {n.title} <span className="text-xs text-muted">· {fmtDate(n.date)}</span>
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap text-sm">{n.text}</pre>
                </details>
              ))}
            </div>
          ) : (
            <div className="card p-4 text-sm text-muted">No meeting notes attached to this deal.</div>
          )}
        </Section>
        <Section title="Deal record">
          <div className="card space-y-2 p-4 text-sm">
            {deal.trackerNotes.map((t) => (
              <p key={t}>{t}</p>
            ))}
            {deal.linkedDealIds.length > 0 && (
              <p>
                Linked deals:{" "}
                {deal.linkedDealIds.map((l) => {
                  const ld = getDeal(l);
                  return ld && canViewDeal(user, ld) ? (
                    <Link key={l} href={`/deal/${l}`} className="mr-2 underline">
                      {ld.name}
                    </Link>
                  ) : (
                    <span key={l} className="mr-2">
                      {ld?.name ?? l}
                    </span>
                  );
                })}
              </p>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}

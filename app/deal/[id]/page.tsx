import Link from "next/link";
import { notFound } from "next/navigation";
import { Chip, DueBadge, Section, VerdictBadge } from "@/components/ui";
import { canViewBrief, canViewDeal } from "@/lib/access";
import { briefVersion, briefVersions, dealContextDocuments, dealDocuments, dealNotes, getDeal, latestBrief } from "@/lib/deals";
import { BriefView } from "@/components/BriefView";
import { DocumentFacts } from "@/components/DocumentFacts";
import { SaveButton } from "@/components/BriefControls";
import { Collapsible } from "@/components/Fields";
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
  // ?v=N picks a version; ?open=1 (or a version link) opens the brief in place.
  const sp = await props.searchParams;
  const shown = isK ? (sp.v ? briefVersion(deal.id, Number(sp.v)) : null) ?? latest : null;
  const openBrief = sp.open === "1" || !!sp.v;
  const factsFor = (docId: string) => (shown ?? latest)?.documents.find((x) => x.docId === docId);

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
          {deal.counterparty} · requested by {deal.owner} · {deal.clientCountry ?? "country unknown"} · {usd(deal.valueUsd)}
          {deal.deadlineNote ? ` · ${deal.deadlineNote}` : ""}
        </p>
      </div>

      {isK && (
        <section id="brief" className="scroll-mt-4 space-y-3">
          <h2 className="label">Decision brief</h2>
          {shown ? (
            <Collapsible
              key={shown.version}
              defaultOpen={openBrief}
              summary={
                <>
                  <VerdictBadge verdict={shown.verdict} size="lg" />
                  <span className="font-medium">{shown.headline}</span>
                  <span className="text-xs text-muted">
                    v{shown.version}
                    {versions.length > 1 ? ` of ${versions.length}` : ""}
                  </span>
                </>
              }
            >
              <BriefView dealId={deal.id} version={shown.version} />
            </Collapsible>
          ) : (
            <div className="card p-4 text-sm text-muted">No brief yet. Run `npm run review -- {deal.id}`.</div>
          )}
        </section>
      )}

      {/* The deal check is the seller's tool (F7); Karandeep sees its effect as the deal-facts mismatch finding in the brief (FR-20). */}
      {!isK && (
        <Section title="Deal check: is AtliQ free to offer this?">
          <SellerCheckPanel deal={deal} checks={sellerChecksFor(deal.id)} />
        </Section>
      )}

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
                <SaveButton className="btn btn-primary !py-1 !text-xs" pendingLabel="Re-checking… (1–3 min)" savedLabel="Re-checked ✓">
                  Re-check now
                </SaveButton>
              </form>
            )}
          </div>
        }
      >
        <div className="space-y-2">
          {docs.map((d) => (
            <details key={d.id} className="card p-4" open={isK && docs.length === 1}>
              <summary className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{d.title}</span>
                <Chip tone="brand">{d.docType}</Chip>
                <Chip>{d.paper === "atliq" ? "AtliQ's paper" : "Their paper"}</Chip>
                <span className="text-xs text-muted">received {fmtDate(d.date)}</span>
              </summary>
              {/* Contract facts live with their document (FR-4): what was extracted, from which clause, and the rule checks. */}
              {isK && factsFor(d.id) && <DocumentFacts review={factsFor(d.id)!} />}
              <details className="mt-3">
                <summary className="text-sm font-medium text-brand">Full text</summary>
                <pre className="mt-2 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded bg-paper p-3 font-serif text-sm">{d.text}</pre>
              </details>
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

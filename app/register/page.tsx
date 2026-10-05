import Link from "next/link";
import { notFound } from "next/navigation";
import { Chip, Quote } from "@/components/ui";
import { RegisterActions } from "@/components/RegisterActions";
import { AutoSubmitSelect } from "@/components/Fields";
import { canViewRegister } from "@/lib/access";
import { baseRegister } from "@/lib/data";
import { allDeals, documentById, latestBrief } from "@/lib/deals";
import { fmtDate } from "@/lib/format";
import { registerCoverage, registerEntries, registerVersion } from "@/lib/register";
import { currentUser } from "@/lib/session";
import type { RegisterEntry } from "@/lib/types";

const TYPE_LABEL: Record<string, string> = {
  non_compete: "Non-compete",
  exclusivity: "Exclusivity",
  mfn_pricing: "Pricing promise (MFN)",
  ip_transfer: "IP given away",
  ip_retention: "IP never received",
  data_location: "Data location",
  insurance: "Insurance",
  non_solicit: "Non-solicit / no-hire",
  compliance: "Compliance obligation",
  other: "Other",
};
/** Two different jobs: restrictions decide whether a NEW deal can be signed; duties are what AtliQ must keep doing on SIGNED ones. */
const VIEWS: [string, string, string][] = [
  ["restrictions", "Restrictions: can block a new deal", "Promises that limit what AtliQ can sell, to whom, where or at what price, and IP it has given away. The conflict check reads these on every new contract and every seller check."],
  ["obligations", "Duties: keep performing on signed contracts", "What AtliQ must keep doing for existing clients: where data may live, breach-notice windows, insurance to hold, audit rights, consent before subcontracting. They rarely block a new deal, but they feed the deal-bundle and compliance checks (e.g. Harrington's NDA: no patient data before a BAA), and delivery teams must honour them."],
  ["all", "Everything", "Every commitment extracted from the signed contracts."],
];
const RESTRICTIVE = ["non_compete", "exclusivity", "mfn_pricing", "ip_transfer", "ip_retention", "non_solicit"];

/** Register screen (FR-2): Karandeep only. Filter by live/expired, client, region, type. */
export default async function RegisterPage(props: PageProps<"/register">) {
  const user = await currentUser();
  if (!canViewRegister(user)) notFound();
  const sp = await props.searchParams;
  const q = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const all = registerEntries({ includeRejected: true });
  const clients = [...new Set(all.map((e) => e.counterparty))].sort();
  const regions = [...new Set(all.flatMap((e) => e.scope.regions))].sort();
  const view = q("view") || "restrictions";

  const filtered = all.filter(
    (e) =>
      (!q("type") || e.type === q("type")) &&
      (!q("client") || e.counterparty === q("client")) &&
      (!q("region") || e.scope.regions.includes(q("region") as never)) &&
      (!q("status") || e.status === q("status")) &&
      (view === "all" || (view === "restrictions" ? RESTRICTIVE.includes(e.type) && !e.routine : !RESTRICTIVE.includes(e.type) || e.routine)),
  );
  const groups: [string, RegisterEntry[]][] = [
    ["Live", filtered.filter((e) => e.status === "live" && !e.rejected)],
    ["End date unknown (treated as live)", filtered.filter((e) => e.status === "unknown" && !e.rejected)],
    ["Expired: kept for history, never flagged", filtered.filter((e) => e.status === "expired" && !e.rejected)],
    ["Rejected by Karandeep: not used in checks", filtered.filter((e) => e.rejected)],
  ];
  const deals = allDeals();
  const coverage = registerCoverage();
  const unverified = all.filter((e) => !e.verified && !e.rejected).length;
  const reg = baseRegister();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold">Obligations register</h1>
          <p className="text-sm text-muted">
            Everything AtliQ has already promised, built by AI from {coverage.length} signed documents ({fmtDate(reg.builtAt)}). Version {registerVersion()}.{" "}
            {unverified} entries unverified: they are used in every check now, and labelled until you verify them.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2 text-sm">
          {VIEWS.map(([v, label]) => (
            <Link key={v} href={{ query: { ...sp, view: v } }} className={`btn ${view === v ? "btn-primary" : ""}`}>
              {label}
            </Link>
          ))}
        </div>
        <p className="text-sm text-muted">{VIEWS.find(([v]) => v === view)?.[2]}</p>
      </div>

      {/* key: remount on every URL change so "Clear" and tab switches reset the selects */}
      <form key={JSON.stringify(sp)} className="card flex flex-wrap items-end gap-3 p-3 text-sm">
        <input type="hidden" name="view" value={view} />
        <label className="flex flex-col gap-1">
          <span className="label">Status</span>
          <AutoSubmitSelect name="status" defaultValue={q("status")}>
            <option value="">Any</option>
            <option value="live">Live</option>
            <option value="expired">Expired</option>
            <option value="unknown">Unknown</option>
          </AutoSubmitSelect>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Type</span>
          <AutoSubmitSelect name="type" defaultValue={q("type")}>
            <option value="">Any</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </AutoSubmitSelect>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Client</span>
          <AutoSubmitSelect name="client" defaultValue={q("client")}>
            <option value="">Any</option>
            {clients.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </AutoSubmitSelect>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Region</span>
          <AutoSubmitSelect name="region" defaultValue={q("region")}>
            <option value="">Any</option>
            {regions.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </AutoSubmitSelect>
        </label>
        <Link href={{ query: { view } }} className="btn">
          Clear filters
        </Link>
        <span className="text-xs text-muted">Filters apply as you choose.</span>
      </form>

      {groups.map(([title, entries]) =>
        entries.length ? (
          <section key={title} className="space-y-3">
            <h2 className="label">
              {title} · {entries.length}
            </h2>
            {entries.map((e) => (
              <EntryCard key={e.id} e={e} affects={affectedDeals(e, deals)} />
            ))}
          </section>
        ) : null,
      )}
      {!filtered.length && <div className="card p-6 text-sm text-muted">No entries match these filters.</div>}

      <section className="space-y-2">
        <h2 className="label">Coverage: what the register has (and hasn&apos;t) seen</h2>
        <div className="card divide-y divide-line text-sm">
          {coverage.map((c) => (
            <div key={c.docId} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-2">
              <span className="w-56 font-medium">{documentById(c.docId)?.title ?? c.docId}</span>
              <span className="text-muted">{c.entryCount} entries</span>
              {c.illegible.map((i) => (
                <Chip key={i.clauseRef} tone="bad">
                  Illegible {i.clauseRef}: check the original
                </Chip>
              ))}
              {c.referencedButMissing.slice(0, 3).map((m) => (
                <span key={m.name} className="text-xs text-muted">
                  Not seen: {m.name}
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function affectedDeals(e: RegisterEntry, deals: ReturnType<typeof allDeals>) {
  // Impact (PRD §9.1 Register screen): open deals whose latest brief cites this entry.
  return deals.filter((d) => d.status !== "signed").filter((d) => briefCites(d.id, e.id));
}

function briefCites(dealId: string, entryId: string) {
  return !!latestBrief(dealId)?.findings.some((f) => f.registerEntryId === entryId);
}

function EntryCard({ e, affects }: { e: RegisterEntry; affects: { id: string; name: string }[] }) {
  const doc = documentById(e.sourceDocId);
  return (
    <article id={e.id} className={`card space-y-3 p-4 ${e.rejected ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{e.title}</h3>
            <Chip tone="brand">{TYPE_LABEL[e.type]}</Chip>
            {e.status === "expired" ? <Chip>Expired {fmtDate(e.end)}</Chip> : e.status === "unknown" ? <Chip tone="warn">End date unknown</Chip> : <Chip tone="bad">Live{e.end ? ` until ${fmtDate(e.end)}` : e.perpetual ? " (permanent)" : ""}</Chip>}
            {e.verified ? <Chip tone="good">Verified</Chip> : !e.rejected && <Chip tone="warn">Unverified</Chip>}
            {e.routine && <Chip>Routine</Chip>}
          </div>
          <p className="text-sm text-muted">{e.summary}</p>
        </div>
        <RegisterActions entry={e} />
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <Row k="Source">
          {e.counterparty} · {doc?.title} · {e.clauseRef}
        </Row>
        <Row k="Binds">
          {e.bindsEntities.join(" + ")}
          {e.includesAffiliates ? " (incl. Affiliates)" : ""}
        </Row>
        {(e.scope.sectors.length > 0 || e.scope.regions.length > 0) && (
          <Row k="Scope">{[e.scope.sectors.join(", "), e.scope.regions.join(", ")].filter(Boolean).join(" · ")}</Row>
        )}
        {e.scope.services.length > 0 && <Row k="Services">{e.scope.services.join(", ")}</Row>}
        {e.scope.assets.length > 0 && <Row k="Assets">{e.scope.assets.join(", ")}</Row>}
        {e.scope.counterparties.length > 0 && <Row k="Limited to">{e.scope.counterparties.join(", ")}</Row>}
        <Row k="Runs">{e.endRule ?? (e.perpetual ? "Permanent" : fmtDate(e.end))}</Row>
        {e.waivers.map((w) => (
          <Row key={w.docId} k="Waiver">
            {w.covers} ({documentById(w.docId)?.title})
          </Row>
        ))}
        {affects.length > 0 && (
          <Row k="Affects">
            {affects.map((d, i) => (
              <span key={d.id}>
                {i > 0 && ", "}
                <Link href={`/deal/${d.id}`} className="underline">
                  {d.name}
                </Link>
              </span>
            ))}
          </Row>
        )}
      </dl>
      <details>
        <summary className="text-sm font-medium text-brand">Source clause{e.relatedClauses.length ? ` + ${e.relatedClauses.length} definitions` : ""}</summary>
        <div className="mt-2 space-y-3">
          <Quote cite={`${e.counterparty} ${e.clauseRef}`}>{e.quote}</Quote>
          {e.relatedClauses.map((r) => (
            <Quote key={r.clauseRef} cite={r.clauseRef}>
              {r.quote}
            </Quote>
          ))}
        </div>
      </details>
    </article>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-muted">{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}

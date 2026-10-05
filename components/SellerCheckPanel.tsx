import { runDealCheck } from "@/app/deal/actions";
import { Chip } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { sellerBanner } from "@/lib/seller";
import type { SellerCheck } from "@/lib/store";
import type { DealView } from "@/lib/deals";

const STATUS: Record<string, { label: string; tone: "good" | "warn" | "bad" | "gray"; dot: string }> = {
  clear: { label: "Clear", tone: "good", dot: "🟢" },
  attention: { label: "Needs attention", tone: "warn", dot: "🟠" },
  conflict: { label: "Conflict", tone: "bad", dot: "🔴" },
  couldnt_check: { label: "Couldn't check", tone: "gray", dot: "⚪" },
};

const SECTORS = ["hospitality", "travel", "retail", "healthcare", "bfsi", "logistics", "manufacturing", "food", "technology", "data_platform", "other"];

/** F7 deal kick-off check (FR-13) + re-check banner (FR-19). Answers never reveal other clients' names or rates. */
export function SellerCheckPanel({ deal, checks }: { deal: DealView; checks: SellerCheck[] }) {
  const latest = checks[checks.length - 1] ?? null;
  const banner = sellerBanner(latest);
  const prev = latest?.input;
  return (
    <div className="space-y-4">
      {banner.show && latest && (
        <div className="card flex flex-wrap items-center gap-3 border-change bg-change-soft p-4 text-sm text-change">
          <span>
            Re-checked on {fmtDate(new Date().toISOString())}: {banner.reason}. Your answer from {fmtDate(latest.asOf)} may be out of date. Re-run your check.
          </span>
        </div>
      )}
      {latest && (
        <div className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">Heads-up for {latest.input.client}</h3>
            <span className="text-xs text-muted">
              by {latest.by} · {new Date(latest.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
            </span>
          </div>
          <ul className="space-y-3">
            {latest.items.map((i) => (
              <li key={i.item} className="space-y-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span>{STATUS[i.status].dot}</span>
                  <b>{i.item}</b>
                  <Chip tone={STATUS[i.status].tone}>{STATUS[i.status].label}</Chip>
                </div>
                <p>{i.meaning}</p>
                <p className="text-muted">→ {i.todo}</p>
                {i.source && <p className="text-xs text-muted">Source: AtliQ commitments register, signed client agreement {i.source.clauseRef} (client name withheld)</p>}
              </li>
            ))}
          </ul>
          <p className="rounded bg-paper p-2 text-xs text-muted">
            As of {fmtDate(latest.asOf)}, based on what you told us and AtliQ&apos;s commitments at that time (register {latest.registerVersion}). The contract review is the final word.
          </p>
          {checks.length > 1 && (
            <details className="text-xs text-muted">
              <summary>Earlier answers ({checks.length - 1}) are kept with their dates</summary>
              <ul className="mt-1 space-y-1">
                {checks.slice(0, -1).map((c) => (
                  <li key={c.id}>
                    {fmtDate(c.asOf)} by {c.by}: {c.items.map((i) => `${i.item.split(":")[0]} ${STATUS[i.status].label}`).join(" · ")}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      <details className="card p-4" open={!latest}>
        <summary className="font-semibold">{latest ? "Update the plan and re-run the check" : "Run a deal check before promising the client anything"}</summary>
        <form action={runDealCheck} className="mt-3 grid gap-3 text-sm md:grid-cols-2">
          <input type="hidden" name="dealId" value={deal.id} />
          <label className="space-y-1">
            <span className="label">Client</span>
            <input name="client" defaultValue={prev?.client ?? deal.counterparty} className="w-full" />
          </label>
          <label className="space-y-1">
            <span className="label">Regions / sites (comma-separated countries)</span>
            <input name="regions" defaultValue={prev?.regions.join(", ") ?? deal.clientCountry ?? ""} placeholder="e.g. India, UAE, Oman" className="w-full" />
          </label>
          <fieldset className="space-y-1 md:col-span-2">
            <span className="label">Client sector</span>
            <div className="flex flex-wrap gap-3">
              {SECTORS.map((s) => (
                <label key={s} className="flex items-center gap-1">
                  <input type="checkbox" name="sectors" value={s} defaultChecked={prev?.sectors.includes(s)} /> {s.replace("_", " ")}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="space-y-1">
            <span className="label">Services</span>
            <input name="services" defaultValue={prev?.services.join(", ")} placeholder="e.g. revenue management analytics" className="w-full" />
          </label>
          <label className="space-y-1">
            <span className="label">Tools / IP to reuse</span>
            <input name="assets" defaultValue={prev?.assets.join(", ")} placeholder="e.g. PipeKit" className="w-full" />
          </label>
          <label className="space-y-1">
            <span className="label">Rates by role (one per line: role $rate)</span>
            <textarea name="rates" rows={3} defaultValue={prev?.rates.map((r) => `${r.role} $${r.ratePerHourUsd}`).join("\n")} placeholder="Senior Data Engineer $72" className="w-full" />
          </label>
          <label className="space-y-1">
            <span className="label">Who touches the data, and where</span>
            <textarea name="dataHandling" rows={3} defaultValue={prev?.dataHandling} placeholder="e.g. Pune team, de-identified only" className="w-full" />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="partnership" defaultChecked={prev?.partnership} /> This is a platform partnership (implementation / reseller / referral)
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="label">Anything else you&apos;re promising? (also: anything agreed or shared in meetings?)</span>
            <input name="freeText" defaultValue={prev?.freeText} className="w-full" />
          </label>
          <div className="md:col-span-2">
            <button className="btn btn-primary">Check</button>
            <span className="ml-3 text-xs text-muted">Only changed items are re-checked. Silence is never &quot;safe&quot;: anything unmatched says &quot;couldn&apos;t check&quot;.</span>
          </div>
        </form>
      </details>
    </div>
  );
}

"use client";
/**
 * Seller deal-check form (F7). Never evaluates an empty plan: client, sector, regions/sites and services
 * are required (checked here and again on the server), so a blank submit gets "main details are missing",
 * never a green answer. Every text box has a character limit with a live counter.
 */
import { useActionState } from "react";
import { runDealCheck, type DealCheckState } from "@/app/deal/actions";
import { TextArea, TextInput } from "@/components/Fields";
import { LIMITS } from "@/lib/limits";
import type { SellerInput } from "@/lib/store";

const SECTORS = ["hospitality", "travel", "retail", "healthcare", "bfsi", "logistics", "manufacturing", "food", "technology", "data_platform", "other"];

export function SellerCheckForm({ dealId, defaults }: { dealId: string; defaults: Partial<SellerInput> & { client: string } }) {
  const [state, action, pending] = useActionState<DealCheckState, FormData>(runDealCheck, {});
  return (
    <form action={action} className="mt-3 grid gap-3 text-sm md:grid-cols-2" noValidate>
      <input type="hidden" name="dealId" value={dealId} />
      {state.error && (
        <div role="alert" className="rounded-lg border border-change bg-change-soft p-3 text-change md:col-span-2">
          <b>Not evaluated.</b> {state.error}
        </div>
      )}
      <label className="space-y-1">
        <span className="label">Client *</span>
        <TextInput name="client" defaultValue={defaults.client} max={LIMITS.name} />
      </label>
      <label className="space-y-1">
        <span className="label">Regions / sites * (comma-separated countries)</span>
        <TextInput name="regions" defaultValue={defaults.regions?.join(", ")} placeholder="e.g. India, UAE, Oman" max={LIMITS.list} />
      </label>
      <fieldset className="space-y-1 md:col-span-2">
        <span className="label">Client sector * (at least one)</span>
        <div className="flex flex-wrap gap-3">
          {SECTORS.map((s) => (
            <label key={s} className="flex items-center gap-1">
              <input type="checkbox" name="sectors" value={s} defaultChecked={defaults.sectors?.includes(s)} /> {s.replace("_", " ")}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="space-y-1">
        <span className="label">Services *</span>
        <TextInput name="services" defaultValue={defaults.services?.join(", ")} placeholder="e.g. revenue management analytics" max={LIMITS.list} />
      </label>
      <label className="space-y-1">
        <span className="label">Tools / IP to reuse</span>
        <TextInput name="assets" defaultValue={defaults.assets?.join(", ")} placeholder="e.g. PipeKit" max={LIMITS.list} />
      </label>
      <label className="space-y-1">
        <span className="label">Rates by role (one per line: role $rate)</span>
        <TextArea name="rates" rows={3} defaultValue={defaults.rates?.map((r) => `${r.role} $${r.ratePerHourUsd}`).join("\n")} placeholder="Senior Data Engineer $72" max={LIMITS.rates} />
      </label>
      <label className="space-y-1">
        <span className="label">Who touches the data, and where</span>
        <TextArea name="dataHandling" rows={3} defaultValue={defaults.dataHandling} placeholder="e.g. Pune team, de-identified only" max={LIMITS.note} />
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="partnership" defaultChecked={defaults.partnership} /> This is a platform partnership (implementation / reseller / referral)
      </label>
      <label className="space-y-1 md:col-span-2">
        <span className="label">Anything else you&apos;re promising? (also: anything agreed or shared in meetings?)</span>
        <TextInput name="freeText" defaultValue={defaults.freeText} max={LIMITS.freeText} />
      </label>
      <div className="md:col-span-2">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Checking…" : "Check"}
        </button>
        <span className="ml-3 text-xs text-muted">* required</span>
      </div>
    </form>
  );
}

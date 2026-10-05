/**
 * F7 seller deal check (FR-13, FR-19). A short form → per item clear / needs attention / conflict,
 * scoped to AtliQ's obligations and conflicts only. Register lookups are the same structured filters
 * as F3. Answers describe what a commitment MEANS for the deal, never another client's name, rates
 * or terms (PRD §7.2, EV-A2). Unmatched free text is "couldn't check: ask Karandeep", never "clear".
 * Every answer is stamped with the date and register version (the contract review is the final word).
 */
import { z } from "zod";
import { appToday } from "./config";
import { allDocuments, briefVersions } from "./deals";
import { intersectRegions } from "./geo";
import { callModel } from "./llm";
import { registerEntries, registerVersion } from "./register";
import { filterRegister } from "./review/conflict";
import { type SellerCheck, type SellerInput, type SellerItem } from "./store";
import { Region, Sector, type RegisterEntry } from "./types";

const roleKey = (r: string) => r.toLowerCase().replace(/senior/g, "sr").replace(/[^a-z]/g, "");

function waiverCovers(e: RegisterEntry, client: string): boolean {
  const c = client.toLowerCase().trim();
  return c.length > 2 && e.waivers.some((w) => w.covers.toLowerCase().includes(c));
}

function sourceOf(e: RegisterEntry): SellerItem["source"] {
  return { counterpartyHidden: true, clauseRef: e.clauseRef, registerEntryId: e.id };
}

const TYPE_MEANING: Record<string, string> = {
  non_compete: "AtliQ (including AtliQ Inc and Pvt Ltd) has promised a past client not to provide",
  exclusivity: "AtliQ has an exclusive platform partnership that stops it acting as implementation, reseller or referral partner for competing platforms",
};

function regionItem(input: SellerInput, entries: RegisterEntry[], sourceTexts: Map<string, string>): SellerItem {
  const facts = { entities: ["Pvt Ltd", "Inc"], sectors: input.sectors, regions: input.regions, assets: [], hasRates: false, services: input.services, partnership: input.partnership };
  const hits = filterRegister(entries, facts, sourceTexts).filter((c) => c.entry.type === "non_compete" || (c.entry.type === "exclusivity" && input.partnership));
  const label = `Sector & regions: ${input.sectors.join(", ") || "—"} · ${input.regions.join(", ") || "—"}`;
  const live = hits.filter((h) => !waiverCovers(h.entry, input.client));
  if (!live.length)
    return {
      item: label,
      status: "clear",
      meaning: hits.length ? `A restriction would apply, but a written waiver covers ${input.client}.` : "No live AtliQ commitment restricts this sector in these regions.",
      todo: "Re-check if the sites, regions or services change.",
    };
  const e = live[0].entry;
  const where = intersectRegions(e.scope.regions, input.regions).join(", ");
  return {
    item: label,
    status: "conflict",
    meaning:
      e.type === "non_compete"
        ? `${TYPE_MEANING.non_compete} ${e.scope.services.join(", ") || "these services"} to ${e.scope.sectors.join("/")} businesses in ${where}, until ${e.end ?? "an unknown date"}. Delivering from India or through the other AtliQ entity doesn't change that.`
        : `${TYPE_MEANING.exclusivity} in ${where}, until ${e.end ?? "an unknown date"}.`,
    todo: "Talk to Karandeep before proposing anything. Only a written waiver or a change of scope can clear this.",
    source: sourceOf(e),
  };
}

function rateItems(input: SellerInput, entries: RegisterEntry[]): SellerItem[] {
  const floors = entries.filter((e) => e.type === "mfn_pricing" && !e.rejected && e.status !== "expired" && e.terms.rateFloor?.length);
  return input.rates.map((r) => {
    const label = `Rate: ${r.role} at $${r.ratePerHourUsd}/hr`;
    for (const e of floors) {
      const floor = e.terms.rateFloor!.find((f) => roleKey(f.role) === roleKey(r.role));
      if (!floor) continue;
      if (r.ratePerHourUsd < floor.ratePerHourUsd)
        return {
          item: label,
          status: "conflict" as const,
          meaning: `A pricing floor applies to this role: AtliQ has promised another customer that nobody gets a lower rate for similar work until ${e.end}. Offering this rate could trigger retroactive credits to that customer.`,
          todo: "Don't quote this rate yet. Talk to Karandeep: he'll tell you the minimum you can offer.",
          source: sourceOf(e),
        };
      return { item: label, status: "clear" as const, meaning: "At or above every pricing floor AtliQ has committed to.", todo: "Keep future discounts above the floor; re-check before any change." };
    }
    return floors.length
      ? { item: label, status: "couldnt_check" as const, meaning: "This role isn't on the committed rate cards, so it couldn't be compared.", todo: "Ask Karandeep before quoting." }
      : { item: label, status: "clear" as const, meaning: "No pricing promise is live.", todo: "—" };
  });
}

function assetItems(input: SellerInput, entries: RegisterEntry[], sourceTexts: Map<string, string>): SellerItem[] {
  return input.assets.map((a) => {
    const hit = filterRegister(entries, { entities: ["Pvt Ltd", "Inc"], sectors: [], regions: [], assets: [a], hasRates: false, services: [] }, sourceTexts).find((c) => c.entry.type === "ip_transfer" || c.entry.type === "ip_retention");
    return hit
      ? {
          item: `Reuse: ${a}`,
          status: "attention" as const,
          meaning: `Ownership of ${a} is unclear: a signed agreement assigned the tools incorporated in its deliverables to that client. AtliQ may not be able to promise ${a} (or warrant owning it) to a new client.`,
          todo: "Talk to Karandeep before offering it; this may need counsel.",
          source: sourceOf(hit.entry),
        }
      : { item: `Reuse: ${a}`, status: "clear" as const, meaning: "No commitment found that gave this tool away.", todo: "—" };
  });
}

function dataItem(input: SellerInput): SellerItem | null {
  const t = `${input.dataHandling} ${input.services.join(" ")} ${input.sectors.join(" ")}`.toLowerCase();
  if (/\b(patients?|phi|healthcare|health data|medical|clinics?|hospitals?)\b/.test(t))
    return { item: "Data handling", status: "attention", meaning: "Patient data needs NDA + MSA + BAA, plus a sub-BAA for every party that touches it (including the Pune team), before any data moves.", todo: "Don't accept sample data until Karandeep confirms the agreements are signed." };
  if (/germany|europe|eu\b|gdpr/.test(t + " " + input.regions.join(" ").toLowerCase()))
    return { item: "Data handling", status: "attention", meaning: "EU personal data needs a DPA with transfer clauses (SCCs) before it reaches India or any subcontractor.", todo: "Ask the client for their DPA early." };
  return null;
}

const FreeText = z.object({
  checkable: z.boolean().describe("true only if the promise is about: serving a sector/region, a price/rate, reusing a tool/IP, a platform partnership"),
  sectors: z.array(Sector),
  regions: z.array(Region),
  assets: z.array(z.string()),
  partnership: z.boolean(),
});

async function freeTextItem(input: SellerInput, entries: RegisterEntry[], sourceTexts: Map<string, string>): Promise<SellerItem | null> {
  if (!input.freeText.trim()) return null;
  const item = `Also promising: "${input.freeText.trim()}"`;
  const r = await callModel({
    task: "classify",
    system: "Map a seller's free-text promise onto checkable commitment types. If it is about anything else (staffing, named people, timelines, service levels, features), checkable=false.",
    input: input.freeText,
    schema: FreeText,
  });
  if (!r.ok || !r.data.checkable) return { item, status: "couldnt_check", meaning: "This isn't something the commitments register can check.", todo: "Couldn't check: ask Karandeep before promising it." };
  const sub = regionItem({ ...input, sectors: r.data.sectors.length ? r.data.sectors : input.sectors, regions: r.data.regions.length ? r.data.regions : input.regions, partnership: r.data.partnership }, entries, sourceTexts);
  const assets = assetItems({ ...input, assets: r.data.assets }, entries, sourceTexts);
  const worst = [sub, ...assets].sort((a, b) => rank(b.status) - rank(a.status))[0];
  return { ...worst, item };
}
const rank = (s: SellerItem["status"]) => ({ clear: 0, couldnt_check: 1, attention: 2, conflict: 3 })[s];

export async function runSellerCheck(dealId: string, by: string, input: SellerInput, previous?: SellerCheck | null): Promise<SellerCheck> {
  const entries = registerEntries();
  const sourceTexts = new Map(allDocuments().filter((d) => d.kind === "signed").map((d) => [d.id, d.text]));
  // No sector or region → nothing to match against: never "clear" (silence is never safe).
  const mainItem: SellerItem =
    !input.sectors.length || !input.regions.length
      ? { item: "Sector & regions", status: "couldnt_check", meaning: "The sector and regions/sites weren't given, so AtliQ's restrictions couldn't be checked.", todo: "Fill in the main details and check again." }
      : regionItem(input, entries, sourceTexts);
  const items: SellerItem[] = [mainItem, ...rateItems(input, entries), ...assetItems(input, entries, sourceTexts)];
  const data = dataItem(input);
  if (data) items.push(data);
  // FR-13: only changed items are re-run; unchanged free text keeps its previous answer (no model call).
  const prevFree = previous && previous.input.freeText.trim() === input.freeText.trim() ? previous.items.find((i) => i.item.startsWith("Also promising")) : null;
  const free = prevFree ?? (await freeTextItem(input, entries, sourceTexts));
  if (free) items.push(free);
  const versions = briefVersions(dealId);
  return {
    id: `${dealId}-${Date.now()}`,
    dealId,
    by,
    at: new Date().toISOString(),
    asOf: appToday(),
    registerVersion: registerVersion(),
    briefVersionAtCheck: versions.length ? versions[versions.length - 1].version : 0,
    input,
    items,
  };
}

/** FR-19: the answer may be stale if a newer brief version exists or the register changed since. */
export function sellerBanner(check: SellerCheck | null): { show: boolean; reason: string } {
  if (!check) return { show: false, reason: "" };
  const versions = briefVersions(check.dealId);
  const latest = versions.length ? versions[versions.length - 1].version : 0;
  if (latest > check.briefVersionAtCheck) return { show: true, reason: `Karandeep re-checked this deal's contract (brief v${latest})` };
  if (check.registerVersion !== registerVersion() && check.registerVersion !== "pre-register") return { show: true, reason: "AtliQ's commitments register changed" };
  return { show: false, reason: "" };
}

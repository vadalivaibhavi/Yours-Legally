/**
 * FR-25 (client meeting 2, 10 Oct): expired restrictions shown as context, never as findings.
 * An expired register entry is never a conflict candidate (lib/review/conflict.ts). But when it would
 * otherwise match the deal, the brief says it was considered: "Checked, expired: [commitment], [source
 * clause], ended [date]", so Karandeep sees it wasn't missed. It never becomes a finding, never changes
 * severity or the verdict, and is shown in Karandeep's brief only. Rules only, computed on every view.
 *
 * "Would otherwise match" (PRD FR-25): same client, sector, asset or pricing scope as the deal; a region
 * overlap is shown alongside but never enough on its own.
 */
import { baseDeals, baseDocuments } from "../data";
import { regionsOverlap } from "../geo";
import { registerEntries } from "../register";
import { readState } from "../store";
import type { Document, RegisterEntry } from "../types";
import type { Brief } from "./types";

/** Restrictions: the kinds that would otherwise be compared with a deal (and non-solicits). */
const RESTRICTION = new Set(["non_compete", "exclusivity", "mfn_pricing", "ip_transfer", "ip_retention", "non_solicit"]);
const RATES = /(\$|USD|US\$|EUR|€|INR|₹)\s?\d[\d,.]*\s*(\/\s*(hr|hour)|per hour)|hourly rate|rate card/i;

export type ExpiredContext = { entryId: string; sourceDocId: string; text: string; matchedOn: string };

export function expiredContext(brief: Brief): ExpiredContext[] {
  const s = readState();
  const deal = [...baseDeals(), ...s.newDeals].find((d) => d.id === brief.dealId);
  if (!deal) return [];
  const docs: Document[] = [...baseDocuments(), ...s.uploadedDocuments];
  const doc = (id: string) => docs.find((d) => d.id === id);
  const dealText = brief.documentIds.map((id) => doc(id)?.text ?? "").join("\n").toLowerCase();
  const scope = brief.documents.map((d) => (d.facts.find((x) => x.field === "scope")?.value ?? "").split(" · "));
  const split = (v: string | undefined) => (v ?? "").split(",").map((x) => x.trim()).filter((x) => x && x !== "Other");
  const sectors = new Set(scope.flatMap((p) => split(p[0])));
  const regions = [...new Set(scope.flatMap((p) => split(p[1])))].filter((r) => !(r === "India" && deal.clientCountry && deal.clientCountry !== "India"));
  // Whole names only: a first word ("Travel" from "Travel Hub") would match unrelated companies ("Orbit Travels").
  const names = [deal.counterparty, ...deal.counterpartyAliases].map((n) => n.toLowerCase().replace(/[.,]/g, "").trim()).filter((n) => n.length > 2);
  const sameName = (c: string) => { const x = c.toLowerCase().replace(/[.,]/g, ""); return names.some((n) => x.includes(n) || n.includes(x)); };

  const matchedOn = (e: RegisterEntry): string | null => {
    const on: string[] = [];
    if (sameName(e.counterparty) || e.scope.counterparties.some(sameName)) on.push("same client");
    const sec = e.scope.sectors.filter((x) => sectors.has(x));
    if (sec.length && e.scope.sectors.length < 8) on.push(`sector ${sec.join("/")}`);
    if (e.scope.regions.length && !e.scope.regions.some((r) => /worldwide|global/i.test(r)) && regions.length && regionsOverlap(e.scope.regions, regions)) on.push("region");
    const asset = e.scope.assets.find((a) => a.length > 2 && dealText.includes(a.toLowerCase()));
    if (asset) on.push(`asset "${asset}"`);
    if (e.type === "mfn_pricing" && RATES.test(dealText)) on.push("pricing");
    // Region alone isn't enough (an expired India travel non-compete says nothing about an India NDA): it only adds detail.
    return on.some((x) => x !== "region") ? on.join(", ") : null;
  };

  return registerEntries()
    .filter((e) => e.status === "expired" && RESTRICTION.has(e.type) && !own(brief, e))
    .map((e) => ({ e, on: matchedOn(e) }))
    .filter((x): x is { e: RegisterEntry; on: string } => !!x.on)
    .map(({ e, on }) => ({
      entryId: e.id,
      sourceDocId: e.sourceDocId,
      matchedOn: on,
      text: `Checked, expired: ${e.counterparty}, ${e.title} (§${e.clauseRef.replace(/^§/, "")}, ${doc(e.sourceDocId)?.title ?? e.sourceDocId}), ended ${e.end ?? "?"} · matched on ${on}`,
    }));
}

const own = (brief: Brief, e: RegisterEntry) => brief.documentIds.includes(e.sourceDocId);

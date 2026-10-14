/**
 * Commitments the conflict check doesn't compare with a deal (FR-6 scope, declared in the README).
 * The check reads 5 restriction types (non-compete, exclusivity, pricing promise, IP given away / not
 * received). The register also holds commitments of other kinds: data location, compliance duties,
 * non-solicits and "other" (rights of first refusal, minimum purchase commitments, rate freezes…).
 * Rather than stay silent about them, the brief lists the live ones that plausibly concern this deal
 * under "What wasn't seen", for Karandeep to check by hand. Rules only, computed on every view; never
 * a finding, never counted in the verdict.
 *
 * A commitment is listed when it is live (not expired or rejected) and one of:
 *  - same client: it is owed to this deal's counterparty (e.g. Corvina's DPA for a Corvina SOW): any kind;
 *  - from other contracts, only kinds that can restrict dealing with third parties ("other": rights of
 *    first refusal, minimum purchase commitments, personnel firewalls; and non-solicits). Duties owed to
 *    another client (its breach-notice window, audits, where its data is hosted) can't conflict with a new
 *    client's deal and are left out. Listed when:
 *    - same market: its scope names specific sectors AND regions that both overlap this deal's (India
 *      counts as a market only for an Indian client: AtliQ delivers from Pune, as in the seller check);
 *    - AtliQ buying: this deal is a vendor / subcontract and the commitment comes from another contract
 *      where AtliQ is the buyer.
 */
import { baseDeals, baseDocuments } from "../data";
import { regionsOverlap } from "../geo";
import { registerEntries } from "../register";
import { readState } from "../store";
import type { Document, RegisterEntry } from "../types";
import type { Brief } from "./types";

/** The 5 types lib/review/conflict.ts compares with a deal; insurance is checked by the gate instead. */
const COMPARED = new Set(["non_compete", "exclusivity", "mfn_pricing", "ip_transfer", "ip_retention", "insurance"]);
const MAX = 6;

export type Unchecked = { entryId: string; sourceDocId: string; text: string; why: "same client" | "same market" | "AtliQ buying" };

export function uncheckedCommitments(brief: Brief): { items: Unchecked[]; more: number } {
  const s = readState();
  const deal = [...baseDeals(), ...s.newDeals].find((d) => d.id === brief.dealId);
  if (!deal) return { items: [], more: 0 };
  const docs: Document[] = [...baseDocuments(), ...s.uploadedDocuments];
  const doc = (id: string) => docs.find((d) => d.id === id);
  const own = new Set(brief.documentIds);
  const dealDocs = brief.documentIds.map(doc).filter((d): d is Document => !!d);
  const buying = dealDocs.some((d) => d.sideOfTable === "buyer");
  // Sectors and regions from each document's fact card ("sectors · regions").
  const scope = brief.documents.map((d) => (d.facts.find((x) => x.field === "scope")?.value ?? "").split(" · "));
  const split = (v: string | undefined) => (v ?? "").split(",").map((x) => x.trim()).filter((x) => x && x !== "Other");
  const sectors = new Set(scope.flatMap((p) => split(p[0])));
  const regions = [...new Set(scope.flatMap((p) => split(p[1])))].filter((r) => !(r === "India" && deal.clientCountry && deal.clientCountry !== "India"));
  const names = [deal.counterparty, ...deal.counterpartyAliases].map((n) => n.toLowerCase().split(/[\s,]+/)[0]).filter((n) => n.length > 2);

  const why = (e: RegisterEntry): Unchecked["why"] | null => {
    if (names.some((n) => e.counterparty.toLowerCase().includes(n))) return "same client";
    if (e.type !== "other" && e.type !== "non_solicit") return null; // a duty owed to another client
    const specific = e.scope.sectors.length > 0 && e.scope.sectors.length < 8 && e.scope.regions.length > 0 && !e.scope.regions.some((r) => /worldwide|global|other/i.test(r));
    if (specific && e.scope.sectors.some((x) => sectors.has(x)) && regions.length && regionsOverlap(e.scope.regions, regions)) return "same market";
    if (buying && doc(e.sourceDocId)?.sideOfTable === "buyer") return "AtliQ buying";
    return null;
  };

  const order = { "same client": 0, "AtliQ buying": 1, "same market": 2 };
  const hits = registerEntries()
    .filter((e) => !COMPARED.has(e.type) && !e.routine && e.status !== "expired" && !own.has(e.sourceDocId))
    .map((e) => ({ e, w: why(e) }))
    .filter((x): x is { e: RegisterEntry; w: Unchecked["why"] } => !!x.w)
    .sort((a, b) => order[a.w] - order[b.w]);
  const items = hits.slice(0, MAX).map(({ e, w }) => ({
    entryId: e.id,
    sourceDocId: e.sourceDocId,
    why: w,
    text: `Not compared with this deal (check by hand): ${e.counterparty}, ${e.title} (§${e.clauseRef.replace(/^§/, "")}, ${doc(e.sourceDocId)?.title ?? e.sourceDocId}${e.end ? `, until ${e.end}` : ""}) · ${w}`,
  }));
  return { items, more: Math.max(0, hits.length - MAX) };
}

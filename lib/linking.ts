/**
 * Deal linking on upload (FR-3), tiered by certainty:
 *  (a) certain: exactly one open deal with this counterparty, or an explicit cross-reference to a
 *      known contract → link automatically and say why ("· Change");
 *  (b) ambiguous: several deals, a near-match name, or an existing signed relationship → ask once;
 *  (c) no match → new deal by default.
 * The user's choice is final and never re-matched; hard contrary evidence becomes one note under
 * "what wasn't seen" with a one-click move (EV-L5). Never treats a new SOW as a version of an MSA.
 */
import { extractReferences } from "./references";
import type { Deal, Document } from "./types";

export type LinkProposal = {
  mode: "auto" | "ask" | "new" | "user";
  dealId?: string;
  reason: string;
  options: { dealId: string | "new"; label: string; reason: string }[];
  endClientDealId?: string;
  endClientReason?: string;
  notVersionOf: string[];
  note?: { dealId: string; text: string };
};

const SUFFIX = /\b(inc|llc|l\.?l\.?c|ltd|pvt|private|limited|gmbh|co|company|corp|corporation|w\.?l\.?l|fz|plc|sa|the|group|holdings?)\b/g;
export function normName(s: string): string {
  return s.toLowerCase().replace(/&/g, " ").replace(/[.,'"()]/g, " ").replace(SUFFIX, " ").replace(/[^a-z0-9]+/g, " ").trim();
}
const tokens = (s: string) => normName(s).split(" ").filter((t) => t.length > 2 && !["hotels", "resorts", "health", "systems", "data", "labs", "technologies", "analytics"].includes(t));

export function proposeLink(
  input: { counterparty: string; docType: string; text: string; docId?: string },
  deals: Deal[],
  docs: Document[],
  userChoice?: string,
): LinkProposal {
  const open = deals;
  const refs = extractReferences(input.text);
  const refDeals = (exclude?: string) =>
    open.filter((d) => d.id !== exclude && docs.some((x) => d.documentIds.includes(x.id) && x.id !== input.docId && x.references.some((r) => refs.includes(r))));
  const cp = normName(input.counterparty);
  const exact = open.filter((d) => normName(d.counterparty) === cp || d.counterpartyAliases.some((a) => normName(a) === cp));
  const myTokens = tokens(input.counterparty);
  const near = open.filter((d) => !exact.includes(d) && [d.counterparty, ...d.counterpartyAliases].some((n) => tokens(n).some((t) => myTokens.includes(t))));
  const signedRelationship = docs.filter((x) => x.kind === "signed" && normName(x.counterparty) === cp);

  // End client for AtliQ paper: a cross-reference to another open deal's contract (Kriti → Rheinwerk RWA-2026-014).
  const own = exact.length === 1 ? exact[0] : undefined;
  const endClient = refDeals(own?.id).find((d) => normName(d.counterparty) !== cp);

  const base = { notVersionOf: [] as string[], endClientDealId: endClient?.id, endClientReason: endClient ? `references ${endClient.counterparty}'s contract (${refs.join(", ")})` : undefined };

  if (userChoice) {
    // Final: no re-matching. Contrary evidence → one note with a one-click move.
    const evidence = refDeals().find((d) => d.id !== userChoice);
    return {
      ...base,
      mode: "user",
      dealId: userChoice,
      reason: "Placed by you",
      options: [],
      note: evidence ? { dealId: evidence.id, text: `This document cross-references ${evidence.name} (${refs.join(", ")}). Move it there?` } : undefined,
    };
  }
  if (exact.length === 1) {
    return { ...base, mode: "auto", dealId: exact[0].id, reason: `only open deal with ${exact[0].counterparty}`, options: [] };
  }
  const byRef = refDeals();
  if (byRef.length === 1 && normName(byRef[0].counterparty) === cp) {
    return { ...base, mode: "auto", dealId: byRef[0].id, reason: `cross-reference to ${refs.join(", ")}`, options: [] };
  }
  if (exact.length > 1 || near.length || signedRelationship.length) {
    const options = [
      ...exact.map((d) => ({ dealId: d.id, label: d.name, reason: "same counterparty" })),
      ...near.map((d) => ({ dealId: d.id, label: d.name, reason: `similar name: ${d.counterparty}` })),
      { dealId: "new" as const, label: `New deal: ${input.counterparty} ${input.docType}`, reason: signedRelationship.length ? `existing relationship (${signedRelationship.map((s) => s.title).join(", ")}): a new document, not a new version of it` : "no exact match" },
    ];
    return {
      ...base,
      mode: "ask",
      reason: exact.length > 1 ? "several open deals with this counterparty" : near.length ? `name is similar to ${near.map((d) => d.counterparty).join(", ")}` : `AtliQ already has signed contracts with ${input.counterparty}`,
      options,
      notVersionOf: signedRelationship.map((s) => s.id),
    };
  }
  return { ...base, mode: "new", reason: "no open deal or signed contract with this counterparty", options: [{ dealId: "new", label: `New deal: ${input.counterparty}`, reason: "default" }] };
}

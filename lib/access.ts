/**
 * Role-based access (PRD §8 Security, §10 Confidentiality leak, §11 Access control; EV-A1–A3).
 * Karandeep sees everything. Sellers (one shared role for Bhavin, Dhaval and Jay) see every deal's
 * seller side: queue entry, deal check and re-check banners. Never the Register screen, Karandeep's
 * brief, similar past clauses or other clients' terms.
 */
import type { Deal } from "./types";
import type { User } from "./users";

export const canViewRegister = (u: User) => u.role === "karandeep";
export const canViewBrief = (u: User) => u.role === "karandeep";
export const canViewSimilarClauses = (u: User) => u.role === "karandeep";
export const canDecide = (u: User) => u.role === "karandeep";

export function canViewDeal(_u: User, _deal: Pick<Deal, "owner">): boolean {
  return true; // every role sees every deal; what each role sees ON the deal is gated above
}

export function visibleDeals<T extends Pick<Deal, "owner">>(u: User, deals: T[]): T[] {
  return deals.filter((d) => canViewDeal(u, d));
}

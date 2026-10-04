/**
 * Role-based access (PRD §8 Security, §10 Confidentiality leak, §11 Access control; EV-A1–A3).
 * Karandeep sees everything. A seller sees only the deals they own: the queue entry, their deal check
 * and re-check banners. Never the Register screen, Karandeep's brief, similar past clauses or
 * another client's terms.
 */
import type { Deal } from "./types";
import type { User } from "./users";

export const canViewRegister = (u: User) => u.role === "karandeep";
export const canViewBrief = (u: User) => u.role === "karandeep";
export const canViewSimilarClauses = (u: User) => u.role === "karandeep";
export const canDecide = (u: User) => u.role === "karandeep";

export function canViewDeal(u: User, deal: Pick<Deal, "owner">): boolean {
  return u.role === "karandeep" || deal.owner.toLowerCase() === u.name.toLowerCase();
}

export function visibleDeals<T extends Pick<Deal, "owner">>(u: User, deals: T[]): T[] {
  return deals.filter((d) => canViewDeal(u, d));
}

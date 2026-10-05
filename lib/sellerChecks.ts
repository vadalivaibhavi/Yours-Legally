/**
 * Seller deal checks (F7) on record: seeded synthetic checks (declared in the README) + checks
 * sellers run in the app. Used by FR-20 deal-facts mismatch in Karandeep's brief.
 */
import fs from "node:fs";
import path from "node:path";
import { readState, type SellerCheck } from "./store";

function seeded(): SellerCheck[] {
  const p = path.join(process.cwd(), "data", "seed", "seller_checks.seed.json");
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")).checks as SellerCheck[]) : [];
}

export function sellerChecksFor(dealId: string): SellerCheck[] {
  return [...seeded().filter((c) => c.dealId === dealId), ...(readState().sellerChecks[dealId] ?? [])].sort((a, b) => a.at.localeCompare(b.at));
}

export function latestSellerCheck(dealId: string): SellerCheck | null {
  const all = sellerChecksFor(dealId);
  return all.length ? all[all.length - 1] : null;
}

/**
 * Who fixes a finding, as a role, never a person's name: the brief can't know who will actually do it
 * (the deal's requester isn't necessarily the fixer). New briefs use these roles directly; briefs stored
 * with names are mapped at display (lib/review/effective.ts), so no re-run is needed.
 */
import { baseDeals } from "../data";
import { USERS } from "../users";

export const OWNER = {
  /** A problem in AtliQ's own paper: corrected before it goes out. */
  fixBeforeSending: "AtliQ (fix before sending)",
  /** A document or approval AtliQ's deal team has to obtain. */
  dealTeam: "AtliQ's deal team",
  /** AtliQ's own delivery set-up (e.g. the intercompany BAA for the Pune team). */
  techLead: "AtliQ's tech lead",
  /** The seller who entered the deal facts. */
  seller: "the seller",
  compliance: "Karandeep, with AtliQ's compliance owner",
} as const;

/** People named in older briefs (deal requesters, the CTO, the seller role); Karandeep stays: he is the decision role. */
function names(): string[] {
  return [...new Set([...baseDeals().map((d) => d.owner), ...USERS.map((u) => u.name), "Pranav"])].filter((n) => n !== "Karandeep");
}

/** A stored owner → its role. Roles and "Karandeep …", "counsel …", "the other side" pass through unchanged. */
export function ownerRole(owner: string, f?: { key?: string; category?: string }): string {
  if (/named compliance owner/i.test(owner)) return OWNER.compliance;
  const m = owner.match(/^(.+?)( \(fix before sending\))?$/);
  if (!m || !names().includes(m[1])) return owner;
  if (m[2]) return OWNER.fixBeforeSending;
  if (f?.category === "mismatch") return OWNER.seller;
  if (f?.key?.includes("sub-baa:pvt-ltd")) return OWNER.techLead;
  return OWNER.dealTeam;
}

/** Names in a stored next action → roles: "Dhaval (fix before sending): …", "Pranav must renegotiate …". */
export function rolesInText(text: string): string {
  return names().reduce(
    (t, n) => t.split(`${n} (fix before sending)`).join(OWNER.fixBeforeSending).replace(new RegExp(`\\b${n} (must|will|should|needs to|to)\\b`, "g"), `${OWNER.dealTeam} $1`),
    text,
  );
}

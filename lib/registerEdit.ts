/**
 * Register changes (FR-2) and who they affect (FR-19). Karandeep's Verify / Edit / Reject / Restore is
 * applied here, and only the open deals a change can actually reach are flagged for re-check:
 *  - verify / unverify: nothing (the content is unchanged; the "unverified" label is applied live);
 *  - restrictions the deal checks read (non-compete, exclusivity, pricing promise, IP given away / not
 *    received): every open deal, because a wider scope or a later end date can newly hit any of them;
 *  - compliance and data-location duties: open deals with the same client (they are cited when that
 *    client's notes show a compliance event);
 *  - everything else (insurance, non-solicit, other): no check reads them, so no deal is flagged.
 */
import { allDeals } from "./deals";
import { registerEntry } from "./register";
import { mutate } from "./store";
import type { RegisterEntry } from "./types";

export type RegisterAction = "verify" | "unverify" | "reject" | "restore" | "edit";

/** Entry types read by the conflict filter and the seller check (lib/review/conflict.ts, lib/seller.ts). */
const DEAL_CHECKED = new Set(["non_compete", "exclusivity", "mfn_pricing", "ip_transfer", "ip_retention"]);
const CLIENT_DUTIES = new Set(["compliance", "data_location"]);

export function dealsAffectedBy(entries: RegisterEntry[]): string[] {
  const open = allDeals().filter((d) => d.status !== "signed");
  if (entries.some((e) => DEAL_CHECKED.has(e.type) && !e.routine)) return open.map((d) => d.id);
  const duties = entries.filter((e) => CLIENT_DUTIES.has(e.type));
  return open.filter((d) => duties.some((e) => e.counterparty.toLowerCase().includes(d.counterparty.split(" ")[0].toLowerCase()))).map((d) => d.id);
}

export function applyRegisterChange(id: string, action: RegisterAction, edits: Partial<RegisterEntry> | undefined, by: string): { flagged: string[] } {
  const before = registerEntry(id);
  if (!before) throw new Error("Unknown register entry");
  const flagged = action === "verify" || action === "unverify" ? [] : dealsAffectedBy([before, { ...before, ...(edits ?? {}) }]);
  const at = new Date().toISOString();
  mutate(
    (s) => {
      const prev = s.registerOverrides[id] ?? { at, by };
      s.registerOverrides[id] = {
        ...prev,
        at,
        by,
        verified: action === "verify" || action === "edit" ? true : action === "unverify" ? false : prev.verified,
        rejected: action === "reject" ? true : action === "restore" ? false : prev.rejected,
        edits: edits ? { ...(prev.edits ?? {}), ...edits } : prev.edits,
      };
      s.registerRevision += 1;
      for (const d of flagged) s.dealOverrides[d] = { ...(s.dealOverrides[d] ?? {}), staleSince: at };
    },
    { user: by, action: `register.${action}`, detail: { id, edits, flagged } },
  );
  return { flagged };
}

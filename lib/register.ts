/**
 * The effective obligations register (FR-1, FR-2): AI-built entries (data/register.json) with live
 * status from APP_TODAY, overlaid with Karandeep's Verify / Edit / Reject from the store.
 * Unverified entries are used in checks immediately (labelled); rejected ones stop being used.
 */
import { baseRegister, withLiveStatus } from "./data";
import { readState } from "./store";
import type { RegisterEntry } from "./types";

export function registerEntries(opts: { includeRejected?: boolean } = {}): RegisterEntry[] {
  const s = readState();
  const out = [...baseRegister().entries, ...s.extraRegisterEntries].map((e) => {
    const o = s.registerOverrides[e.id];
    const merged: RegisterEntry = o ? { ...e, ...(o.edits ?? {}), verified: o.verified ?? e.verified, rejected: o.rejected ?? e.rejected } : e;
    return withLiveStatus(merged);
  });
  return opts.includeRejected ? out : out.filter((e) => !e.rejected);
}

export function registerVersion(): string {
  return `${baseRegister().version}+r${readState().registerRevision}`;
}

export function registerEntry(id: string): RegisterEntry | undefined {
  return registerEntries({ includeRejected: true }).find((e) => e.id === id);
}

/** Every signed document the register was built from: the original set plus signed copies uploaded in the app. */
export function registerCoverage() {
  return [...baseRegister().documents, ...readState().extraRegisterDocuments];
}

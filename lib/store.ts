/**
 * Runtime state for the prototype (no database, per CLAUDE.md): one JSON file in a writable dir
 * (data/state locally, /tmp on Vercel; ephemeral there, declared in the README).
 * Holds everything people do: uploads, decisions, reactions, confirmations, compliance-alert
 * closures, register verification, seller checks, and the audit log (FR-12, FR-15, FR-21, FR-2).
 * Brief versions: v1 is the committed precomputed brief (data/briefs); later versions live here.
 */
import fs from "node:fs";
import path from "node:path";
import { writableDir } from "./config";
import type { Brief } from "./review/types";
import type { Deal, Document, RegisterEntry, Note } from "./types";

export type Reaction = {
  reaction: "agree" | "disagree" | "severity";
  reason?: string;
  severity?: string;
  note?: string;
  at: string;
  version: number;
};

export type SellerCheck = {
  id: string;
  dealId: string;
  by: string;
  at: string; // ISO date-time (stamped "As of")
  asOf: string; // APP_TODAY at the time
  registerVersion: string;
  briefVersionAtCheck: number;
  input: SellerInput;
  items: SellerItem[];
};
export type SellerInput = {
  client: string;
  sectors: string[];
  regions: string[];
  services: string[];
  rates: { role: string; ratePerHourUsd: number }[];
  assets: string[];
  dataHandling: string;
  partnership: boolean;
  freeText: string;
};
export type SellerItem = {
  item: string;
  status: "clear" | "attention" | "conflict" | "couldnt_check";
  meaning: string;
  todo: string;
  source?: { counterpartyHidden: boolean; clauseRef: string; registerEntryId: string; quote?: string };
};

export type AuditEvent = { at: string; user: string; dealId?: string; action: string; detail?: unknown };

export type State = {
  registerOverrides: Record<string, { verified?: boolean; rejected?: boolean; edits?: Partial<RegisterEntry>; at: string; by: string }>;
  extraRegisterEntries: RegisterEntry[];
  /** Coverage rows for signed copies uploaded in the app (error set = commitments not extracted yet). */
  extraRegisterDocuments: { docId: string; counterparty: string; entryCount: number; illegible: { clauseRef: string; note: string }[]; referencedButMissing: { name: string; note: string }[]; error?: string }[];
  registerRevision: number;
  uploadedDocuments: Document[];
  /** Meeting notes, emails or updates uploaded into a deal (scanned like the dataset's notes). */
  uploadedNotes: Note[];
  /** Uploads into a deal, detected and waiting for the uploader to confirm what they are (one per deal). */
  stagedUploads: { id: string; dealId: string; name: string; text: string; at: string; guess: { what: string; why: string; elsewhere?: { dealId: string; name: string; why: string } | null } }[];
  newDeals: Deal[];
  dealOverrides: Record<string, { status?: Deal["status"]; decision?: string; decidedAt?: string; finalised?: boolean; finalisedAt?: string; deadline?: string; addDocumentIds?: string[]; removeDocumentIds?: string[]; addNoteIds?: string[]; staleReason?: string; staleSince?: string; signedAt?: string; signedDocId?: string }>;
  briefs: Record<string, Brief[]>;
  reactions: Record<string, Record<string, Reaction>>;
  confirmations: Record<string, Record<string, { status: "confirmed" | "not_true" | "edited"; edit?: string; at: string }>>;
  alerts: Record<string, { status: "open" | "resolved"; how?: "evidence" | "note"; note?: string; evidence?: string; evidenceFile?: { name: string; stored: string; bytes: number }; at: string }>;
  blockerNotes: Record<string, Record<string, { note: string; at: string }>>;
  missed: Record<string, { clauseRef: string; note: string; at: string; version: number }[]>;
  followUps: Record<string, { version: number; answer: string; reason?: string; note?: string; at: string }[]>;
  sellerChecks: Record<string, SellerCheck[]>;
  linkChoices: Record<string, { dealId: string; reason: string; at: string }>;
  audit: AuditEvent[];
};

const EMPTY: State = {
  registerOverrides: {},
  extraRegisterEntries: [],
  extraRegisterDocuments: [],
  registerRevision: 0,
  uploadedDocuments: [],
  uploadedNotes: [],
  stagedUploads: [],
  newDeals: [],
  dealOverrides: {},
  briefs: {},
  reactions: {},
  confirmations: {},
  alerts: {},
  blockerNotes: {},
  missed: {},
  followUps: {},
  sellerChecks: {},
  linkChoices: {},
  audit: [],
};

function file() {
  // Runtime-only path (data/state or /tmp): intentionally excluded from build tracing.
  return path.join(/*turbopackIgnore: true*/ process.env.STATE_FILE || path.join(writableDir("state"), "state.json"));
}

/** In-memory overlay used by evals so they never touch the real state file. */
let memoryState: State | null = null;
export function useMemoryState(initial?: Partial<State>) {
  memoryState = { ...structuredClone(EMPTY), ...(initial ?? {}) };
}

export function readState(): State {
  if (memoryState) return memoryState;
  const p = file();
  if (!fs.existsSync(p)) return structuredClone(EMPTY);
  try {
    return { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(p, "utf8")) };
  } catch {
    return structuredClone(EMPTY);
  }
}

export function mutate(fn: (s: State) => void, audit?: Omit<AuditEvent, "at">): State {
  const s = readState();
  fn(s);
  if (audit) s.audit.push({ at: new Date().toISOString(), ...audit });
  if (memoryState) {
    memoryState = s;
    return s;
  }
  const p = file();
  backupIfDue(p);
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(s, null, 1));
  fs.renameSync(tmp, p);
  return s;
}

/** Rolling safety copy (every 10 minutes of activity, last 20 kept): reviewers' work is never lost to a bad write or reset. */
function backupIfDue(p: string) {
  try {
    if (!fs.existsSync(p)) return;
    const dir = path.join(path.dirname(p), "..", "state-backups");
    fs.mkdirSync(dir, { recursive: true });
    const existing = fs.readdirSync(dir).filter((f) => f.startsWith("state-")).sort();
    const last = existing.length ? fs.statSync(path.join(dir, existing[existing.length - 1])).mtimeMs : 0;
    if (Date.now() - last < 10 * 60_000) return;
    fs.copyFileSync(p, path.join(dir, `state-${new Date().toISOString().replace(/[:.]/g, "-")}.json`));
    for (const old of existing.slice(0, Math.max(0, existing.length - 19))) fs.unlinkSync(path.join(dir, old));
  } catch {
    /* backups are best-effort */
  }
}

/** Explicit demo reset (npm run demo:reset): always backs up the current state first. */
export function resetState() {
  if (memoryState) {
    memoryState = structuredClone(EMPTY);
    return;
  }
  const p = file();
  if (!fs.existsSync(p)) return;
  const dir = path.join(path.dirname(p), "..", "state-backups");
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(p, path.join(dir, `state-before-reset-${new Date().toISOString().replace(/[:.]/g, "-")}.json`));
  fs.unlinkSync(p);
}

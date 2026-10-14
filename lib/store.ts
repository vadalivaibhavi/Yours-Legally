/**
 * Runtime state for the prototype (no database, per CLAUDE.md): one JSON file in a writable dir
 * (data/state locally, /tmp on Vercel; ephemeral there, declared in the README).
 * Holds everything people do: uploads, decisions, reactions, confirmations, compliance-alert
 * closures, register verification, seller checks, and the audit log (FR-12, FR-15, FR-21, FR-2).
 * Brief versions: v1 is the committed precomputed brief (data/briefs); later versions live here.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
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
  stagedUploads: { id: string; dealId: string; name: string; text: string; ocr?: boolean; readNote?: string; at: string; guess: { what: string; why: string; elsewhere?: { dealId: string; name: string; why: string } | null } }[];
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

/**
 * Shared store (deployed app). On Vercel each server instance has its own /tmp, so a write on one instance
 * (an upload, a decision) was invisible to the next request if another instance served it: the upload
 * confirm screen came back empty. With a Redis store connected (Vercel Storage → Upstash for Redis, which sets
 * KV_REST_API_URL / KV_REST_API_TOKEN), every request loads the shared state first (syncState) and every
 * action saves it before its response is sent (withState). Locally and in evals nothing changes.
 */
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const REDIS_KEY = "yours-legally:state";
let shared: State | null = null;
let pendingSave: Promise<void> | null = null;

export function sharedStore(): boolean {
  return !!(REDIS_URL && REDIS_TOKEN) && !memoryState;
}

async function redis(command: (string | number)[]): Promise<unknown> {
  const res = await fetch(REDIS_URL!, { method: "POST", headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, body: JSON.stringify(command), cache: "no-store" });
  if (!res.ok) throw new Error(`shared store: HTTP ${res.status}`);
  return ((await res.json()) as { result: unknown }).result;
}

/** Load the shared state for this request (no-op locally). Pages and actions call it before reading. */
export async function syncState(): Promise<void> {
  if (!sharedStore()) return;
  if (pendingSave) await pendingSave;
  const raw = (await redis(["GET", REDIS_KEY])) as string | null;
  shared = raw ? { ...structuredClone(EMPTY), ...JSON.parse(zlib.gunzipSync(Buffer.from(raw, "base64")).toString("utf8")) } : structuredClone(EMPTY);
}

/** Wait until the last write reached the shared store (no-op locally). */
export async function flushState(): Promise<void> {
  if (pendingSave) await pendingSave;
}

/** A server action with the shared state loaded first and saved before its response (including a redirect). */
export async function withState<T>(fn: () => Promise<T>): Promise<T> {
  await syncState();
  try {
    return await fn();
  } finally {
    await flushState();
  }
}
export function useMemoryState(initial?: Partial<State>) {
  memoryState = { ...structuredClone(EMPTY), ...(initial ?? {}) };
}

export function readState(): State {
  if (memoryState) return memoryState;
  if (sharedStore()) return structuredClone(shared ?? EMPTY);
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
  if (sharedStore()) {
    shared = s;
    const payload = zlib.gzipSync(JSON.stringify(s)).toString("base64");
    pendingSave = redis(["SET", REDIS_KEY, payload]).then(() => undefined);
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
  if (sharedStore()) {
    shared = structuredClone(EMPTY);
    pendingSave = redis(["DEL", REDIS_KEY]).then(() => undefined);
    return;
  }
  const p = file();
  if (!fs.existsSync(p)) return;
  const dir = path.join(path.dirname(p), "..", "state-backups");
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(p, path.join(dir, `state-before-reset-${new Date().toISOString().replace(/[:.]/g, "-")}.json`));
  fs.unlinkSync(p);
}

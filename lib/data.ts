/**
 * Read-only access to the pre-built JSON in /data (built by the Phase 1 scripts, committed to the repo).
 * Runtime changes (uploads, decisions, register verification) live in lib/store.ts and are overlaid here.
 * Server-only.
 */
import fs from "node:fs";
import path from "node:path";
import { appToday } from "./config";
import { computeStatus } from "./dates";
import type { Company, Deal, Document, Note, PlaybookRule, RegisterEntry, RequiredDocRule } from "./types";

const DATA = path.join(process.cwd(), "data");
const memo = new Map<string, { mtime: number; value: unknown }>();

function load<T>(file: string, fallback: T): T {
  const p = path.join(DATA, file);
  if (!fs.existsSync(p)) return fallback;
  const mtime = fs.statSync(p).mtimeMs;
  const hit = memo.get(file);
  if (hit && hit.mtime === mtime) return hit.value as T;
  const value = JSON.parse(fs.readFileSync(p, "utf8")) as T;
  memo.set(file, { mtime, value });
  return value;
}

export type RegisterFile = {
  version: string;
  builtAt: string;
  models: string[];
  entries: RegisterEntry[];
  documents: { docId: string; counterparty: string; entryCount: number; illegible: { clauseRef: string; note: string }[]; referencedButMissing: { name: string; note: string }[]; error?: string }[];
};

export const baseDocuments = () => load<Document[]>("documents.json", []);
export const baseDeals = () => load<Deal[]>("deals.json", []);
export const notes = () => load<Note[]>("notes.json", []);
export const company = () => load<Company>("company.json", { entities: [], insuranceHeld: [], deliveryModel: "", clients: [] });
export const playbook = () => load<{ version: string; rules: PlaybookRule[] }>("playbook.json", { version: "none", rules: [] });
export const requiredDocs = () => load<{ version: string; rules: RequiredDocRule[] }>("required_docs.json", { version: "none", rules: [] });
export const baseRegister = () => load<RegisterFile>("register.json", { version: "none", builtAt: "", models: [], entries: [], documents: [] });

/** Status is recomputed against APP_TODAY on every read, so "live/expired" is never stale. */
export function withLiveStatus(e: RegisterEntry): RegisterEntry {
  return { ...e, status: computeStatus(e.end, e.perpetual, appToday()) };
}

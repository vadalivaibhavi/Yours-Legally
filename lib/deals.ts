/**
 * Deals and their documents, with runtime overlays (uploads, decisions, status) from the store.
 * After the one-time tracker import, the deal record is the source of truth (PRD §7.1).
 */
import fs from "node:fs";
import path from "node:path";
import { briefsDir } from "./config";
import { baseDeals, baseDocuments, notes } from "./data";
import { effectiveBrief } from "./review/effective";
import type { Brief, EffectiveBrief } from "./review/types";
import { readState } from "./store";
import type { Deal, Document, Note } from "./types";

export type DealView = Deal & { decision?: string; decidedAt?: string; finalised?: boolean; finalisedAt?: string; stale?: string; staleReason?: string; signedAt?: string; signedDocId?: string };

/** Decisions that mean "we are signing": a deal with one of these can be stored in the contract register. */
export const SIGN_DECISIONS = ["Sign", "Sign after changes"];

export function allDocuments(): Document[] {
  return [...baseDocuments(), ...readState().uploadedDocuments];
}

export function documentById(id: string): Document | undefined {
  return allDocuments().find((d) => d.id === id);
}

export function allDeals(): DealView[] {
  const s = readState();
  return [...baseDeals(), ...s.newDeals].map((d) => {
    const o = s.dealOverrides[d.id] ?? {};
    const docIds = [...d.documentIds, ...(o.addDocumentIds ?? [])].filter((x) => !(o.removeDocumentIds ?? []).includes(x));
    const view: DealView = {
      ...d,
      documentIds: [...new Set(docIds)],
      noteIds: [...new Set([...d.noteIds, ...(o.addNoteIds ?? [])])],
      status: o.status ?? d.status,
      deadline: o.deadline ?? d.deadline,
      decision: o.decision,
      decidedAt: o.decidedAt,
      finalised: o.finalised,
      finalisedAt: o.finalisedAt,
      stale: o.staleSince,
      staleReason: o.staleReason,
      signedAt: o.signedAt,
      signedDocId: o.signedDocId,
    };
    const brief = latestBrief(d.id);
    if (brief && !o.finalised && !o.signedAt && brief.waitingFor.length) view.status = "waiting_for_input";
    return view;
  });
}

export function getDeal(id: string): DealView | undefined {
  return allDeals().find((d) => d.id === id);
}

export function dealDocuments(deal: Deal): Document[] {
  const docs = allDocuments();
  return deal.documentIds.map((id) => docs.find((d) => d.id === id)).filter((d): d is Document => !!d);
}

export function dealContextDocuments(deal: Deal): Document[] {
  const docs = allDocuments();
  return deal.contextDocumentIds.map((id) => docs.find((d) => d.id === id)).filter((d): d is Document => !!d);
}

/** The dataset's notes plus notes uploaded into deals. */
export function allNotes(): Note[] {
  return [...notes(), ...readState().uploadedNotes];
}

export function dealNotes(deal: Deal): Note[] {
  return allNotes().filter((n) => deal.noteIds.includes(n.id));
}

/** v1 = precomputed brief (data/briefs/<deal>.json; data/briefs-ollama/ when testing locally); later versions come from the store. */
export function briefVersions(dealId: string): Brief[] {
  const p = path.join(process.cwd(), "data", briefsDir(), `${dealId}.json`);
  const base: Brief[] = fs.existsSync(p) ? [JSON.parse(fs.readFileSync(p, "utf8")) as Brief] : [];
  const extra = readState().briefs[dealId] ?? [];
  return [...base, ...extra].sort((a, b) => a.version - b.version);
}

export function briefVersion(dealId: string, version: number): EffectiveBrief | null {
  const all = briefVersions(dealId);
  const b = all.find((x) => x.version === version);
  if (!b) return null;
  const prev = all.filter((x) => x.version < version).pop() ?? null;
  return effectiveBrief(b, prev);
}

export function latestBrief(dealId: string): EffectiveBrief | null {
  const all = briefVersions(dealId);
  if (!all.length) return null;
  const b = all[all.length - 1];
  return effectiveBrief(b, all.length > 1 ? all[all.length - 2] : null);
}

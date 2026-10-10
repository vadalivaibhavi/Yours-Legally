/**
 * What an upload into a deal is, detected by rules (no model call):
 *  1. meeting notes / an email / an update vs a contract document: contract structure (numbered clauses,
 *     "shall", parties, signature block) against note markers (Date / Attendees / From / Subject, action
 *     items, mostly bullets);
 *  2. for a contract: a new version of a document already in the deal (same document type and the same
 *     counterparty, and the same printed reference number or mostly the same text, and no different
 *     document number such as SOW-1 vs SOW-2) or an additional document (SOW, annex, amendment…).
 * The uploader can still pick the answer by hand; what was detected is shown after the upload.
 */
import { splitSections } from "./chunker";
import { extractReferences } from "./references";
import type { Document } from "./types";

export function looksLikeNotes(text: string): { notes: boolean; why: string } {
  const words = text.split(/\s+/).length;
  const numbered = splitSections(text).filter((s) => s.no).length;
  const legal = (text.match(/\b(shall|hereby|whereas|herein|thereof|the parties)\b/gi) ?? []).length;
  const signature = /\bsignature\s*:|\bfor and on behalf of\b|\bin witness whereof\b/i.test(text);
  const header = (text.match(/^\W*(date|attendees|participants|from|to|cc|subject|re)\b\W*:/gim) ?? []).length;
  const markers = /\b(action items?|next steps|minutes|agenda|follow[- ]ups?|takeaways)\b/i.test(text);
  const lines = text.split("\n").filter((l) => l.trim());
  const bullets = lines.filter((l) => /^\s*([-*•]|\d+[.)])\s/.test(l)).length / Math.max(1, lines.length);
  // Letters that bind (waivers, consents, amendments) have no numbered clauses but are countersigned and cite the agreement.
  const binding = /(acknowledged and agreed|countersign|agreed and accepted)/i.test(text);
  const clauseCites = (text.match(/(clause|section|article)s+d+/gi) ?? []).length;
  const printedRef = extractReferences(text).length > 0;
  const contractScore = Math.min(numbered, 10) + Math.min(legal, 10) + (signature ? 5 : 0) + (binding ? 5 : 0) + Math.min(clauseCites, 6) + (printedRef ? 3 : 0);
  const notesScore = header * 3 + (markers ? 3 : 0) + (bullets > 0.4 ? 4 : 0) + (words < 400 ? 2 : 0);
  return notesScore > contractScore
    ? { notes: true, why: [header && "note header (date / attendees / from)", markers && "action items or next steps", bullets > 0.4 && "mostly bullet points", numbered < 3 && "no numbered clauses"].filter(Boolean).join(", ") }
    : { notes: false, why: [numbered && `${numbered} numbered clauses`, signature && "signature block", binding && "countersigned", printedRef && "printed reference number"].filter(Boolean).join(", ") };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
function shingles(text: string): Set<string> {
  const w = norm(text);
  const out = new Set<string>();
  for (let i = 0; i + 5 <= w.length; i++) out.add(w.slice(i, i + 5).join(" "));
  return out;
}
function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / Math.max(1, Math.min(a.size, b.size));
}
/** "SOW-2", "Statement of Work No. 3", "Annex B", "Amendment 1": the document's own number, from its first lines. */
function ownNumber(text: string): string | null {
  const m = text.slice(0, 600).match(/\b(SOW|Statement of Work|Annex(?:ure)?|Schedule|Exhibit|Amendment|Addendum)\s*(?:No\.?|#|-|–)?\s*(\d+|[A-Z])\b/i);
  return m ? `${m[1].toLowerCase().replace("statement of work", "sow")}-${m[2].toLowerCase()}` : null;
}

export function findPriorVersion(upload: { text: string; docType: string; counterparty: string }, dealDocs: Document[]): { doc: Document; why: string } | null {
  const refs = extractReferences(upload.text);
  const cp = norm(upload.counterparty)[0];
  const sh = shingles(upload.text);
  const num = ownNumber(upload.text);
  let best: { doc: Document; why: string; score: number } | null = null;
  for (const d of dealDocs) {
    if (d.docType !== upload.docType) continue;
    if (cp && !norm(d.counterparty).includes(cp)) continue;
    const dn = ownNumber(d.text);
    if (num && dn && num !== dn) continue; // SOW-1 vs SOW-2: two documents, not two versions
    const sharedRef = refs.find((r) => d.references.includes(r));
    const sim = overlap(sh, shingles(d.text));
    if (!sharedRef && sim < 0.35) continue;
    const score = sim + (sharedRef ? 1 : 0);
    if (!best || score > best.score) best = { doc: d, score, why: sharedRef ? `same reference ${sharedRef}` : `${Math.round(sim * 100)}% of the text matches` };
  }
  return best && { doc: best.doc, why: best.why };
}

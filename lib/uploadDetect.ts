/**
 * What an upload into a deal is, detected by rules before anything is processed (no model call). The
 * uploader sees the detected type and can change it before confirming.
 *  1. Meeting notes / an email / an update vs a contract document: contract structure (numbered clauses,
 *     legal wording, signature, countersignature, clause citations, printed reference) against note
 *     markers (Date / Attendees / From / Subject header, action items, mostly bullets).
 *  2. For a contract: a new version of a document already in the deal (same document type from the title
 *     when it can tell, at least a quarter of the text in common (a shared reference strengthens it), and
 *     no different document number such as SOW-1 vs SOW-2) or an additional document.
 */
import { splitSections } from "./chunker";
import { extractReferences } from "./references";
import type { Document } from "./types";

export function looksLikeNotes(text: string): { notes: boolean; why: string } {
  const words = text.split(/\s+/).length;
  const numbered = splitSections(text).filter((s) => s.no).length;
  const legal = (text.match(/\b(shall|hereby|whereas|herein|thereof|the parties)\b/gi) ?? []).length;
  const signature = /\bsignature\s*:|\bfor and on behalf of\b|\bin witness whereof\b/i.test(text);
  const noteHeader = (text.match(/^\W*(date|attendees|participants|from|to|cc|subject|re)\b\W*:/gim) ?? []).length;
  const markers = /\b(action items?|next steps|minutes|agenda|follow[- ]ups?|takeaways)\b/i.test(text);
  const lines = text.split("\n").filter((l) => l.trim());
  const bullets = lines.filter((l) => /^\s*([-*•]|\d+[.)])\s/.test(l)).length / Math.max(1, lines.length);
  // Letters that bind (waivers, consents, amendments) have no numbered clauses but are countersigned and cite the agreement.
  const binding = /\b(acknowledged and agreed|countersign|agreed and accepted)\b/i.test(text);
  const clauseCites = (text.match(/\b(clause|section|article)\s+\d+/gi) ?? []).length;
  const printedRef = extractReferences(text).length > 0;
  const contractScore = Math.min(numbered, 10) + Math.min(legal, 10) + (signature ? 5 : 0) + (binding ? 5 : 0) + Math.min(clauseCites, 6) + (printedRef ? 3 : 0);
  const notesScore = noteHeader * 3 + (markers ? 3 : 0) + (bullets > 0.4 ? 4 : 0) + (words < 400 ? 2 : 0);
  return notesScore > contractScore
    ? { notes: true, why: [noteHeader && "note header (date / attendees / from)", markers && "action items or next steps", bullets > 0.4 && "mostly bullet points", numbered < 3 && "no numbered clauses"].filter(Boolean).join(", ") }
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

/** The document's own header: its title lines (headings, bold or capitals, subject line) and its first ~600 characters. */
function header(text: string): { title: string; top: string } {
  const title = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^#{1,3}\s|^\*\*[^*]+\*\*$|^[A-Z0-9 &,.'"()\-–:]{12,}$|^\**subject\b/i.test(l))
    .slice(0, 4)
    .join(" | ");
  return { title, top: text.slice(0, 600) };
}

/** "SOW-2", "Statement of Work No. 3", "Annex B", "Amendment 1": the document's own number, from its header. */
function ownNumber(text: string): string | null {
  const m = header(text).top.match(/\b(SOW|Statement of Work|Annex(?:ure)?|Schedule|Exhibit|Amendment|Addendum)\s*(?:No\.?|#|-|–)?\s*(\d+|[A-Z])\b/i);
  return m ? `${m[1].toLowerCase().replace("statement of work", "sow")}-${m[2].toLowerCase()}` : null;
}

/** Document type from its title (before any model call); null when the title doesn't say. */
export function guessDocType(text: string): string | null {
  const { title } = header(text);
  const rules: [RegExp, string][] = [
    [/\bwaiver\b/i, "Waiver"],
    [/business associate/i, "BAA"],
    [/data processing/i, "DPA"],
    [/statement of work|\bSOW\b/i, "SOW"],
    [/non-?disclosure|confidentiality agreement|\bNDA\b/i, "NDA"],
    [/independent contractor/i, "ICA"],
    [/sub-?contract/i, "Subcontract"],
    [/partner(ship)? agreement|reseller|referral agreement/i, "Partnership"],
    [/master services? agreement|\bMSA\b|services agreement|pilot agreement|consulting agreement/i, "MSA"],
  ];
  return rules.find(([re]) => re.test(title))?.[1] ?? null;
}

export type DealSketch = { id: string; name: string; names: string[]; docs: Document[] };

const mentions = (text: string, names: string[]) =>
  names.reduce((n, name) => n + (text.match(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi")) ?? []).length, 0);

/**
 * A file that probably belongs to another deal (deals linked to this one are exempt: a contractor's
 * agreement names its client). A file that names this deal's client is never flagged. Otherwise, strongest
 * first: it is (a version of) another deal's document, it carries a reference printed on another deal's
 * document, or it names another deal's client at least twice.
 * Only a warning: notes can mention other clients in passing.
 */
export function belongsElsewhere(text: string, here: DealSketch & { linked: string[] }, others: DealSketch[]): { dealId: string; name: string; why: string } | null {
  // Naming this deal's client settles it (two contracts on AtliQ's own template share most of their text).
  if (mentions(text, here.names) > 0) return null;
  const candidates = others.filter((o) => o.id !== here.id && !here.linked.includes(o.id));
  const sh = shingles(text);
  for (const o of candidates) {
    const copy = o.docs.find((d) => overlap(sh, shingles(d.text)) >= 0.25);
    if (copy) return { dealId: o.id, name: o.name, why: `${Math.round(overlap(sh, shingles(copy.text)) * 100)}% of the text matches ${copy.title}` };
  }
  const refs = extractReferences(header(text).top);
  const hereRefs = new Set(here.docs.flatMap((d) => d.references));
  if (!refs.some((r) => hereRefs.has(r)))
    for (const o of candidates) {
      const r = refs.find((x) => o.docs.some((d) => extractReferences(header(d.text).top).includes(x)));
      if (r) return { dealId: o.id, name: o.name, why: `reference ${r} is on ${o.name}'s documents` };
    }
  const best = candidates.map((o) => ({ o, n: mentions(text, o.names) })).sort((a, b) => b.n - a.n)[0];
  if (!best || best.n < 2) return null;
  const said = [...best.o.names].sort((a, b) => mentions(text, [b]) - mentions(text, [a]))[0]; // the name as the file writes it
  return { dealId: best.o.id, name: best.o.name, why: `it names ${said} ${best.n} times and never ${here.names[here.names.length > 1 ? 1 : 0]}` };
}

export function findPriorVersion(upload: { text: string; docType?: string | null; counterparty?: string }, dealDocs: Document[]): { doc: Document; why: string } | null {
  // Only a reference printed in both documents' own headers counts: a body citation of the parent agreement doesn't.
  const refs = extractReferences(header(upload.text).top);
  const cp = norm(upload.counterparty ?? "")[0];
  const sh = shingles(upload.text);
  const num = ownNumber(upload.text);
  let best: { doc: Document; why: string; score: number } | null = null;
  for (const d of dealDocs) {
    if (upload.docType && d.docType !== upload.docType) continue;
    if (cp && !norm(d.counterparty).includes(cp)) continue;
    const dn = ownNumber(d.text);
    if (num && dn && num !== dn) continue; // SOW-1 vs SOW-2: two documents, not two versions
    // A new version keeps a good part of its text (a heavily revised NDA still shares ~40%); different documents
    // share boilerplate at most (~20% for two clients' NDAs). A shared reference alone isn't enough: a
    // subcontractor's BAA prints its client's contract number too.
    const sim = overlap(sh, shingles(d.text));
    if (sim < 0.25) continue;
    const sharedRef = refs.find((r) => extractReferences(header(d.text).top).includes(r));
    const score = sim + (sharedRef ? 1 : 0);
    if (!best || score > best.score) best = { doc: d, score, why: [sharedRef && `same reference ${sharedRef}`, `${Math.round(sim * 100)}% of the text matches`].filter(Boolean).join(", ") };
  }
  return best && { doc: best.doc, why: best.why };
}

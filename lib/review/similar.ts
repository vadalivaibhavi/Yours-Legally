/**
 * FR-22 similar past clauses: for each key clause of the incoming contract, the closest SIGNED
 * clauses of the same type (vector similarity via lib/clauseIndex.ts) plus a one-line "how it differs".
 * Reference only: produced after the verdict and never passed to it (lib/review/verdict.ts takes findings only).
 */
import { z } from "zod";
import { splitSections, typeFromHeading } from "../chunker";
import { searchMany } from "../clauseIndex";
import { callModel } from "../llm";
import type { ClauseType, Document } from "../types";
import { sanitize } from "./guardrails";
import type { SimilarPanel } from "./types";

export const KEY_TYPES: ClauseType[] = ["ld", "liability", "indemnity", "payment", "ip", "confidentiality", "non_compete", "non_solicit", "governing_law", "data_protection"];

export function keyClauses(doc: Document): { clauseType: ClauseType; clauseRef: string; heading: string; text: string }[] {
  const seen = new Set<ClauseType>();
  const out: { clauseType: ClauseType; clauseRef: string; heading: string; text: string }[] = [];
  for (const s of splitSections(doc.text)) {
    if (!s.no || s.text.length < 60) continue;
    const t = typeFromHeading(s.heading, doc.docType);
    if (!t || !KEY_TYPES.includes(t) || seen.has(t)) continue;
    seen.add(t);
    out.push({ clauseType: t, clauseRef: `§${s.no}`, heading: s.heading, text: s.text });
  }
  return out;
}

const Differs = z.object({ lines: z.array(z.object({ panel: z.number(), hit: z.number(), differs: z.string().describe("≤20 words, concrete: rates, caps, carve-outs, who is protected") })) });

export async function similarPanels(doc: Document): Promise<{ panels: SimilarPanel[]; error?: string }> {
  const clauses = keyClauses(doc);
  if (!clauses.length) return { panels: [] };
  let results;
  try {
    results = await searchMany(clauses.map((c) => ({ text: `${c.heading}\n${c.text}`.slice(0, 3000), clauseType: c.clauseType })));
  } catch (e) {
    return { panels: [], error: `Similar past clauses unavailable (${String(e).slice(0, 120)})` };
  }
  const panels: SimilarPanel[] = clauses.map((c, i) => ({
    clauseType: c.clauseType,
    docId: doc.id,
    clauseRef: c.clauseRef,
    quote: c.text.slice(0, 700),
    hits: results[i].map((h) => ({
      docId: h.chunk.docId,
      counterparty: h.chunk.counterparty,
      date: h.chunk.date,
      clauseNo: h.chunk.clauseNo,
      heading: h.chunk.heading,
      label: h.chunk.label,
      labelNote: h.chunk.labelNote,
      score: Math.round(h.score * 1000) / 1000,
      text: h.chunk.text,
      differs: "",
      alsoIn: h.alsoIn,
    })),
  }));

  const pairs = panels.flatMap((p, pi) => p.hits.map((h, hi) => ({ pi, hi, p, h })));
  if (pairs.length) {
    const input = pairs
      .map(({ pi, hi, p, h }) => `panel ${pi} hit ${hi}\nNEW (${doc.title} ${p.clauseRef}): ${p.quote.slice(0, 600)}\nSIGNED (${h.counterparty} §${h.clauseNo}, ${h.label}): ${h.text.slice(0, 600)}`)
      .join("\n\n---\n\n");
    const r = await callModel({
      task: "differs",
      system:
        "For each pair, write one line saying how the NEW clause differs from the SIGNED one (e.g. 'same 5% cap, but no client-delay exclusion'). Concrete numbers, factual, ≤20 words. Never say breach/enforceable.",
      input,
      schema: Differs,
    });
    if (r.ok) for (const l of r.data.lines) if (panels[l.panel]?.hits[l.hit]) panels[l.panel].hits[l.hit].differs = sanitize(l.differs);
  }
  return { panels };
}

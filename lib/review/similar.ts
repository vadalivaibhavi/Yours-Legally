/**
 * FR-22 similar past clauses: for each key clause of the incoming contract, the closest SIGNED
 * clauses of the same type (vector similarity via lib/clauseIndex.ts) plus a one-line "how it differs".
 * Reference only: produced after the verdict and never passed to it (lib/review/verdict.ts takes findings only).
 */
import { z } from "zod";
import { splitSections, typeFromHeading } from "../chunker";
import { searchMany } from "../clauseIndex";
import { callModel, isQuotaExhausted } from "../llm";
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

const Differs = z.object({ lines: z.array(z.object({ panel: z.number(), hit: z.number(), differs: z.string().describe("one line, max 25 words: direction for AtliQ vs the past client, then the difference that matters") })) });

export async function similarPanels(doc: Document): Promise<{ panels: SimilarPanel[]; error?: string }> {
  const clauses = keyClauses(doc);
  if (!clauses.length) return { panels: [] };
  let results;
  try {
    results = await searchMany(clauses.map((c) => ({ text: `${c.heading}\n${c.text}`.slice(0, 3000), clauseType: c.clauseType })));
  } catch (e) {
    if (isQuotaExhausted(e)) throw e; // a quota stop ends the run; it is not a partial result
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

  const mirror = doc.paper === "atliq" && doc.sideOfTable === "buyer";
  const pairs = panels.flatMap((p, pi) => p.hits.map((h, hi) => ({ pi, hi, p, h })));
  if (pairs.length) {
    const input = pairs
      .map(({ pi, hi, p, h }) => `panel ${pi} hit ${hi}\nTHIS CONTRACT (${doc.counterparty}, ${p.clauseRef}): ${p.quote.slice(0, 600)}\nPAST CLAUSE AtliQ SIGNED with ${h.counterparty} (§${h.clauseNo}, tagged ${h.label}): ${h.text.slice(0, 600)}`)
      .join("\n\n---\n\n");
    const r = await callModel({
      task: "differs",
      system: [
        "You help AtliQ's CEO decide quickly whether to accept a clause, by comparing it with one AtliQ signed before.",
        mirror
          ? "THIS CONTRACT is AtliQ's OWN paper for a vendor or freelancer: AtliQ is the BUYER and pays. AtliQ applies its own standard both ways (mirror test), so judge whether the clause is harsher or fairer TO THE VENDOR."
          : `In THIS CONTRACT AtliQ is the ${doc.sideOfTable === "supplier" ? "SUPPLIER: it delivers the work and gets paid" : doc.sideOfTable === "partner" ? "PARTNER" : "other party to a mutual NDA"}. Judge whether the clause is better or worse FOR ATLIQ.`,
        "For each pair write ONE line (max 25 words) in plain business English:",
        mirror
          ? '- Start with "Harsher on the vendor than {client}:", "Fairer to the vendor than {client}:" or "Same as {client}:", using the past client\'s name.'
          : '- Start with "Worse for AtliQ than {client}:", "Better for AtliQ than {client}:" or "Same as {client}:", using the past client\'s name.',
        "- Then the one difference in the clause's substance that matters (rates, caps, days, scope, who is protected, what AtliQ may do), with the numbers.",
        "- Reason about direction carefully: fewer payment days is better for whoever is paid; a lower or capped penalty is better for whoever pays it; a narrower restriction is better for whoever is restricted.",
        "- Compare only what the two clauses say. Ignore contract values, fees, party names and anything outside the clauses.",
        'Never write "NEW", "SIGNED", "clause A/B" or legal citations. Never say breach or enforceable.',
        'Example (AtliQ as supplier): "Worse for AtliQ than Acme: 1% of the whole contract value per week, against 0.5% of the late milestone, and no exclusion for client delays."',
      ].join("\n"),
      input,
      schema: Differs,
    });
    if (!r.ok) return { panels, error: `Similar past clauses for ${doc.title}: comparison lines couldn't be written (${r.error.slice(0, 80)}); the matching clauses are still shown` };
    for (const l of r.data.lines) {
      const hit = panels[l.panel]?.hits[l.hit];
      if (hit) hit.differs = sanitize(l.differs);
    }
  }
  return { panels };
}

/**
 * Register extraction for one SIGNED document (F1, FR-1): one strong-model call, zod-validated, then
 * code (not AI) keeps only entries whose quote is verbatim in the source, expands affiliate coverage and
 * computes end date + live/expired. Used by `npm run build:register` and by signed-copy uploads, so a
 * contract signed through the app feeds every later check exactly like the original signed set.
 * All entries start unverified: Karandeep verifies them on the Register screen (FR-2).
 */
import { z } from "zod";
import { appToday } from "./config";
import { computeEnd, computeStatus } from "./dates";
import { callModel } from "./llm";
import { locateQuote } from "./quotes";
import { RegisterEntry, RegisterType, Region, Sector, type Document } from "./types";

const ExtractedEntry = z.object({
  type: RegisterType,
  title: z.string().describe("Short name, e.g. 'GCC hospitality non-compete'"),
  summary: z.string().describe("One or two plain-English sentences: what AtliQ may not do / gave away / must keep doing, and for whom"),
  clauseRef: z.string().describe("Clause number(s) as printed, e.g. '§12.1' or '§6.4–6.5'"),
  quote: z.string().describe("VERBATIM text copied exactly from the document (one contiguous passage, max ~80 words)"),
  bindsEntities: z.array(z.enum(["Pvt Ltd", "Inc"])).describe("AtliQ entity/entities that this commitment binds directly"),
  includesAffiliates: z.boolean().describe("true if the clause expressly extends to the AtliQ party's Affiliates"),
  scope: z.object({
    sectors: z.array(Sector),
    regions: z.array(Region),
    services: z.array(z.string()),
    assets: z.array(z.string()).describe("Named tools/IP affected, e.g. 'PipeKit', 'pre-existing tools incorporated in Deliverables'"),
    counterparties: z.array(z.string()).describe("Specific people/companies the commitment is limited to, if any"),
  }),
  relatedClauses: z
    .array(z.object({ clauseRef: z.string(), quote: z.string().describe("VERBATIM") }))
    .describe("Definitions or companion clauses that decide the reach of this commitment (e.g. 'Affiliate', 'Hospitality Business', 'in the GCC', 'Restricted Period')"),
  start: z.string().describe("ISO date the commitment starts (usually the effective date)"),
  termEnd: z.string().nullable().describe("ISO date the agreement term ends, if stated or computable from the text"),
  tailMonths: z.number().nullable().describe("Months the commitment survives after the term ends, if any"),
  fixedEnd: z.string().nullable().describe("ISO end date if the commitment states its own end date"),
  perpetual: z.boolean().describe("true if it never expires (e.g. an IP assignment)"),
  endRule: z.string().nullable().describe("The end rule in words, e.g. 'Term (to 14 Mar 2028) + 18 months'"),
  rateFloor: z.array(z.object({ role: z.string(), ratePerHourUsd: z.number() })).nullable().describe("For pricing promises: the rates AtliQ has committed not to undercut"),
  routine: z.boolean().describe("true for routine items that should never be flagged (e.g. mutual staff non-solicit limited to people involved, ≤12 months)"),
  notes: z.string().nullable(),
});

export const Extraction = z.object({
  entries: z.array(ExtractedEntry),
  illegible: z.array(z.object({ clauseRef: z.string(), note: z.string() })).describe("Clauses that are unreadable/garbled in the source. Never guess their content."),
  referencedButMissing: z.array(z.object({ name: z.string(), note: z.string() })).describe("Documents this one references that are not part of it (SOWs, side letters, the agreement it amends)"),
  waiverOf: z
    .object({ agreementRef: z.string(), clauseRef: z.string(), covers: z.string(), quote: z.string().describe("VERBATIM limiting language") })
    .nullable()
    .describe("If this document waives/consents under another agreement's restriction: which agreement and clause, and exactly what it covers"),
});
export type Extraction = z.infer<typeof Extraction>;

export const SYSTEM = `You build AtliQ's obligations register: a list of every commitment in a SIGNED contract that limits what AtliQ can do, gives something away, or must keep being performed.

AtliQ has two entities: AtliQ Technologies Pvt Ltd (India, parent) and AtliQ Inc (USA, 100% owned by Pvt Ltd). They are each other's Affiliates under any usual control-based definition.

Extract (one entry per distinct commitment):
- non_compete: AtliQ may not serve certain sectors / regions / customers / service lines (even if the word "non-compete" never appears).
- exclusivity: AtliQ may not partner with / resell / refer competing platforms or parties.
- mfn_pricing: AtliQ promised that one customer's prices stay no less favourable than others'. Capture the committed rate card in rateFloor.
- ip_transfer: AtliQ assigned IP beyond what was built specifically for the client (e.g. pre-existing tools or background IP incorporated in deliverables, IP vesting on creation). Name affected tools in scope.assets.
- ip_retention: a contractor/vendor of AtliQ KEPT ownership of work product AtliQ paid for (AtliQ only has a licence).
- data_location: data must stay in a country / offshore access limits.
- insurance: insurance AtliQ must maintain (types and amounts in summary).
- non_solicit: no-hire / non-solicit obligations on AtliQ (mark routine=true when mutual, limited to staff involved and ≤12 months after term).
- compliance: obligations AtliQ must keep performing: breach-notification windows, PHI/regulated-data handling rules, audit rights, engagement-limited BAAs (put the engagement/client in scope.counterparties).
- other: any other ongoing restriction (e.g. confidential information that may not be used for others).

Do NOT create entries for the normal pattern "client owns deliverables made for it, AtliQ keeps its background IP with a licence", generic mutual confidentiality, or payment terms.

Rules:
- "quote" and relatedClauses[].quote MUST be copied character-for-character from the document (you may omit markdown ** marks). Never paraphrase inside a quote. Keep each quote to one contiguous passage.
- Include affiliates only when the clause says so (includesAffiliates).
- Map sectors/regions onto the allowed vocabulary. Use "GCC" for the Gulf Cooperation Council. A definition like "anyone providing distribution / revenue-management services to hotels" covers sectors hospitality AND travel.
- Dates: give ISO dates. Compute termEnd from the text where possible (e.g. "three (3) years, expiring on 14 March 2028" → 2028-03-14; "24 months from 1 July 2022" → 2024-06-30). If the text gives no way to know the end, leave it null and explain in notes.
- Never guess illegible or garbled text: list it under illegible with the clause number.
- Do not judge whether a commitment is acceptable. Never use the words "breach" or "enforceable" in your own text.`;

export function userPrompt(doc: Document): string {
  return [
    `Today: ${appToday()}`,
    `Document id: ${doc.id}`,
    `Title: ${doc.title}`,
    `Counterparty: ${doc.counterparty}`,
    `AtliQ entity that signed: ${doc.atliqEntity ?? "unknown"} · AtliQ's side: ${doc.sideOfTable} · Signed: ${doc.date}`,
    doc.ocr ? "NOTE: scanned copy with OCR errors (e.g. 0 for O, l for 1). Read through OCR noise, but quote the text exactly as it appears." : "",
    "",
    "----- DOCUMENT TEXT -----",
    doc.text,
    "----- END -----",
  ]
    .filter((x) => x !== "")
    .join("\n");
}


export type Dropped = { docId: string; clauseRef: string; quote: string; reason: string };

/** Extraction → register entries: quotes string-matched to the source (unmatched ones dropped and returned). */
export function toEntries(doc: Document, ex: Extraction): { entries: RegisterEntry[]; dropped: Dropped[] } {
  const entries: RegisterEntry[] = [];
  const dropped: Dropped[] = [];
  let n = 0;
  for (const e of ex.entries) {
    const exact = locateQuote(doc.text, e.quote);
    if (!exact) {
      dropped.push({ docId: doc.id, clauseRef: e.clauseRef, quote: e.quote.slice(0, 160), reason: "quote not found verbatim in source" });
      continue;
    }
    const related = e.relatedClauses
      .map((r) => ({ clauseRef: r.clauseRef, quote: locateQuote(doc.text, r.quote) }))
      .filter((r): r is { clauseRef: string; quote: string } => !!r.quote);
    const binds = new Set(e.bindsEntities.length ? e.bindsEntities : doc.atliqEntity ? [doc.atliqEntity] : []);
    if (e.includesAffiliates) {
      binds.add("Pvt Ltd");
      binds.add("Inc");
    }
    const end = computeEnd(e);
    n++;
    entries.push(
      RegisterEntry.parse({
        id: `${doc.id}#${n}`,
        type: e.type,
        title: e.title,
        summary: e.summary,
        sourceDocId: doc.id,
        counterparty: doc.counterparty,
        clauseRef: e.clauseRef,
        quote: exact,
        bindsEntities: [...binds],
        includesAffiliates: e.includesAffiliates,
        scope: e.scope,
        relatedClauses: related,
        start: e.start,
        end,
        endRule: e.endRule,
        perpetual: e.perpetual,
        waivers: [],
        terms: e.rateFloor?.length ? { rateFloor: e.rateFloor } : {},
        status: computeStatus(end, e.perpetual),
        verified: false,
        rejected: false,
        routine: e.routine,
        notes: e.notes ?? undefined,
      }),
    );
  }
  return { entries, dropped };
}

/** One signed document → its register entries and coverage row (the call is cached by request hash). */
export async function extractCommitments(doc: Document) {
  const r = await callModel({ task: "register", system: SYSTEM, input: userPrompt(doc), schema: Extraction });
  if (!r.ok) return { ok: false as const, error: r.error, message: r.message };
  const { entries, dropped } = toEntries(doc, r.data);
  return { ok: true as const, ex: r.data, entries, dropped, model: r.model, cached: r.cached, usage: r.usage };
}

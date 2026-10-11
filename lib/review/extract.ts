/**
 * F2 intake extraction (FR-3), fast model. Every fact carries its clause ref and a verbatim snippet;
 * snippets are string-matched to the source and dropped if they don't match (the value stays,
 * marked "source not matched" on the Contract facts card). Deterministic rules run on these fields.
 */
import { z } from "zod";
import { appToday } from "../config";
import { callModel } from "../llm";
import { locateQuote } from "../quotes";
import { DocType, Region, Sector, Side, type Document } from "../types";

const Src = { clauseRef: z.string().nullable(), quote: z.string().nullable().describe("VERBATIM snippet (≤40 words) from the document supporting the value") };

export const Extraction = z.object({
  docType: DocType,
  counterparty: z.string(),
  counterpartyCountry: z.string().nullable().describe("Country where the counterparty is incorporated / resident"),
  counterpartyIsIndividual: z.boolean(),
  sideOfTable: Side.describe("AtliQ's side: supplier (provides services), buyer (engages a vendor/freelancer), partner, mutual (NDA)"),
  paper: z.enum(["client", "atliq"]).describe("Whose template: 'atliq' if AtliQ drafted it"),
  atliqEntityNamed: z.object({ value: z.enum(["Pvt Ltd", "Inc"]).nullable(), ...Src }).describe("AtliQ entity named as a party"),
  invoicingEntity: z
    .object({ value: z.enum(["Pvt Ltd", "Inc"]).nullable(), ...Src })
    .describe("AtliQ entity named in invoicing / payment / tax / bank clauses (e.g. GSTIN → Pvt Ltd, EIN → Inc); null if none named"),
  governingLaw: z.object({ value: z.string().nullable(), country: z.string().nullable().describe("Country of the governing law, e.g. India, USA, UK, UAE, Saudi Arabia, Germany, Singapore"), ...Src }),
  forum: z.object({ value: z.string().nullable(), ...Src }),
  payment: z.object({ days: z.number().nullable(), payWhenPaid: z.boolean(), ...Src }),
  ld: z.object({
    present: z.boolean(),
    ratePct: z.number().nullable(),
    base: z.enum(["milestone", "contract_value", "total_fees", "other"]).nullable(),
    period: z.enum(["day", "week", "month", "other"]).nullable(),
    capPct: z.number().nullable().describe("Cap as a percentage; null if uncapped"),
    capBase: z.enum(["milestone", "contract_value", "total_fees", "other"]).nullable(),
    clientDelayExcluded: z.boolean().nullable(),
    ...Src,
  }),
  liability: z.object({
    atliqCapped: z.boolean().nullable().describe("Is AtliQ's overall liability capped?"),
    capText: z.string().nullable(),
    uncappedFor: z.array(z.string()).describe("Items carved out of AtliQ's cap (e.g. fraud, gross negligence, data protection breach, LDs)"),
    ...Src,
  }),
  insurance: z.array(z.object({ type: z.enum(["cyber", "professional_indemnity", "errors_and_omissions", "general_liability", "umbrella", "workers_comp", "other"]), amountUsd: z.number().nullable(), ...Src })),
  annexes: z.array(z.object({ name: z.string().describe("e.g. 'Annex 3', 'Exhibit B', 'Schedule 1'"), description: z.string(), ...Src })).describe("Annexes / exhibits / schedules OF THIS AGREEMENT that the text says form part of it"),
  crossReferences: z.array(z.object({ reference: z.string(), description: z.string() })).describe("Other agreements this document refers to (contract numbers, the MSA it sits under, the client contract a subcontract serves)"),
  endClient: z.string().nullable().describe("For subcontracts / contractor agreements: the end client the work is for, if named"),
  sectors: z.array(Sector).describe("Sectors of the counterparty and of whoever receives the services (e.g. a hotel booking platform → travel + hospitality)"),
  regions: z.array(Region).describe("Where the counterparty is and where the services, properties or operations are (list every country named, e.g. properties in Dubai and Muscat → UAE, Oman)"),
  services: z.array(z.string()),
  assets: z.array(z.string()).describe("Named tools, accelerators or IP AtliQ would use or reuse (e.g. 'PipeKit')"),
  dataTypes: z.array(z.enum(["phi", "personal_data", "payment_data", "none"])),
  restrictionsOnAtliq: z
    .array(z.object({ type: z.enum(["non_compete", "exclusivity", "non_solicit", "mfn_pricing", "client_capture", "other"]), sectors: z.array(Sector), regions: z.array(Region), description: z.string(), ...Src }))
    .describe("Restrictions THIS document would place on AtliQ (non-competes, exclusivity, client-capture), including ones hidden in an NDA"),
  rates: z.array(z.object({ role: z.string(), ratePerHourUsd: z.number() })),
  valueText: z.string().nullable(),
});
export type Extraction = z.infer<typeof Extraction>;

const SYSTEM = `You extract facts from a contract for AtliQ, an analytics/AI services company with two entities: AtliQ Technologies Pvt Ltd (India; GSTIN/CIN/PAN identify it) and AtliQ Inc (USA; EIN identifies it).
Return the JSON schema exactly. For each fact give the clause number and a short VERBATIM snippet copied character-for-character from the document (you may drop markdown ** marks). Use null when the document doesn't say. Never guess. Don't judge whether terms are acceptable.`;

export async function extractDocument(doc: Document) {
  const input = [`Today: ${appToday()}`, `File: ${doc.file}`, "----- DOCUMENT -----", doc.text, "----- END -----"].join("\n");
  const r = await callModel({ task: "extract", system: SYSTEM, input, schema: Extraction });
  if (!r.ok) return { ok: false as const, error: r.error };
  return { ok: true as const, data: verifySnippets(doc, r.data) };
}

/** Citation guardrail for facts: replace each snippet with the exact source span, or null if it doesn't match. */
function verifySnippets(doc: Document, x: Extraction): Extraction {
  const fix = <T extends { quote: string | null }>(o: T): T => ({ ...o, quote: o.quote ? locateQuote(doc.text, o.quote) : null });
  // The AtliQ entity decides high-severity rule findings, so it must be in the text: a value the document
  // never names (no quote, and only the other entity appears) is replaced by the one it does name.
  const named = { "Pvt Ltd": /atliq technologies (private limited|pvt\.? ?ltd)/i.test(doc.text), Inc: /atliq,? inc\b|atliq technologies,? inc\b/i.test(doc.text) };
  const entity = <T extends { value: "Pvt Ltd" | "Inc" | null; quote: string | null }>(o: T): T => {
    const f = fix(o);
    if (f.value && !f.quote && !named[f.value]) {
      const other = f.value === "Inc" ? "Pvt Ltd" : "Inc";
      if (named[other]) return { ...f, value: other };
    }
    return f;
  };
  return {
    ...x,
    atliqEntityNamed: entity(x.atliqEntityNamed),
    invoicingEntity: entity(x.invoicingEntity),
    governingLaw: fix(x.governingLaw),
    forum: fix(x.forum),
    payment: fix(x.payment),
    ld: fix(x.ld),
    liability: fix(x.liability),
    insurance: x.insurance.map(fix),
    annexes: x.annexes.map(fix),
    restrictionsOnAtliq: x.restrictionsOnAtliq.map(fix),
  };
}

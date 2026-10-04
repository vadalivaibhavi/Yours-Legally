/**
 * Shared data shapes (Phase 1 spec §2): zod schemas + TS types.
 * Every JSON file in /data and every model output is validated against these.
 */
import { z } from "zod";

// ---------------------------------------------------------------- vocabularies
export const AtliqEntity = z.enum(["Pvt Ltd", "Inc"]);
export type AtliqEntity = z.infer<typeof AtliqEntity>;

export const DocType = z.enum(["MSA", "SOW", "NDA", "BAA", "ICA", "Partnership", "Subcontract", "Waiver", "DPA", "Other"]);
export type DocType = z.infer<typeof DocType>;

export const Side = z.enum(["supplier", "buyer", "partner", "mutual"]);
export type Side = z.infer<typeof Side>;

/** Sector tags: AI maps free text onto these once; conflict matching is then exact (PRD §5). */
export const Sector = z.enum([
  "hospitality",
  "travel",
  "retail",
  "healthcare",
  "bfsi",
  "logistics",
  "manufacturing",
  "food",
  "technology",
  "data_platform",
  "other",
]);
export type Sector = z.infer<typeof Sector>;

/** Region tags. GCC is expanded to its six states by lib/geo.ts. */
export const Region = z.enum([
  "India",
  "UAE",
  "Saudi Arabia",
  "Qatar",
  "Kuwait",
  "Bahrain",
  "Oman",
  "GCC",
  "USA",
  "UK",
  "Germany",
  "EU",
  "Europe",
  "Singapore",
  "Worldwide",
  "Other",
]);
export type Region = z.infer<typeof Region>;

export const ClauseType = z.enum([
  "ld",
  "liability",
  "indemnity",
  "payment",
  "ip",
  "confidentiality",
  "non_compete",
  "non_solicit",
  "governing_law",
  "data_protection",
  "termination",
  "insurance",
  "other",
]);
export type ClauseType = z.infer<typeof ClauseType>;

export const IntentLabel = z.enum(["standard", "exception", "concession", "accident", "untagged"]);
export type IntentLabel = z.infer<typeof IntentLabel>;

// ---------------------------------------------------------------- documents, deals, notes
export const Document = z.object({
  id: z.string(),
  file: z.string(),
  kind: z.enum(["signed", "incoming", "note", "reference", "uploaded"]),
  docType: DocType,
  title: z.string(),
  counterparty: z.string(),
  date: z.string(),
  atliqEntity: AtliqEntity.optional(),
  sideOfTable: Side,
  paper: z.enum(["client", "atliq"]),
  text: z.string(),
  ocr: z.boolean(),
  dealId: z.string().optional(),
  trackerId: z.string().optional(),
  /** Contract numbers / references printed on the document (used for deal linking, FR-3). */
  references: z.array(z.string()).default([]),
});
export type Document = z.infer<typeof Document>;

export const DealStatus = z.enum(["open", "waiting_for_input", "decided", "signed"]);
export type DealStatus = z.infer<typeof DealStatus>;

export const Deal = z.object({
  id: z.string(),
  name: z.string(),
  counterparty: z.string(),
  counterpartyAliases: z.array(z.string()).default([]),
  owner: z.string(),
  deadline: z.string().optional(),
  deadlineNote: z.string().optional(),
  valueUsd: z.number().optional(),
  status: DealStatus,
  documentIds: z.array(z.string()),
  /** Signed documents that are context for this deal (e.g. Harrington NDA). */
  contextDocumentIds: z.array(z.string()).default([]),
  noteIds: z.array(z.string()),
  linkedDealIds: z.array(z.string()),
  /** For AtliQ paper: the client deal whose obligations must flow down (Kriti → Rheinwerk). */
  endClientDealId: z.string().optional(),
  trackerIds: z.array(z.string()).default([]),
  trackerNotes: z.array(z.string()).default([]),
  clientCountry: z.string().optional(),
});
export type Deal = z.infer<typeof Deal>;

export const Note = z.object({
  id: z.string(),
  file: z.string(),
  date: z.string(),
  title: z.string(),
  text: z.string(),
  dealIds: z.array(z.string()),
});
export type Note = z.infer<typeof Note>;

export const Company = z.object({
  entities: z.array(
    z.object({
      name: z.string(),
      short: AtliqEntity,
      country: z.string(),
      servesRegions: z.array(z.string()),
      invoices: z.array(z.string()),
      law: z.string(),
      identifiers: z.array(z.string()),
    }),
  ),
  insuranceHeld: z.array(z.object({ type: z.string(), amountUsd: z.number().nullable(), note: z.string() })),
  deliveryModel: z.string(),
  /** Live and pipeline clients by sector/region: used for the reverse covenant scan (FinServe §8.1). */
  clients: z.array(
    z.object({ name: z.string(), sectors: z.array(Sector), regions: z.array(z.string()), status: z.string(), trackerId: z.string() }),
  ),
});
export type Company = z.infer<typeof Company>;

// ---------------------------------------------------------------- register (F1, FR-1)
export const RegisterType = z.enum([
  "non_compete",
  "exclusivity",
  "mfn_pricing",
  "ip_transfer",
  "ip_retention",
  "data_location",
  "insurance",
  "non_solicit",
  "compliance",
  "other",
]);
export type RegisterType = z.infer<typeof RegisterType>;

export const RegisterScope = z.object({
  sectors: z.array(Sector),
  regions: z.array(Region),
  services: z.array(z.string()),
  assets: z.array(z.string()),
  counterparties: z.array(z.string()),
});

export const RegisterEntry = z.object({
  id: z.string(),
  type: RegisterType,
  title: z.string(),
  summary: z.string(),
  sourceDocId: z.string(),
  counterparty: z.string(),
  clauseRef: z.string(),
  quote: z.string(),
  bindsEntities: z.array(AtliqEntity),
  includesAffiliates: z.boolean(),
  scope: RegisterScope,
  start: z.string(),
  end: z.string().nullable(),
  endRule: z.string().nullable(),
  waivers: z.array(z.object({ docId: z.string(), clauseRef: z.string(), covers: z.string(), quote: z.string() })),
  /** Structured specifics used by deterministic checks, e.g. an MFN rate floor. */
  terms: z
    .object({
      rateFloor: z.array(z.object({ role: z.string(), ratePerHourUsd: z.number() })).optional(),
    })
    .default({}),
  status: z.enum(["live", "expired", "unknown"]),
  verified: z.boolean(),
  rejected: z.boolean().default(false),
  routine: z.boolean().default(false),
  notes: z.string().optional(),
});
export type RegisterEntry = z.infer<typeof RegisterEntry>;

// ---------------------------------------------------------------- clause index (FR-22)
export const ClauseChunk = z.object({
  id: z.string(),
  docId: z.string(),
  counterparty: z.string(),
  date: z.string(),
  atliqEntity: AtliqEntity.optional(),
  sideOfTable: Side,
  clauseNo: z.string(),
  heading: z.string(),
  text: z.string(),
  clauseType: ClauseType,
  label: IntentLabel,
  labelNote: z.string().optional(),
  embedding: z.array(z.number()),
});
export type ClauseChunk = z.infer<typeof ClauseChunk>;
export type ClauseChunkMeta = Omit<ClauseChunk, "embedding">;

// ---------------------------------------------------------------- playbook + required docs
export const PlaybookRule = z.object({
  id: z.string(),
  topic: z.string(),
  clauseType: ClauseType,
  standard: z.string(),
  acceptableRange: z.string().optional(),
  neverAccept: z.array(z.string()),
  counterPosition: z.string(),
  appliesTo: z.enum(["both", "incoming", "atliq_paper"]),
  precedents: z.array(z.object({ docId: z.string(), counterparty: z.string(), clauseRef: z.string(), label: IntentLabel, note: z.string() })),
  source: z.string(),
  approved: z.literal(true),
});
export type PlaybookRule = z.infer<typeof PlaybookRule>;

export const RequiredDocRule = z.object({
  id: z.string(),
  title: z.string(),
  when: z.object({ sector: Sector.optional(), regions: z.array(z.string()).optional(), dataType: z.string().optional(), subcontractor: z.boolean().optional() }),
  perParty: z.array(z.string()),
  why: z.string(),
});
export type RequiredDocRule = z.infer<typeof RequiredDocRule>;

// ---------------------------------------------------------------- eval fixtures
export const EvalCase = z.object({
  id: z.string(),
  section: z.string(),
  title: z.string(),
  inputs: z.array(z.string()),
  dealId: z.string().optional(),
  expectedVerdict: z.string().optional(),
  expectComplianceAlert: z.boolean().optional(),
  mustFind: z.array(z.string()),
  mustNotFlag: z.array(z.string()),
  expectedPrecedents: z.array(z.object({ docId: z.string(), label: IntentLabel })).optional(),
  /** The human-readable row from docs/Eval_Set.md, kept for the report. */
  source: z.record(z.string(), z.string()),
});
export type EvalCase = z.infer<typeof EvalCase>;

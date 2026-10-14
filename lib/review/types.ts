/** Structured findings and the decision brief (PRD §9.1). The UI never parses free text. */
import type { IntentLabel } from "../types";

export type Verdict = "SIGN" | "SIGN AFTER CHANGES" | "SEND BACK" | "HOLD";
export type Severity = "blocker" | "high" | "medium" | "low" | "ok";
export const SEVERITY_RANK: Record<Severity, number> = { blocker: 4, high: 3, medium: 2, low: 1, ok: 0 };

export type Citation = {
  docId: string;
  docTitle: string;
  clauseRef: string;
  quote: string; // verbatim, string-matched to the source before display
  role: "incoming" | "register" | "linked" | "note" | "precedent";
};

export type Precedent = { docId: string; counterparty: string; clauseRef: string; label: IntentLabel; note: string };

export type SimilarHitView = {
  docId: string;
  counterparty: string;
  date: string;
  clauseNo: string;
  heading: string;
  label: IntentLabel;
  labelNote?: string;
  score: number;
  text: string;
  differs: string;
  alsoIn: string[];
};

/** FR-22: reference only, attached after the verdict is computed; never an input to severity or verdict. */
export type SimilarPanel = {
  clauseType: string;
  docId: string;
  clauseRef: string;
  quote: string;
  hits: SimilarHitView[];
};

export type Finding = {
  /** Stable across versions: used for New / Still open / Resolved and carried-forward reactions (FR-17). */
  key: string;
  category: "gate" | "conflict" | "covenant" | "playbook" | "flowdown" | "nda" | "bundle" | "notes" | "dependency" | "mismatch";
  topic: string;
  title: string;
  impact: string;
  severity: Severity;
  confidence: "high" | "medium" | "low";
  /** Interpretive question: shown as "needs judgment / counsel" with both readings; never a legal conclusion. */
  needsJudgment: boolean;
  readings?: string[];
  owner: string; // decision owner: Karandeep · business fix · counsel · the other side · named person
  resolution?: "redline" | "waiver" | "counsel" | "business_fix" | "document" | "confirm" | "fix_before_sending";
  docId?: string;
  citations: Citation[];
  standard?: string;
  counterPosition?: string;
  precedents?: Precedent[];
  registerEntryId?: string;
  registerVerified?: boolean;
  expiry?: string | null;
  waiver?: { docId: string; covers: string; applies: boolean; why: string } | null;
  missingItem?: { item: string; owner: string };
  /** Pending written document (EV-C2): a note never clears a contractual blocker. */
  pendingDocument?: string;
  /** Deal-size effect (lib/review/materiality.ts): why the severity was lowered, or that size doesn't change it. */
  sizeNote?: string;
  /** A1 guardrail: a claim about the contract's terms with no verified clause behind it (shown, never counted). */
  unsupported?: boolean;
};

export type GateResult = {
  rule: string;
  label: string;
  pass: boolean | null; // null = not applicable / can't tell
  detail: string;
  citation?: Citation;
};

export type FactField = { field: string; label: string; value: string; clauseRef?: string; quote?: string };

export type DocumentReview = {
  docId: string;
  title: string;
  docType: string;
  paper: "client" | "atliq";
  route: "nda_fast_lane" | "full_review";
  facts: FactField[];
  gate: GateResult[];
  errors: string[];
};

export type NotesFact = {
  id: string;
  statement: string;
  category: "data_movement" | "staffing" | "commitment" | "deadline" | "other";
  noteId: string;
  noteTitle: string;
  quote: string;
  complianceEvent: boolean;
  whyItMatters: string;
};

export type BundleRow = {
  party: string;
  document: string;
  status: "signed" | "in_review" | "missing" | "not_applicable";
  detail: string;
  findingKey?: string;
};

export type ComplianceAlert = {
  title: string;
  detail: string;
  owner: string;
  factIds: string[];
  citations: Citation[];
};

export type Brief = {
  dealId: string;
  version: number;
  createdAt: string;
  trigger: string;
  inputsHash: string;
  documentIds: string[];
  registerVersion: string;
  playbookVersion: string;
  models: string[];
  promptVersion: string;
  route: "nda_fast_lane" | "full_review";
  verdict: Verdict;
  headline: string;
  nextAction: string;
  findings: Finding[];
  fine: string[];
  notSeen: string[];
  documents: DocumentReview[];
  bundle: BundleRow[];
  notesFacts: NotesFact[];
  /** Compliance event found in notes; becomes a pinned alert once confirmed (FR-10, FR-21). */
  complianceCandidate: ComplianceAlert | null;
  similar: SimilarPanel[];
  counselPack: { question: string; documents: string[]; clauses: Citation[]; entityFacts: string[] } | null;
  errors: string[];
  usage: { calls: number; cachedCalls: number; inputTokens: number; outputTokens: number; ms: number };
};

/** Brief + Karandeep's inputs (confirmations, alert closure, reactions) → what the screen shows. */
export type EffectiveBrief = Brief & {
  complianceAlert: (ComplianceAlert & { status: "open" | "resolved"; resolution?: string; evidenceFile?: { name: string; stored: string; bytes: number } }) | null;
  changes: { new: string[]; stillOpen: string[]; resolved: Finding[] } | null;
  waitingFor: { item: string; owner: string }[];
  /** Register commitments of kinds the conflict check doesn't compare, listed for a manual check (lib/review/unchecked.ts). */
  unchecked: { items: { entryId: string; sourceDocId: string; text: string; why: string }[]; more: number };
  /** FR-25: expired restrictions that would otherwise match the deal, shown as context only (lib/review/expiredContext.ts). */
  expired: { entryId: string; sourceDocId: string; text: string; matchedOn: string }[];
};

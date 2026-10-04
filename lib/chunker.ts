/**
 * Clause chunking for the similar-past-clauses index (FR-22; Phase 1 spec 1c). No AI.
 * - One chunk per numbered section ("## 7. DELAY…", "## ARTICLE 7 — …", "## § 7 …", OCR "7. TITLE").
 * - Sections longer than ~1,500 chars are split at their sub-clauses (7.1, 7.2…).
 * - Recitals, parties, signature blocks, schedules and definitions-only sections are skipped;
 *   definitions that change meaning (Affiliate, Hospitality Business, Confidential Information…) are kept.
 * Also used at review time to split incoming contracts into sections for citation lookup.
 */
import type { ClauseType, DocType } from "./types";

export type RawSection = { no: string; heading: string; text: string };
export type RawChunk = { clauseNo: string; heading: string; text: string };

const HEAD_PATTERNS: RegExp[] = [
  /^##\s+(\d+)\.\s+(.+)$/,
  /^##\s+ARTICLE\s+(\d+)\s*[—–-]\s*(.+)$/i,
  /^##\s+§\s*(\d+)\s+(.+)$/,
];
const OCR_HEAD = /^(\d{1,2})\.\s+([A-Z0-9][A-Z0-9 ,;&'()\-]{3,})$/;

export function splitSections(text: string): RawSection[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const markdown = lines.some((l) => l.startsWith("## "));
  const sections: RawSection[] = [];
  let cur: RawSection | null = null;
  for (const line of lines) {
    let m: RegExpMatchArray | null = null;
    if (markdown) {
      for (const re of HEAD_PATTERNS) if ((m = line.match(re))) break;
      if (!m && line.startsWith("## ")) {
        // An unnumbered heading (RECITALS, SIGNATURES, SCHEDULE…) ends the current section.
        if (cur) sections.push(cur);
        cur = { no: "", heading: line.replace(/^##\s+/, "").trim(), text: "" };
        continue;
      }
    } else {
      m = line.trim().match(OCR_HEAD);
    }
    if (m) {
      if (cur) sections.push(cur);
      cur = { no: m[1], heading: m[2].replace(/\*+/g, "").trim(), text: "" };
    } else if (cur) {
      if (!markdown && /Page \d+ of \d+|^-{10,}$/.test(line.trim())) continue;
      cur.text += line + "\n";
    }
  }
  if (cur) sections.push(cur);
  return sections.map((s) => ({ ...s, text: s.text.trim() }));
}

const SKIP_HEADINGS = /RECITAL|PARTIES|SIGNATURE|EXECUTION|SCHEDULE|EXHIBIT|ANNEX|PREAMBLE|BACKGROUND|IN WITNESS|ENGAGEMENT SCHEDULE/i;
const MEANINGFUL_DEFS = /Affiliate|Hospitality Business|Restricted Period|Competing Platform|Confidential Information|Residual|Territory|in the GCC|Work Product|Background IP|Pre-Existing|Subcontractor|Protected Health/i;

export function chunkDocument(text: string, maxLen = 1500): RawChunk[] {
  const out: RawChunk[] = [];
  for (const s of splitSections(text)) {
    if (!s.no || SKIP_HEADINGS.test(s.heading) || s.text.length < 40) continue;
    const subs = splitSubclauses(s.text, s.no);
    if (/DEFINITION/i.test(s.heading)) {
      for (const sub of subs) if (MEANINGFUL_DEFS.test(sub.text.slice(0, 160))) out.push({ clauseNo: sub.no, heading: s.heading, text: sub.text });
      continue;
    }
    if (s.text.length <= maxLen || subs.length <= 1) {
      out.push({ clauseNo: s.no, heading: s.heading, text: s.text });
      continue;
    }
    let group: { no: string; text: string }[] = [];
    const flush = () => {
      if (!group.length) return;
      const no = group.length === 1 ? group[0].no : `${group[0].no}–${group[group.length - 1].no.split(".").pop()}`;
      out.push({ clauseNo: no, heading: s.heading, text: group.map((g) => g.text).join("\n") });
      group = [];
    };
    for (const sub of subs) {
      if (group.length && group.reduce((n, g) => n + g.text.length, 0) + sub.text.length > maxLen) flush();
      group.push(sub);
    }
    flush();
  }
  return out;
}

function splitSubclauses(text: string, sectionNo: string): { no: string; text: string }[] {
  const re = new RegExp(`^(?:\\*\\*)?(${sectionNo}\\.\\d+)\\b`);
  const subs: { no: string; text: string }[] = [];
  for (const line of text.split("\n")) {
    const m = line.trim().match(re);
    if (m) subs.push({ no: m[1], text: line.trim() });
    else if (subs.length) subs[subs.length - 1].text += "\n" + line;
    else subs.push({ no: sectionNo, text: line });
  }
  return subs.map((s) => ({ ...s, text: s.text.trim() })).filter((s) => s.text);
}

// ---------------------------------------------------------------- clause typing (heading keywords first)
const TYPE_RULES: [RegExp, ClauseType][] = [
  [/LIQUIDATED|DELAY|PENALT|SERVICE CREDIT|SERVICE LEVEL/i, "ld"],
  [/INDEMN/i, "indemnity"],
  [/LIABILITY/i, "liability"],
  [/INTELLECTUAL|WORK PRODUCT|RIGHTS OF USE|SUPPLIER TOOLS|OWNERSHIP/i, "ip"],
  [/RESTRICTIVE|NON-?COMPETE|EXCLUSIVITY|PROTECTIVE COVENANT/i, "non_compete"],
  [/SOLICIT/i, "non_solicit"],
  [/GOVERNING LAW|JURISDICTION|DISPUTE|ARBITRATION/i, "governing_law"],
  [/DATA PROTECTION|DATA SECURITY|PERSONAL DATA|PRIVACY|PHI|SAFEGUARD|PERMITTED (ACCESS|USES)|LOCATION OF|REGULATORY/i, "data_protection"],
  [/INSURANCE/i, "insurance"],
  [/PAYMENT|FEES|CHARGES|INVOIC|RATES|REMUNERATION|TIMEKEEPING|REFERRAL FEE|REVENUE SHARE/i, "payment"],
  [/CONFIDENTIAL|NON-DISCLOSURE|RESIDUAL|RETURN (AND|OR|OF)/i, "confidentiality"],
  [/TERMINATION|\bTERM\b|DURATION/i, "termination"],
];
/** Headings that are clearly "other": no model call needed. */
const KNOWN_OTHER =
  /WARRANT|ACCEPTANCE|GENERAL|MISCELLANEOUS|SCOPE|SERVICES|CHANGE|FORCE MAJEURE|ASSIGNMENT|NOTICES|PERSONNEL|APPOINTMENT|COMMITMENTS|MARKETING|OBLIGATIONS OF|COOPERATION|SUBCONTRACTING|INDEPENDENT CONTRACTOR|ENGAGEMENT|PURPOSE|RECORDS|AUDIT|DEFINITION|NO LICEN|EQUIPMENT|EXCLUSIONS|CLIENT OBLIGATIONS|CUSTOMER RESPONSIBILITIES|SUPPLY OF SERVICES|COMMENCEMENT|RELATIONSHIP|MILESTONES|PROJECT TEAM|OTHER TERMS|BACKGROUND|INDIVIDUAL RIGHTS|REPORTING|SUBCONTRACTORS|OTHER OBLIGATIONS|FINAL PROVISIONS|SUBJECT MATTER|DELIVERY/i;

export function typeFromHeading(heading: string, docType: DocType): ClauseType | null {
  const h = heading.toUpperCase();
  // Combined headings ("INDEMNITIES AND LIABILITY") are typed by the first rule that matches.
  for (const [re, t] of TYPE_RULES) if (re.test(h)) return t;
  if (docType === "NDA") return "confidentiality"; // NDA sections (obligations, exclusions, remedies) are all about confidentiality
  if (docType === "BAA") return "data_protection";
  if (KNOWN_OTHER.test(h)) return "other";
  return null; // unclear → fast model
}

/**
 * FR-26 (lite, docs/Masking_Lite_Spec.md): before any text goes to the AI provider, known client names,
 * people, contact details, bank / company numbers and money amounts are replaced with labels; the real values
 * are put back in the answer before anything else uses it.
 *  - Dictionary (global, built once per process): AtliQ's entities and identifiers (fixed labels
 *    [ATLIQ_PVT_LTD] / [ATLIQ_INC], so the wrong-entity check still knows which AtliQ is named), every
 *    counterparty in deals.json and register.json with derived short forms (aliases of one company share a
 *    label), and the reviewed people list data/seed/mask_people.json.
 *  - Patterns: emails, phones, IBAN / SWIFT / account numbers, company and tax numbers, money amounts
 *    (MASK_AMOUNTS=off keeps amounts visible).
 *  - Kept visible on purpose: regions, cities, sectors, percentages, durations, dates, clause numbers,
 *    product / tool names (PipeKit is an asset the conflict check needs, not a client).
 * Labels are numbered per call in order of first appearance; one table per call covers system + input.
 */
import fs from "node:fs";
import path from "node:path";
import { baseDeals, company, baseRegister } from "./data";
import { readState } from "./store";

export type Kind = "atliq" | "client" | "person" | "email" | "phone" | "bank" | "id" | "amount";
export type Counts = Record<Kind, number>;

export function maskingOn(): boolean {
  return (process.env.MASKING || "off").toLowerCase() === "on";
}
export function maskAmounts(): boolean {
  return (process.env.MASK_AMOUNTS || "on").toLowerCase() !== "off";
}

// ---------------------------------------------------------------- dictionary

type Term = { term: string; kind: "atliq" | "client" | "person"; group: string };
const LEGAL_SUFFIX = /[\s,]+(inc\.?|incorporated|ltd\.?|limited|pvt\.?|private|llc|llp|plc|gmbh|wll|w\.l\.l\.|co\.?|company|corp\.?|corporation|group|pte\.?|s\.a\.|ag|bv|the)$/i;
/** Words too common to mask on their own as a short form ("Gulf", "Blue", "Data"…). */
const GENERIC = new Set(["al", "the", "gulf", "blue", "north", "south", "east", "west", "new", "first", "global", "united", "national", "american", "indian", "data", "digital", "smart", "cloud", "tech", "city", "green", "red", "golden", "royal", "grand", "general", "health", "retail", "foods", "pharma", "capital", "mutual", "senior", "water", "energy"]);

function shortForms(name: string): string[] {
  const out = new Set<string>([name.trim()]);
  let s = name.replace(/\(.*?\)/g, "").trim();
  for (let i = 0; i < 3; i++) s = s.replace(LEGAL_SUFFIX, "").trim();
  if (s.length > 2) out.add(s);
  const words = s.split(/\s+/);
  if (words[0] && words[0].length >= 4 && !GENERIC.has(words[0].toLowerCase())) out.add(words[0]);
  else if (words.length >= 2 && !GENERIC.has(words[1].toLowerCase())) out.add(words.slice(0, 2).join(" "));
  return [...out].filter((t) => t.length >= 3);
}

let dict: { terms: Term[]; re: RegExp; byTerm: Map<string, Term> } | null = null;
let dictKey = "";

function readPeople(): { atliq: string[]; people: string[]; firstNamesUsedAlone: string[]; companies?: string[] } {
  const p = path.join(process.cwd(), "data", "seed", "mask_people.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : { atliq: [], people: [], firstNamesUsedAlone: [] };
}

export function dictionary() {
  const key = `${process.env.DATA_PROFILE ?? ""}|${readState().newDeals.length}`;
  if (dict && dictKey === key) return dict;
  const terms: Term[] = [];
  const add = (term: string, kind: Term["kind"], group: string) => {
    const t = term.replace(/\s+/g, " ").trim();
    if (t.length >= 3 && !terms.some((x) => x.term.toLowerCase() === t.toLowerCase())) terms.push({ term: t, kind, group });
  };
  // AtliQ first: fixed labels per entity.
  for (const e of company().entities) {
    const group = e.short === "Inc" ? "ATLIQ_INC" : "ATLIQ_PVT_LTD";
    for (const t of [e.name, ...((e as { identifiers?: string[] }).identifiers ?? [])]) add(t, "atliq", group);
  }
  // Clients: deals (with aliases) and every register counterparty, with derived short forms.
  const isAtliq = (n: string) => /atliq/i.test(n);
  const clients = new Map<string, string[]>();
  // Global, not per deal or profile: the main deals too when a profile (held-out set) is active.
  const mainDeals = process.env.DATA_PROFILE && fs.existsSync(path.join(process.cwd(), "data", "deals.json")) ? (JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "deals.json"), "utf8")) as { counterparty: string; counterpartyAliases: string[] }[]) : [];
  for (const d of [...mainDeals, ...baseDeals(), ...readState().newDeals]) clients.set(d.counterparty, [d.counterparty, ...d.counterpartyAliases]);
  for (const e of baseRegister().entries) for (const n of [e.counterparty, ...e.scope.counterparties]) if (!clients.has(n)) clients.set(n, [n]);
  for (const [name, aliases] of clients) {
    if (isAtliq(name)) continue;
    const group = `C:${shortForms(name).slice(-1)[0].toLowerCase()}`;
    for (const a of aliases) for (const t of shortForms(a)) if (!isAtliq(t)) add(t, "client", group);
  }
  const people = readPeople();
  // Third-party companies named in notes and schedules (reviewed list): masked like clients.
  for (const c of people.companies ?? []) for (const t of shortForms(c)) add(t, "client", `C:${shortForms(c).slice(-1)[0].toLowerCase()}`);
  for (const p of [...people.atliq, ...people.people]) add(p, "person", `P:${p.toLowerCase()}`);
  for (const f of people.firstNamesUsedAlone) {
    const full = people.people.find((p) => p.split(" ")[0].toLowerCase() === f.toLowerCase());
    add(f, "person", `P:${(full ?? f).toLowerCase()}`);
  }
  // Longest first, whole words, whitespace-tolerant (names break across lines in PDFs), case-insensitive.
  terms.sort((a, b) => b.term.length - a.term.length);
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  // A name may end at a hyphen ("BlueOrchid-validated"); hyphenated names stay whole because the longest term wins.
  const re = new RegExp(`(?<![\\w-])(?:${terms.map((t) => esc(t.term)).join("|")})(?!\\w)`, "gi");
  const byTerm = new Map(terms.map((t) => [t.term.toLowerCase().replace(/\s+/g, " "), t]));
  dict = { terms, re, byTerm };
  dictKey = key;
  return dict;
}

// ---------------------------------------------------------------- patterns

const PATTERNS: { kind: Kind; re: RegExp; amount?: boolean }[] = [
  { kind: "email", re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g },
  { kind: "bank", re: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?\b/g }, // IBAN
  { kind: "bank", re: /(?<=\b(?:SWIFT|BIC|SWIFT\/BIC)(?:\s*code)?[:\s]{1,3})[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g },
  { kind: "bank", re: /(?<=\b(?:account|a\/c|acct)(?:\s*(?:no\.?|number|#))?[:\s]{1,3})\d[\d\s-]{6,}\d/gi },
  { kind: "id", re: /(?<=\b(?:CIN|GSTIN|PAN|EIN|UEN|HRB|CR\s*No\.?|LLPIN|VAT(?:\s*No\.?)?|Tax\s*ID|company number|Registration No\.?)[:\s]{1,3})[A-Z0-9][A-Z0-9-]{3,}\b/gi },
  { kind: "phone", re: /\+\d{1,3}[\s-]?\(?\d{1,4}\)?(?:[\s-]?\d{2,4}){2,4}\b/g },
  { kind: "phone", re: /\(\d{3}\)\s?\d{3}-\d{4}\b/g },
  {
    kind: "amount",
    amount: true,
    re: /(?:US\$|USD|INR|Rs\.?|₹|EUR|€|AED|SAR|GBP|£|BHD|QAR|SGD|\$)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:million|mn|bn|billion|k|lakhs?|crores?|L)\b)?|\b\d[\d,]*(?:\.\d+)?\s?(?:million\s|lakhs?\s|crores?\s)?(?:USD|EUR|INR|AED|SAR|GBP|BHD|QAR|SGD)\b/g,
  },
];

// ---------------------------------------------------------------- mask / unmask

export class MaskTable {
  counts: Counts = { atliq: 0, client: 0, person: 0, email: 0, phone: 0, bank: 0, id: 0, amount: 0 };
  private labelOf = new Map<string, string>(); // group / value key → label
  private next: Record<string, number> = {};
  /** label → originals in the order they were masked (exact round trip), first = the form used for answers. */
  readonly originals = new Map<string, string[]>();

  label(kind: Kind, key: string, original: string): string {
    let l = this.labelOf.get(key);
    if (!l) {
      if (kind === "atliq") l = `[${key}]`;
      else {
        const k = kind.toUpperCase();
        this.next[k] = (this.next[k] ?? 0) + 1;
        l = `[${k}_${this.next[k]}]`;
      }
      this.labelOf.set(key, l);
      if (kind !== "atliq") this.counts[kind]++;
    }
    if (kind === "atliq" && !this.originals.has(l)) this.counts.atliq++;
    this.originals.set(l, [...(this.originals.get(l) ?? []), original]);
    return l;
  }
}

/** Mask one text with the call's table. */
export function mask(text: string, table: MaskTable): string {
  const d = dictionary();
  let out = text.replace(d.re, (m) => {
    const t = d.byTerm.get(m.toLowerCase().replace(/\s+/g, " "));
    if (!t) return m;
    return table.label(t.kind, t.kind === "atliq" ? t.group : t.group, m);
  });
  for (const p of PATTERNS) {
    if (p.amount && !maskAmounts()) continue;
    out = out.replace(p.re, (m) => (/\[[A-Z_]+\d*\]/.test(m) ? m : table.label(p.kind, `${p.kind}:${m.replace(/\s+/g, " ")}`, m)));
  }
  return out;
}

const LABEL_RE = /\[?\b((?:ATLIQ_(?:PVT_LTD|INC))|(?:(?:CLIENT|PERSON|EMAIL|PHONE|BANK|ID|AMOUNT)_\d+))\b\]?/gi;

/**
 * Labels → real values. exact: occurrences restored in the order they were masked (round trip of a masked
 * input); otherwise each label becomes its first-seen form (model answers). Tolerant of "[CLIENT_2]",
 * "CLIENT_2", "[Client_2]"; a label the model invented is left as is (the quote check then drops it).
 */
export function unmask(text: string, table: MaskTable, exact = false): string {
  const used = new Map<string, number>();
  return text.replace(LABEL_RE, (m, id: string) => {
    const label = `[${id.toUpperCase()}]`;
    const orig = table.originals.get(label);
    if (!orig) return m;
    if (!exact) return orig[0];
    const i = used.get(label) ?? 0;
    used.set(label, i + 1);
    return orig[Math.min(i, orig.length - 1)];
  });
}

export function unmaskDeep<T>(data: T, table: MaskTable): T {
  if (typeof data === "string") return unmask(data, table) as T;
  if (Array.isArray(data)) return data.map((x) => unmaskDeep(x, table)) as T;
  if (data && typeof data === "object") return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, unmaskDeep(v, table)])) as T;
  return data;
}

/** Leak check (after masking): any dictionary term or pattern still in the outgoing text. Types only, never values. */
export function leaks(masked: string): Kind[] {
  const d = dictionary();
  const out: Kind[] = [];
  for (const m of masked.matchAll(d.re)) {
    const t = d.byTerm.get(m[0].toLowerCase().replace(/\s+/g, " "));
    if (t) out.push(t.kind);
  }
  for (const p of PATTERNS) {
    if (p.amount && !maskAmounts()) continue;
    for (const m of masked.matchAll(p.re)) if (!/\[[A-Z_]+\d*\]/.test(m[0])) out.push(p.kind);
  }
  return out;
}

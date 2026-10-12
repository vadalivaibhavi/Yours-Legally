/**
 * F4 playbook & fairness check (FR-7), strong model.
 * - Client paper: compare key clauses with AtliQ's approved playbook.
 * - AtliQ's own paper (mirror mode): apply the same standard AtliQ asks for as a supplier, and check
 *   flow-down against the linked client contract (pass down the client's obligations, not its leverage).
 * - SOWs: terms not in the SOW are governed by the signed MSA; absent clauses are not findings.
 * Precedents are attached in code from the playbook (labelled standard / exception / concession / accident).
 */
import { z } from "zod";
import { OWNER } from "./owners";
import { callModel } from "../llm";
import { locateQuote } from "../quotes";
import type { Deal, Document, PlaybookRule } from "../types";
import type { Citation, Finding, GateResult, Severity } from "./types";

export const PlaybookTopic = z.enum([
  "ld",
  "payment",
  "liability",
  "indemnity",
  "ip",
  "governing_law",
  "termination",
  "confidentiality",
  "restrictive",
  "data_protection",
  "insurance",
  "acceptance",
  "warranty",
  "set_off",
  "misclassification",
  "flowdown_ip",
  "flowdown_data",
  "flowdown_consent",
  "flowdown_other",
  "sequencing",
  "other",
]);

const Result = z.object({
  findings: z.array(
    z.object({
      topic: PlaybookTopic,
      severity: z.enum(["high", "medium", "low"]).describe("high = AtliQ would never accept / must fix; medium = negotiate; low = note only"),
      title: z.string().describe("≤12 words"),
      deviation: z.string().describe("What the clause says vs AtliQ's standard, factual"),
      impact: z.string().describe("One plain-English sentence on what it means for AtliQ"),
      clauseRef: z.string(),
      quote: z.string().describe("VERBATIM text of the clause in THIS document"),
      counterPosition: z.string().describe("The fair counter-position AtliQ should ask for (from the playbook)"),
      needsJudgment: z.boolean(),
      linkedClauseRef: z.string().nullable().describe("For flow-down findings: the clause of the linked client contract that creates the obligation"),
      linkedQuote: z.string().nullable().describe("VERBATIM from the linked client contract"),
    }),
  ),
  fine: z.array(z.object({ topic: PlaybookTopic, note: z.string().describe("e.g. 'LDs match your standard'") })),
});

function playbookText(rules: PlaybookRule[]) {
  return rules
    .map((r) => `- [${r.id}] ${r.topic}: ${r.standard}${r.acceptableRange ? ` Acceptable: ${r.acceptableRange}` : ""} Never accept: ${r.neverAccept.join("; ")}. Counter: ${r.counterPosition}`)
    .join("\n");
}

const SYSTEM = `You compare a contract with AtliQ's approved negotiation playbook and report only real deviations, each with a VERBATIM quote of the clause.
Calibrate severity: "high" only for terms the playbook says never to accept or that AtliQ must fix; "medium" for negotiable deviations; omit terms that meet the standard (list them under "fine" instead). Do not invent concerns: a clean clause is reported as fine.
Calibration: when a clause's economics match the standard (rate, base, cap, client-delay exclusion), wording differences such as a missing \"sole remedy\" sentence are \"low\" at most. A narrower obligation than the standard (e.g. an indemnity limited to IP infringement, no general indemnity) is better for AtliQ, not a deviation.
Do not report contracting entity, governing law, payment days or missing annexes: deterministic rules already cover those (they are listed for context).
Never say "breach", "enforceable" or "unenforceable"; never give a legal conclusion. Mandatory provisions of the governing law (e.g. German statutory liability for intent and gross negligence) are not deviations.`;

export async function checkPlaybook(args: {
  doc: Document;
  deal: Deal;
  rules: PlaybookRule[];
  gate: GateResult[];
  linkedClient?: { deal: Deal; docs: Document[] } | null;
  masterAgreement?: Document | null;
}): Promise<{ findings: Finding[]; fine: string[]; error?: string }> {
  const { doc, deal } = args;
  const mirror = doc.paper === "atliq" && doc.sideOfTable === "buyer";
  const sow = doc.docType === "SOW";
  const rules = args.rules.filter((r) => r.appliesTo === "both" || (mirror ? r.appliesTo === "atliq_paper" : r.appliesTo === "incoming"));
  const mode = mirror
    ? `MIRROR MODE: this is AtliQ's OWN paper for a ${doc.docType === "ICA" ? "freelance contractor" : "vendor/subcontractor"} (AtliQ is the buyer). Apply the "mirror test": flag every clause AtliQ would reject if a client sent it to AtliQ (uncapped or per-day penalties, pay-when-paid or >45-day payment, indemnity covering AtliQ's own negligence, unlimited liability for the other side only, one-sided termination, worldwide non-competes, exclusivity that makes a freelancer look like an employee). Do NOT flag terms that are fair to the other side.
${args.linkedClient ? `FLOW-DOWN: the work is for the client contract below. Check that obligations AtliQ promised the client are passed down: IP (the vendor must assign so AtliQ can give the client what it promised), data protection (sub-processor / sub-BAA terms, data handling, background checks/training if required), client consent to subcontract, and timing (vendor starting before the client contract is signed). Use topics flowdown_ip, flowdown_data, flowdown_consent, flowdown_other, sequencing. Quote the client contract clause in linkedQuote. Pass down the client's obligations, never its leverage: the client's one-sided terms must NOT be passed down.` : ""}`
    : sow
      ? `This is a Statement of Work under a signed MSA (shown below for context). Anything the SOW doesn't cover is governed by the MSA: do not flag absent clauses. Check only what the SOW itself says.`
      : `This is the ${doc.paper === "client" ? "counterparty's" : "AtliQ's"} paper; AtliQ's side: ${doc.sideOfTable}. Compare each key clause (delay penalties, liability, indemnity, IP, termination, restrictive covenants, data protection, insurance, set-off, acceptance) with the playbook.`;

  const input = [
    `Deal: ${deal.name}`,
    mode,
    `## AtliQ playbook (approved)\n${playbookText(rules)}`,
    `## Already checked by rules (don't repeat)\n${args.gate.map((g) => `- ${g.label}: ${g.pass === null ? "n/a" : g.pass ? "pass" : "FAIL"} (${g.detail})`).join("\n")}`,
    `## DOCUMENT UNDER REVIEW: ${doc.title}\n${doc.text}`,
    args.masterAgreement ? `## SIGNED MASTER AGREEMENT (context only)\n${args.masterAgreement.text}` : "",
    args.linkedClient ? `## LINKED CLIENT CONTRACT (${args.linkedClient.deal.name}) for flow-down\n${args.linkedClient.docs.map((d) => d.text).join("\n\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const r = await callModel({ task: "playbook", system: SYSTEM, input, schema: Result });
  if (!r.ok) return { findings: [], fine: [], error: `Playbook check ${r.message} (${r.error.slice(0, 160)})` };

  const findings: Finding[] = [];
  for (const f of r.data.findings) {
    const q = locateQuote(doc.text, f.quote);
    if (!q) continue; // citation guardrail: drop findings whose quote doesn't match the source
    const citations: Citation[] = [{ docId: doc.id, docTitle: doc.title, clauseRef: f.clauseRef, quote: q, role: "incoming" }];
    if (f.linkedQuote && args.linkedClient) {
      for (const ld of args.linkedClient.docs) {
        const lq = locateQuote(ld.text, f.linkedQuote);
        if (lq) {
          citations.push({ docId: ld.id, docTitle: ld.title, clauseRef: f.linkedClauseRef ?? "", quote: lq, role: "linked" });
          break;
        }
      }
    }
    const flow = f.topic.startsWith("flowdown_") || f.topic === "sequencing";
    const key = flow ? `flowdown:${f.topic === "sequencing" ? "sequencing" : f.topic.replace("flowdown_", "")}` : `playbook:${f.topic}`;
    const rule = ruleFor(args.rules, f.topic, mirror);
    findings.push({
      key,
      category: flow ? "flowdown" : "playbook",
      topic: f.topic,
      title: f.title,
      impact: f.impact,
      severity: f.severity as Severity,
      confidence: "medium",
      needsJudgment: f.needsJudgment,
      owner: mirror ? OWNER.fixBeforeSending : f.needsJudgment ? "Karandeep" : "Karandeep",
      resolution: mirror ? "fix_before_sending" : "redline",
      docId: doc.id,
      citations,
      standard: rule?.standard ?? f.deviation,
      counterPosition: f.counterPosition,
      precedents: rule?.precedents,
    });
  }
  return { findings, fine: r.data.fine.map((x) => x.note) };
}

const TOPIC_RULE: Record<string, string> = {
  ld: "pb-ld",
  payment: "pb-payment",
  liability: "pb-liability",
  indemnity: "pb-indemnity",
  ip: "pb-ip",
  governing_law: "pb-law",
  termination: "pb-termination",
  confidentiality: "pb-nda",
  restrictive: "pb-restrictive",
  misclassification: "pb-atliq-paper",
  data_protection: "pb-data",
  insurance: "pb-insurance",
  flowdown_ip: "pb-ip-flowdown",
  flowdown_data: "pb-data",
  flowdown_consent: "pb-atliq-paper",
  flowdown_other: "pb-atliq-paper",
  sequencing: "pb-atliq-paper",
  set_off: "pb-payment",
};

export function ruleFor(rules: PlaybookRule[], topic: string, mirror = false): PlaybookRule | undefined {
  if (mirror && topic === "ip") return rules.find((r) => r.id === "pb-ip-flowdown");
  return rules.find((r) => r.id === TOPIC_RULE[topic]);
}

// ---------------------------------------------------------------- NDA fast lane (FR-5, FR-8)
const NdaItem = z.enum(["definition", "obligations", "residuals", "remedies", "covenants", "term"]);
const NdaResult = z.object({
  items: z.array(
    z.object({
      item: NdaItem,
      pass: z.boolean().describe("true = mutual / acceptable"),
      severity: z.enum(["high", "medium", "low"]).nullable().describe("null when pass"),
      finding: z.string().describe("What the NDA actually does, regardless of its title"),
      clauseRef: z.string(),
      quote: z.string().describe("VERBATIM"),
      counterPosition: z.string().nullable(),
    }),
  ),
});

const NDA_SYSTEM = `You test whether an NDA is mutual IN SUBSTANCE, ignoring its title. Check six items and report each once:
definition (whose information is protected), obligations (who is bound), residuals (any right to use retained knowledge, and for whom), remedies (injunctions, indemnities: mutual? capped?), covenants (any non-compete / non-solicit / exclusivity hidden in the NDA), term (fixed or perpetual; how long obligations survive).
If an item is genuinely mutual and reasonable, pass=true with no concerns. A genuinely mutual NDA returns all items passing: never invent concerns.
Quote VERBATIM. Never say "breach" or "enforceable"; no legal conclusions.`;

export async function checkNda(args: { doc: Document; deal: Deal; rules: PlaybookRule[] }): Promise<{ findings: Finding[]; fine: string[]; error?: string }> {
  const { doc, deal } = args;
  const input = [`NDA: ${doc.title} (${doc.paper === "atliq" ? "AtliQ's own template" : "counterparty's paper"})`, doc.text].join("\n\n");
  const r = await callModel({ task: "nda", system: NDA_SYSTEM, input, schema: NdaResult });
  if (!r.ok) return withOneWayRules(doc, deal, { findings: [], fine: [], error: `NDA check ${r.message} (${r.error.slice(0, 160)})` });
  const rule = args.rules.find((x) => x.id === "pb-nda");
  const findings: Finding[] = [];
  const fine: string[] = [];
  for (const it of r.data.items) {
    if (it.pass || !it.severity) {
      fine.push(`NDA ${it.item}: ${it.finding}`);
      continue;
    }
    const q = locateQuote(doc.text, it.quote);
    if (!q) continue;
    findings.push({
      key: `nda:${it.item}`,
      category: "nda",
      topic: it.item,
      title: `Not mutual: ${it.item}`,
      impact: it.finding,
      severity: it.severity as Severity,
      confidence: "high",
      needsJudgment: false,
      owner: doc.paper === "atliq" ? OWNER.fixBeforeSending : "Karandeep",
      resolution: doc.paper === "atliq" ? "fix_before_sending" : "redline",
      docId: doc.id,
      citations: [{ docId: doc.id, docTitle: doc.title, clauseRef: it.clauseRef, quote: q, role: "incoming" }],
      standard: rule?.standard,
      counterPosition: it.counterPosition ?? rule?.counterPosition,
      precedents: rule?.precedents,
    });
  }
  return withOneWayRules(doc, deal, { findings, fine });
}

/**
 * A3: one-way NDA, by rules (a backstop to the model's mutuality check, which can take a "mutual" title at
 * face value). Two tell-tale patterns, each quoted verbatim:
 *  - definition: "Confidential Information" is what ONE named party discloses "to the Recipient" (never "a
 *    Party", "one Party", "either Party");
 *  - obligations: "the Recipient shall" at least twice, and never "Receiving Party shall" / "each Party shall".
 * A rule finding is added when the model passed that item (or failed); the model's "fine" note for it goes.
 */
export function oneWayNda(text: string): { item: "definition" | "obligations"; quote: string; why: string }[] {
  const out: { item: "definition" | "obligations"; quote: string; why: string }[] = [];
  const def = text.match(/confidential information[*"”]*\s*(?:means|shall mean)[^.]{0,400}/i)?.[0] ?? "";
  if (/\bto the recipient\b/i.test(def) && !/\b(a|one|either|each) party\b/i.test(def)) {
    const q = locateQuote(text, def.slice(0, 220));
    if (q) out.push({ item: "definition", quote: q, why: "Confidential Information covers only what one party discloses to the Recipient, so AtliQ's own information is not protected." });
  }
  const recipientShall = text.match(/^[^\n]*\bthe recipient shall\b[^\n]*/gim) ?? [];
  if (recipientShall.length >= 2 && !/\b(receiving party|each party|either party) shall\b/i.test(text)) {
    const q = locateQuote(text, (recipientShall[0] ?? "").trim().slice(0, 220));
    if (q) out.push({ item: "obligations", quote: q, why: `The obligations bind only the Recipient ("the Recipient shall" ${recipientShall.length} times, never "each Party").` });
  }
  return out;
}

function withOneWayRules(doc: Document, deal: Deal, res: { findings: Finding[]; fine: string[]; error?: string }) {
  for (const hit of oneWayNda(doc.text)) {
    if (res.findings.some((x) => x.key === `nda:${hit.item}`)) continue; // the model already caught it
    res.fine = res.fine.filter((x) => !x.startsWith(`NDA ${hit.item}:`));
    res.findings.push({
      key: `nda:${hit.item}`,
      category: "nda",
      topic: hit.item,
      title: `Not mutual: ${hit.item} (rule check)`,
      impact: hit.why,
      severity: "high",
      confidence: "high",
      needsJudgment: false,
      owner: doc.paper === "atliq" ? OWNER.fixBeforeSending : "Karandeep",
      resolution: doc.paper === "atliq" ? "fix_before_sending" : "redline",
      docId: doc.id,
      citations: [{ docId: doc.id, docTitle: doc.title, clauseRef: hit.item === "definition" ? "definition" : "obligations", quote: hit.quote, role: "incoming" }],
      counterPosition: hit.item === "definition" ? "Make it mutual: information disclosed by either Party to the other." : "Make the obligations bind each Receiving Party, not only AtliQ.",
    });
  }
  return res;
}

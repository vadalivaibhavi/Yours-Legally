/**
 * F2 gate rules (FR-4): plain TypeScript over AI-extracted fields, never prompts (CLAUDE.md).
 * entity ↔ client country · parties entity = invoicing entity · law ↔ entity · payment ≤45 days ·
 * LDs capped · liability capped · insurance asked vs held · referenced annexes present.
 * Payment / LD-cap / liability-cap failures are keyed under their playbook topic so the
 * deeper F4 finding on the same clause merges with them (one finding per topic).
 */
import { canonRegion, expectedEntityFor } from "../geo";
import type { Company, Deal, Document } from "../types";
import type { Extraction } from "./extract";
import type { Citation, Finding, GateResult } from "./types";

const OK_UNCAPPED = /fraud|wil+ful|intent|gross negligence|death|injury|product liability|confidential|infring|indemnif|mandatory/i;

export type GateContext = {
  doc: Document;
  x: Extraction;
  deal: Deal;
  company: Company;
  /** Text of every other document in the deal (annexes may arrive as separate documents). */
  dealTexts: { id: string; title: string; text: string }[];
  /** For AtliQ paper: entity that should contract, from the linked client deal (Marcus → Lakeshore → Inc). */
  endClientCountry?: string | null;
};

function cite(doc: Document, clauseRef: string | null, quote: string | null): Citation | undefined {
  return quote ? { docId: doc.id, docTitle: doc.title, clauseRef: clauseRef ?? "", quote, role: "incoming" } : undefined;
}

export function runGate(ctx: GateContext): { results: GateResult[]; findings: Finding[]; notSeen: string[] } {
  const { doc, x, deal, company } = ctx;
  const atliqPaper = doc.paper === "atliq";
  const results: GateResult[] = [];
  const findings: Finding[] = [];
  const notSeen: string[] = [];
  const fixOwner = atliqPaper ? `${deal.owner} (fix before sending)` : "the other side";
  const fixResolution = atliqPaper ? ("fix_before_sending" as const) : ("document" as const);

  // 1. Entity ↔ client country (finance fact sheet: Inc = US clients only)
  const named = x.atliqEntityNamed.value ?? doc.atliqEntity ?? null;
  const basisCountry =
    doc.sideOfTable === "partner"
      ? null
      : doc.sideOfTable === "buyer"
        ? (ctx.endClientCountry ?? x.counterpartyCountry)
        : (deal.clientCountry ?? x.counterpartyCountry);
  const expected = expectedEntityFor(basisCountry);
  const entityCite = cite(doc, x.atliqEntityNamed.clauseRef, x.atliqEntityNamed.quote);
  if (!expected || !named) {
    results.push({ rule: "entity", label: "Correct AtliQ entity", pass: null, detail: doc.sideOfTable === "partner" ? "Partnership: no client-country rule" : "Couldn't determine", citation: entityCite });
  } else if (expected === named) {
    results.push({ rule: "entity", label: "Correct AtliQ entity", pass: true, detail: `${named} for a ${canonRegion(basisCountry!)}${doc.sideOfTable === "buyer" ? " end client" : " counterparty"}`, citation: entityCite });
  } else {
    const detail = `Names AtliQ ${named}, but ${doc.sideOfTable === "buyer" ? "the end client is" : "the client is"} in ${canonRegion(basisCountry!)}: AtliQ ${named === "Inc" ? "Inc serves US clients only" : "Inc is the entity for US work"}, so this should be AtliQ ${expected}.`;
    results.push({ rule: "entity", label: "Correct AtliQ entity", pass: false, detail, citation: entityCite });
    findings.push({
      key: "gate:entity",
      category: "gate",
      topic: "entity",
      title: `Wrong AtliQ entity: ${named} instead of ${expected}`,
      impact: `${detail} The entity decides who invoices, the tax regime and the bank account; a mismatch caused two payment delays in 2025.`,
      severity: "high",
      confidence: "high",
      needsJudgment: false,
      owner: fixOwner,
      resolution: fixResolution,
      docId: doc.id,
      citations: entityCite ? [entityCite] : [],
      standard: "AtliQ Inc contracts with US clients only; AtliQ Technologies Pvt Ltd with everyone else.",
      counterPosition: `Name AtliQ ${expected} in the parties clause, invoicing clause and signature block${atliqPaper && expected === "Inc" ? " and use the US template (US law, USD)" : ""}.`,
    });
  }

  // 2. Parties entity = invoicing entity
  const inv = x.invoicingEntity.value;
  const invCite = cite(doc, x.invoicingEntity.clauseRef, x.invoicingEntity.quote);
  if (inv && named && inv !== named) {
    results.push({ rule: "invoicing_entity", label: "Parties = invoicing entity", pass: false, detail: `Parties clause names ${named}; invoicing names ${inv}`, citation: invCite });
    findings.push({
      key: "gate:invoicing_entity",
      category: "gate",
      topic: "invoicing_entity",
      title: `Contracting entity (${named}) ≠ invoicing entity (${inv})`,
      impact: `The parties clause and the invoicing clause name different AtliQ entities: the exact pattern behind two payment delays in 2025.`,
      severity: "high",
      confidence: "high",
      needsJudgment: false,
      owner: fixOwner,
      resolution: fixResolution,
      docId: doc.id,
      citations: [entityCite, invCite].filter((c): c is Citation => !!c),
      counterPosition: "One AtliQ entity throughout: parties, invoicing, bank details and signature block.",
    });
  } else {
    results.push({ rule: "invoicing_entity", label: "Parties = invoicing entity", pass: inv ? true : null, detail: inv ? `${inv} throughout` : "No separate invoicing entity named", citation: invCite });
  }

  // 3. Governing law vs entity (judgment, not a blocker: client law has been conceded before)
  const entityForLaw = expected ?? named;
  const lawCountry = x.governingLaw.country ? canonRegion(x.governingLaw.country) : null;
  const lawCite = cite(doc, x.governingLaw.clauseRef, x.governingLaw.quote);
  if (!lawCountry || !entityForLaw) {
    results.push({ rule: "governing_law", label: "Governing law matches entity", pass: null, detail: x.governingLaw.value ?? "Not stated", citation: lawCite });
  } else {
    const want = entityForLaw === "Inc" ? "USA" : "India";
    const pass = lawCountry === want;
    results.push({ rule: "governing_law", label: "Governing law matches entity", pass, detail: `${x.governingLaw.value} (${entityForLaw} → ${want === "USA" ? "US law" : "Indian law"})`, citation: lawCite });
    if (!pass)
      findings.push({
        key: "gate:governing_law",
        category: "gate",
        topic: "governing_law",
        title: `Governing law: ${x.governingLaw.value}`,
        impact: `AtliQ's position is ${want === "USA" ? "US law for AtliQ Inc" : "Indian law for AtliQ Technologies Pvt Ltd"}. Client law has been accepted before to win a deal (DIFC, English, Singapore): a judgment call, not a blocker.`,
        severity: "medium",
        confidence: "high",
        needsJudgment: true,
        owner: "Karandeep",
        resolution: "redline",
        docId: doc.id,
        citations: lawCite ? [lawCite] : [],
        standard: "Indian law for Pvt Ltd; US law for Inc.",
        counterPosition: want === "USA" ? "Law of the relevant US state; US forum." : "Laws of India; arbitration seated in India or a neutral seat.",
      });
  }

  // 4. Payment ≤ 45 days, no pay-when-paid
  const payCite = cite(doc, x.payment.clauseRef, x.payment.quote);
  const days = x.payment.days;
  if (x.payment.payWhenPaid || (days !== null && days > 45)) {
    const sev = x.payment.payWhenPaid || (days ?? 0) >= 90 ? "high" : "medium";
    const what = x.payment.payWhenPaid ? `pay-when-paid${days ? `, up to ${days} days` : ""}` : `${days} days`;
    results.push({ rule: "payment", label: "Payment ≤ 45 days", pass: false, detail: what, citation: payCite });
    findings.push({
      key: "playbook:payment",
      category: "playbook",
      topic: "payment",
      title: `Payment: ${what}`,
      impact: x.payment.payWhenPaid
        ? `Payment depends on someone else paying first. AtliQ's standard is 30 days (45 max) and it would reject this as a supplier.`
        : `${days}-day payment against AtliQ's 30-day standard (45 max).`,
      severity: sev,
      confidence: "high",
      needsJudgment: false,
      owner: atliqPaper ? `${deal.owner} (fix before sending)` : "Karandeep",
      resolution: atliqPaper ? "fix_before_sending" : "redline",
      docId: doc.id,
      citations: payCite ? [payCite] : [],
      standard: "30 days from invoice; 45 days is the negotiated maximum.",
      counterPosition: "Payment within 30 days of receipt of invoice (45 days maximum); no pay-when-paid.",
    });
  } else results.push({ rule: "payment", label: "Payment ≤ 45 days", pass: days === null ? null : true, detail: days === null ? "Not stated (may sit in the master agreement)" : `${days} days`, citation: payCite });

  // 5. LDs capped
  const ldCite = cite(doc, x.ld.clauseRef, x.ld.quote);
  if (x.ld.present && x.ld.capPct === null) {
    results.push({ rule: "ld_cap", label: "Delay penalties capped", pass: false, detail: "Uncapped", citation: ldCite });
    findings.push({
      key: "playbook:ld",
      category: "playbook",
      topic: "ld",
      title: "Uncapped delay penalties",
      impact: "Liquidated damages with no cap: open-ended exposure. Karandeep's rule: \"cap it. never open ended\". Brightwater's uncapped LDs cost $9k + $14.2k in legal fees.",
      severity: "high",
      confidence: "high",
      needsJudgment: false,
      owner: atliqPaper ? `${deal.owner} (fix before sending)` : "Karandeep",
      resolution: atliqPaper ? "fix_before_sending" : "redline",
      docId: doc.id,
      citations: ldCite ? [ldCite] : [],
    });
  } else if (x.ld.present && (x.ld.base === "contract_value" || x.ld.base === "total_fees" || x.ld.period === "day")) {
    // Playbook "never accept": LDs per day or on total contract value (Brightwater pattern).
    results.push({ rule: "ld_cap", label: "Delay penalties capped", pass: true, detail: `Cap ${x.ld.capPct}% of ${x.ld.capBase ?? "?"}`, citation: ldCite });
    findings.push({
      key: "playbook:ld",
      category: "playbook",
      topic: "ld",
      title: `Delay penalties of ${x.ld.ratePct ?? "?"}% of ${x.ld.base === "milestone" ? "the milestone" : "the whole contract value"} per ${x.ld.period ?? "period"}`,
      impact: `Penalties run on ${x.ld.base === "milestone" ? "the milestone" : "total contract value"}${x.ld.period === "day" ? " per day" : ""}, far above AtliQ's 0.5% of the affected milestone per week (5% cap). This is the Brightwater pattern.`,
      severity: "high",
      confidence: "high",
      needsJudgment: false,
      owner: atliqPaper ? `${deal.owner} (fix before sending)` : "Karandeep",
      resolution: atliqPaper ? "fix_before_sending" : "redline",
      docId: doc.id,
      citations: ldCite ? [ldCite] : [],
      counterPosition: "0.5% of the affected milestone fee per week, capped at 5% of that milestone fee; no LDs for client-caused delay; LDs as sole remedy for delay.",
    });
  } else results.push({ rule: "ld_cap", label: "Delay penalties capped", pass: x.ld.present ? true : null, detail: x.ld.present ? `Cap ${x.ld.capPct}% of ${x.ld.capBase ?? "?"}` : "No delay penalties", citation: ldCite });

  // 6. Liability capped
  const liabCite = cite(doc, x.liability.clauseRef, x.liability.quote);
  const badCarveOuts = x.liability.uncappedFor
    .filter((u) => !OK_UNCAPPED.test(u))
    .map((u) => u.replace(/^(any )?(breach|violation) of /i, "").replace(/^clause \d+(\.\d+)? \((.+)\)$/i, "$2"));
  if (x.liability.atliqCapped === false) {
    results.push({ rule: "liability_cap", label: "Liability capped", pass: false, detail: "AtliQ's liability is unlimited", citation: liabCite });
    findings.push({
      key: "playbook:liability",
      category: "playbook",
      topic: "liability",
      title: "Unlimited liability for AtliQ",
      impact: "No cap on AtliQ's liability. Karandeep walked away from Kessler (€120k) over exactly this: \"one bad incident and the company is gone\".",
      severity: "high",
      confidence: "high",
      needsJudgment: false,
      owner: atliqPaper ? `${deal.owner} (fix before sending)` : "Karandeep",
      resolution: atliqPaper ? "fix_before_sending" : "redline",
      docId: doc.id,
      citations: liabCite ? [liabCite] : [],
    });
  } else if (badCarveOuts.length) {
    results.push({ rule: "liability_cap", label: "Liability capped", pass: false, detail: `Capped (${x.liability.capText ?? "?"}) but uncapped for: ${badCarveOuts.join(", ")}`, citation: liabCite });
    findings.push({
      key: "playbook:liability",
      category: "playbook",
      topic: "liability",
      title: `Liability uncapped for ${badCarveOuts.join(", ")}`,
      impact: `The general cap is fine, but ${badCarveOuts.join(", ")} sits outside it: unlimited exposure where AtliQ handles the client's data.`,
      severity: "medium",
      confidence: "medium",
      needsJudgment: false,
      owner: atliqPaper ? `${deal.owner} (fix before sending)` : "Karandeep",
      resolution: atliqPaper ? "fix_before_sending" : "redline",
      docId: doc.id,
      citations: liabCite ? [liabCite] : [],
    });
  } else
    results.push({ rule: "liability_cap", label: "Liability capped", pass: x.liability.atliqCapped === null ? null : true, detail: x.liability.capText ?? (x.liability.atliqCapped === null ? "Not stated" : "Capped"), citation: liabCite });

  // 7. Insurance asked vs held (company facts: only $1M cyber is known)
  for (const ins of x.insurance) {
    if (!ins.amountUsd || ins.type === "workers_comp") continue;
    const heldType = ins.type === "errors_and_omissions" ? "errors_and_omissions" : ins.type;
    const held = company.insuranceHeld.find((h) => h.type === heldType) ?? company.insuranceHeld.find((h) => h.type === "professional_indemnity" && ins.type === "errors_and_omissions");
    const insCite = cite(doc, ins.clauseRef, ins.quote);
    const label = `Insurance: ${ins.type.replace(/_/g, " ")} $${(ins.amountUsd / 1e6).toFixed(ins.amountUsd % 1e6 ? 1 : 0)}M`;
    if (held?.amountUsd != null && held.amountUsd < ins.amountUsd) {
      results.push({ rule: `insurance:${ins.type}`, label, pass: false, detail: `AtliQ holds $${held.amountUsd / 1e6}M`, citation: insCite });
      findings.push({
        key: `gate:insurance:${ins.type}`,
        category: "gate",
        topic: "insurance",
        title: `${ins.type.replace(/_/g, " ")} insurance: $${ins.amountUsd / 1e6}M required, AtliQ holds $${held.amountUsd / 1e6}M`,
        impact: `AtliQ can't meet this on day one; certificates are usually due before work starts. Raise it with the client or price the extra cover before signing.`,
        severity: "high",
        confidence: "high",
        needsJudgment: false,
        owner: "Karandeep (business fix)",
        resolution: "business_fix",
        docId: doc.id,
        citations: insCite ? [insCite] : [],
        standard: "Check required limits against actual cover before signing.",
      });
    } else if (held?.amountUsd == null) {
      results.push({ rule: `insurance:${ins.type}`, label, pass: null, detail: "AtliQ's cover for this type isn't recorded: verify", citation: insCite });
      notSeen.push(`${label} required: AtliQ's ${ins.type.replace(/_/g, " ")} cover isn't recorded anywhere. Confirm with finance.`);
    } else results.push({ rule: `insurance:${ins.type}`, label, pass: true, detail: `Held: $${held.amountUsd / 1e6}M`, citation: insCite });
  }

  // 8. Referenced annexes present (in this document or elsewhere in the deal)
  for (const a of x.annexes) {
    const present = annexPresent(a.name, doc, ctx.dealTexts);
    const aCite = cite(doc, a.clauseRef, a.quote);
    results.push({ rule: `annex:${slug(a.name)}`, label: `${a.name} attached`, pass: present.found, detail: present.found ? present.where : `${a.description}: referenced but not attached`, citation: aCite });
    if (!present.found) {
      findings.push({
        key: `gate:annex:${slug(a.name)}`,
        category: "gate",
        topic: "annex",
        title: `Missing: ${a.name} (${a.description})`,
        impact: `${a.name} is referenced as part of the agreement but isn't in the pack, so it hasn't been checked. The fine-print review of everything else still ran.`,
        severity: "high",
        confidence: "high",
        needsJudgment: false,
        owner: deal.owner,
        resolution: "document",
        docId: doc.id,
        citations: aCite ? [aCite] : [],
        missingItem: { item: `${a.name}: ${a.description}`, owner: deal.owner },
      });
    }
  }

  return { results, findings, notSeen };
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function annexPresent(name: string, doc: Document, others: { id: string; title: string; text: string }[]): { found: boolean; where: string } {
  const n = name.toLowerCase().replace(/\s+/g, " ").trim();
  const headingRe = new RegExp(`^#{1,4}\\s*[^\\n]*\\b${escapeRe(n)}\\b`, "im");
  if (headingRe.test(doc.text)) return { found: true, where: "Attached in this document" };
  for (const o of others) {
    if (o.id === doc.id) continue;
    if (o.title.toLowerCase().includes(n) || headingRe.test(o.text.split("\n").slice(0, 12).join("\n"))) return { found: true, where: `Provided as ${o.title}` };
  }
  return { found: false, where: "" };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

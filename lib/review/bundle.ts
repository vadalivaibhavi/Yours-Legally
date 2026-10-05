/**
 * F5 deal bundle & data readiness (FR-9): deal type → required documents per party (rules from
 * data/required_docs.json, evaluated in code). The verdict can't be SIGN while required documents
 * are missing: each missing item becomes a "waiting for input" entry with an owner.
 */
import { regionsOverlap } from "../geo";
import type { Company, Deal, Document, RegisterEntry, RequiredDocRule } from "../types";
import type { Extraction } from "./extract";
import type { BundleRow, Citation, Finding, GateResult } from "./types";

type Ctx = {
  deal: Deal;
  docs: Document[]; // incoming docs in the deal
  contextDocs: Document[];
  allDocs: Document[];
  allDeals: Deal[];
  extractions: Map<string, Extraction>;
  gates: Map<string, GateResult[]>;
  register: RegisterEntry[];
  rules: RequiredDocRule[];
  company: Company;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function checkBundle(ctx: Ctx): { rows: BundleRow[]; findings: Finding[]; profile: { sectors: string[]; regions: string[]; dataTypes: string[] } } {
  const { deal } = ctx;
  const xs = [...ctx.extractions.values()];
  const supplierDocs = ctx.docs.filter((d) => d.sideOfTable === "supplier");
  const sectors = [...new Set(xs.flatMap((x) => x.sectors))];
  const regions = [...new Set([...xs.flatMap((x) => x.regions), ...(deal.clientCountry ? [deal.clientCountry] : [])])];
  const dataTypes = [...new Set(xs.flatMap((x) => x.dataTypes))].filter((d) => d !== "none");
  const profile = { sectors, regions, dataTypes };
  const rows: BundleRow[] = [];
  const findings: Finding[] = [];
  if (!supplierDocs.length) return { rows, findings, profile }; // bundle rules apply to client deals

  const entity = supplierDocs[0].atliqEntity ?? ctx.extractions.get(supplierDocs[0].id)?.atliqEntityNamed.value ?? "Pvt Ltd";
  const subDeals = ctx.allDeals.filter((d) => d.endClientDealId === deal.id);
  const cp = norm(deal.counterparty.split(" ")[0]);
  const docsWith = (pred: (d: Document) => boolean) => [...ctx.docs, ...ctx.contextDocs, ...ctx.allDocs.filter((d) => d.kind === "signed" && norm(d.counterparty).includes(cp))].filter(pred);
  const statusOf = (type: string): BundleRow["status"] => {
    const found = docsWith((d) => d.docType === type);
    if (found.some((d) => d.kind === "signed")) return "signed";
    if (found.length) return "in_review";
    return "missing";
  };

  const add = (row: BundleRow, finding?: Omit<Finding, "category" | "topic" | "confidence" | "needsJudgment" | "docId">) => {
    rows.push(row);
    if (finding && !findings.some((f) => f.key === finding.key)) findings.push({ category: "bundle", topic: "bundle", confidence: "high", needsJudgment: false, ...finding });
  };

  const phi = ctx.rules.find((r) => r.id === "rd-us-phi");
  if (phi && (dataTypes.includes("phi") || (sectors.includes("healthcare") && ctx.docs.some((d) => d.docType === "BAA"))) && regionsOverlap(regions, ["USA"])) {
    for (const t of ["NDA", "MSA", "BAA"]) {
      const st = statusOf(t);
      add(
        { party: deal.counterparty, document: t, status: st, detail: st === "signed" ? "Signed" : st === "in_review" ? "In this deal, under review" : "Not in the deal" },
        st === "missing"
          ? { key: `bundle:${t.toLowerCase()}:client`, title: `Missing ${t} with ${deal.counterparty}`, impact: `US healthcare work needs NDA + MSA + BAA before any patient data moves (${phi.why})`, severity: "high", owner: deal.owner, resolution: "document", citations: [], missingItem: { item: `${t} with ${deal.counterparty}`, owner: deal.owner } }
          : undefined,
      );
    }
    // Every subcontractor that touches PHI: a flowed-down BAA + the client's prior written consent.
    const parties: { id: string; name: string; owner: string; hasBaa: boolean; why: string; cite?: Citation }[] = subDeals.map((sd) => {
      // The subcontractor's own deal, plus anything filed on this deal under the subcontractor's name.
      const last = norm(sd.counterparty.split(" ").pop() ?? sd.counterparty);
      const sdDocs = [...ctx.allDocs.filter((d) => sd.documentIds.includes(d.id)), ...ctx.docs.filter((d) => norm(d.counterparty).includes(last))];
      return { id: sd.id, name: sd.counterparty, owner: sd.owner, hasBaa: sdDocs.some((d) => d.docType === "BAA"), why: `${sd.counterparty} is an independent contractor on this deal (${sd.name}); ${sdDocs.map((d) => d.docType).join(" + ")} on file, no BAA` };
    });
    if (entity === "Inc") {
      // Delivery model: AtliQ Inc subcontracts delivery to Pvt Ltd (Pune). Is there an intercompany BAA that covers THIS client?
      const icDocs = ctx.allDocs.filter((d) => d.kind === "signed" && d.docType === "BAA" && /intercompany/i.test(d.counterparty));
      const icEntries = ctx.register.filter((e) => icDocs.some((d) => d.id === e.sourceDocId));
      const scoped = icEntries.find((e) => e.scope.counterparties.length > 0);
      const covers = icDocs.length > 0 && (!scoped || scoped.scope.counterparties.some((c) => norm(c).includes(cp)));
      parties.push({
        id: "pvt-ltd",
        name: "AtliQ Technologies Pvt Ltd (Pune delivery)",
        owner: "Pranav",
        hasBaa: covers,
        why: icDocs.length
          ? `The intercompany BAA (${icDocs[0].title}) is limited to ${scoped?.scope.counterparties.join(", ") ?? "another engagement"}; it does not cover ${deal.counterparty}.`
          : "No intercompany BAA on file.",
        cite: scoped ? { docId: scoped.sourceDocId, docTitle: icDocs[0].title, clauseRef: scoped.clauseRef, quote: scoped.quote, role: "register" } : undefined,
      });
    }
    for (const p of parties) {
      const slug = p.id === "pvt-ltd" ? "pvt-ltd" : p.id;
      add(
        { party: p.name, document: "Subcontractor BAA", status: p.hasBaa ? "signed" : "missing", detail: p.hasBaa ? "On file" : p.why, findingKey: p.hasBaa ? undefined : `bundle:sub-baa:${slug}` },
        p.hasBaa
          ? undefined
          : {
              key: `bundle:sub-baa:${slug}`,
              title: `Missing subcontractor BAA: ${p.name}`,
              impact: `${p.why} HIPAA requires a written flow-down BAA before this party touches PHI.`,
              severity: "high",
              owner: p.owner,
              resolution: "document",
              citations: p.cite ? [p.cite] : [],
              missingItem: { item: `Subcontractor BAA: ${p.name}`, owner: p.owner },
            },
      );
      add(
        { party: p.name, document: `${deal.counterparty}'s prior written consent to subcontract`, status: "missing", detail: "No written consent on file", findingKey: `bundle:consent:${slug}` },
        { key: `bundle:consent:${slug}`, title: `No client consent on file to subcontract to ${p.name}`, impact: `The client's prior written approval is required before ${p.name} works on the engagement.`, severity: "medium", owner: deal.owner, resolution: "document", citations: [], missingItem: { item: `${deal.counterparty}'s written consent for ${p.name}`, owner: deal.owner } },
      );
    }
  }

  const eu = ctx.rules.find((r) => r.id === "rd-eu-personal");
  if (eu && dataTypes.includes("personal_data") && regionsOverlap(regions, ["EU"])) {
    const missingDpaAnnex = [...ctx.gates.entries()].flatMap(([, g]) => g).find((g) => g.pass === false && g.rule.startsWith("annex:") && /data processing|dpa|scc|standard contractual/i.test(g.detail));
    const dpaDoc = docsWith((d) => d.docType === "DPA");
    const st: BundleRow["status"] = dpaDoc.some((d) => d.kind === "signed") ? "signed" : dpaDoc.length ? "in_review" : missingDpaAnnex ? "missing" : "missing";
    add(
      { party: deal.counterparty, document: "DPA (GDPR Art. 28) incl. SCCs", status: st, detail: missingDpaAnnex ? `Referenced as ${missingDpaAnnex.label.replace(" attached", "")} but not attached` : st === "missing" ? "Not in the deal" : "On file", findingKey: missingDpaAnnex ? `gate:${missingDpaAnnex.rule}` : st === "missing" ? "bundle:dpa:client" : undefined },
      st === "missing" && !missingDpaAnnex
        ? { key: "bundle:dpa:client", title: `Missing DPA with ${deal.counterparty}`, impact: eu.why, severity: "high", owner: deal.owner, resolution: "document", citations: [], missingItem: { item: `DPA + SCCs with ${deal.counterparty}`, owner: deal.owner } }
        : undefined,
    );
    for (const sd of subDeals) {
      add(
        { party: sd.counterparty, document: "Sub-processor terms (flow-down of the DPA)", status: "missing", detail: `${sd.name}: no data-protection terms on file`, findingKey: `bundle:sub-processor:${sd.id}` },
        { key: `bundle:sub-processor:${sd.id}`, title: `No sub-processor terms for ${sd.counterparty}`, impact: `${sd.counterparty} would process personal data from this client; GDPR needs flowed-down processor terms before any data reaches them.`, severity: "medium", owner: sd.owner, resolution: "document", citations: [], missingItem: { item: `Sub-processor terms with ${sd.counterparty}`, owner: sd.owner } },
      );
    }
  }

  const sub = ctx.rules.find((r) => r.id === "rd-subcontractor");
  if (sub) {
    for (const sd of subDeals) {
      if (rows.some((r) => r.findingKey === `bundle:consent:${sd.id}`)) continue;
      // Generic rule: whether consent is required depends on the client contract, so this is a check,
      // not a missing input. (The flow-down review cites the actual consent clause when there is one.)
      add(
        { party: sd.counterparty, document: `${deal.counterparty}'s consent to subcontract (if the contract requires it)`, status: "missing", detail: `${sd.name} is planned on this deal; no consent on file`, findingKey: `bundle:consent:${sd.id}` },
        { key: `bundle:consent:${sd.id}`, title: `Check consent to subcontract to ${sd.counterparty}`, impact: `${sub.why} Confirm whether ${deal.counterparty}'s contract requires written consent before ${sd.counterparty} starts.`, severity: "low", owner: deal.owner, resolution: "document", citations: [] },
      );
    }
  }
  return { rows, findings, profile };
}

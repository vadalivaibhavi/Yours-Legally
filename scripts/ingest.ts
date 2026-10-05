/**
 * Phase 1a: dataset → data/documents.json, notes.json, deals.json, company.json, tracker.json. No AI.
 * docType / counterparty / entity / side come from a small hand-checked map (Phase 1 spec 1a);
 * real extraction of incoming drafts happens in F2 (Phase 2) and signed facts in 1b.
 */
import "./_env";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { RAW_DIR, writeJson } from "../lib/config";
import { extractReferences } from "../lib/references";
import { Company, Deal, Document, Note, type AtliqEntity, type DocType, type Side } from "../lib/types";

type Meta = { id: string; docType: DocType; title: string; counterparty: string; entity?: AtliqEntity; side: Side; paper: "client" | "atliq"; tracker?: string };

// Hand-checked map (one row per dataset file). "entity" is the AtliQ entity named in the document.
const DOC_MAP: Record<string, Meta> = {
  "2022-07-01_orbit_travels_msa_scanned.md": { id: "orbit-msa", docType: "MSA", title: "Orbit Travels MSA (scanned)", counterparty: "Orbit Travels Pvt Ltd", entity: "Pvt Ltd", side: "supplier", paper: "client", tracker: "C-001" },
  "2024-08-01_crestline_retail_msa.md": { id: "crestline-msa", docType: "MSA", title: "Crestline Retail Professional Services Agreement", counterparty: "Crestline Retail Inc", entity: "Inc", side: "supplier", paper: "client", tracker: "C-002" },
  "2025-01-22_al_noor_mutual_nda.md": { id: "alnoor-nda", docType: "NDA", title: "Al Noor Mutual NDA", counterparty: "Al Noor Hospitality Group", entity: "Pvt Ltd", side: "mutual", paper: "client", tracker: "C-013" },
  "2025-01-22_paytrack_technologies_msa.md": { id: "paytrack-msa", docType: "MSA", title: "PayTrack Technologies MSA", counterparty: "PayTrack Technologies", entity: "Pvt Ltd", side: "supplier", paper: "client", tracker: "C-005" },
  "2025-03-10_acme_retail_group_msa.md": { id: "acme-msa", docType: "MSA", title: "Acme Retail Group MSA", counterparty: "Acme Retail Group", entity: "Pvt Ltd", side: "supplier", paper: "client", tracker: "C-006" },
  "2025-03-15_al_noor_hospitality_msa.md": { id: "alnoor-msa", docType: "MSA", title: "Al Noor Hospitality MSA", counterparty: "Al Noor Hospitality Group", entity: "Pvt Ltd", side: "supplier", paper: "client", tracker: "C-007" },
  "2025-04-18_sunrise_foods_msa.md": { id: "sunrise-msa", docType: "MSA", title: "Sunrise Foods MSA", counterparty: "Sunrise Foods", entity: "Pvt Ltd", side: "supplier", paper: "client", tracker: "C-008" },
  "2025-04-28_rohan_iyer_contractor_agreement.md": { id: "rohan-ica", docType: "ICA", title: "Rohan Iyer contractor agreement", counterparty: "Rohan Iyer", entity: "Pvt Ltd", side: "buyer", paper: "atliq", tracker: "C-039" },
  "2025-06-20_northwind_logistics_msa.md": { id: "northwind-msa", docType: "MSA", title: "Northwind Logistics MSA + SOW-1", counterparty: "Northwind Logistics", entity: "Pvt Ltd", side: "supplier", paper: "client", tracker: "C-009" },
  "2025-09-01_cloudspan_strategic_partnership_agreement.md": { id: "cloudspan-spa", docType: "Partnership", title: "CloudSpan strategic partnership", counterparty: "CloudSpan Technologies", entity: "Pvt Ltd", side: "partner", paper: "client", tracker: "C-032" },
  "2025-10-06_atliq_intercompany_subcontractor_baa.md": { id: "ic-baa", docType: "BAA", title: "Intercompany subcontractor BAA (Inc ↔ Pvt Ltd)", counterparty: "AtliQ Technologies Pvt Ltd (intercompany)", entity: "Inc", side: "buyer", paper: "atliq", tracker: "C-044" },
  "2025-10-06_carebridge_clinics_baa.md": { id: "carebridge-baa", docType: "BAA", title: "CareBridge Clinics BAA", counterparty: "CareBridge Clinics Inc", entity: "Inc", side: "supplier", paper: "client", tracker: "C-043" },
  "2025-11-28_brightwater_insurance_msa.md": { id: "brightwater-msa", docType: "MSA", title: "Brightwater Insurance services agreement", counterparty: "Brightwater Insurance Inc", entity: "Inc", side: "supplier", paper: "client", tracker: "C-014" },
  "2026-02-10_al_noor_waiver_letter.md": { id: "alnoor-waiver", docType: "Waiver", title: "Al Noor waiver letter (Seaside)", counterparty: "Al Noor Hospitality Group", entity: "Pvt Ltd", side: "supplier", paper: "client", tracker: "C-016" },
  "2026-07-16_meridian_healthcare_nda.md": { id: "meridian-nda", docType: "NDA", title: "Meridian Healthcare NDA", counterparty: "Meridian Healthcare", entity: "Pvt Ltd", side: "mutual", paper: "client", tracker: "C-020" },
  "2026-08-15_trustline_nbfc_msa.md": { id: "trustline-msa", docType: "MSA", title: "Trustline NBFC MSA", counterparty: "Trustline NBFC", entity: "Pvt Ltd", side: "supplier", paper: "client", tracker: "C-021" },
  "2026-08-20_harrington_health_mutual_nda.md": { id: "harrington-nda", docType: "NDA", title: "Harrington Health mutual NDA", counterparty: "Harrington Health Systems Inc", entity: "Inc", side: "mutual", paper: "client", tracker: "C-045" },

  "2026-09-10_harrington_health_msa_draft.md": { id: "harrington-msa", docType: "MSA", title: "Harrington Health MSA (draft)", counterparty: "Harrington Health Systems Inc", entity: "Inc", side: "supplier", paper: "client", tracker: "C-023" },
  "2026-09-15_travelhub_services_agreement_draft.md": { id: "travelhub-sa", docType: "MSA", title: "TravelHub software development & services agreement (draft)", counterparty: "TravelHub", entity: "Inc", side: "supplier", paper: "client", tracker: "C-024" },
  "2026-09-16_harrington_health_baa_draft.md": { id: "harrington-baa", docType: "BAA", title: "Harrington Health BAA, Exhibit D (draft)", counterparty: "Harrington Health Systems Inc", entity: "Inc", side: "supplier", paper: "client", tracker: "C-046" },
  "2026-09-18_gulf_crown_hotels_msa_draft.md": { id: "gulfcrown-msa", docType: "MSA", title: "Gulf Crown Hotels & Resorts MSA (draft)", counterparty: "Gulf Crown Hotels & Resorts Co.", entity: "Pvt Ltd", side: "supplier", paper: "client", tracker: "C-025" },
  "2026-09-19_lakeshore_grocers_msa_draft.md": { id: "lakeshore-msa", docType: "MSA", title: "Lakeshore Grocers MSA + SOW-1 + rate card (draft)", counterparty: "Lakeshore Grocers Inc", entity: "Inc", side: "supplier", paper: "client", tracker: "C-026" },
  "2026-09-21_blueorchid_hotels_pilot_agreement_draft.md": { id: "blueorchid-pilot", docType: "MSA", title: "BlueOrchid Hotels pilot services agreement (draft)", counterparty: "BlueOrchid Hotels", entity: "Pvt Ltd", side: "supplier", paper: "client", tracker: "C-027" },
  "2026-09-23_rheinwerk_analytics_services_agreement_draft.md": { id: "rheinwerk-sa", docType: "MSA", title: "Rheinwerk Analytics services agreement (draft)", counterparty: "Rheinwerk Analytics GmbH", entity: "Pvt Ltd", side: "supplier", paper: "client", tracker: "C-028" },
  "2026-09-24_datavane_strategic_partnership_agreement_draft.md": { id: "datavane-spa", docType: "Partnership", title: "Datavane strategic partnership (draft)", counterparty: "Datavane Inc", entity: "Pvt Ltd", side: "partner", paper: "client", tracker: "C-035" },
  "2026-09-24_sunrise_foods_sow2_draft.md": { id: "sunrise-sow2", docType: "SOW", title: "Sunrise Foods SOW-2 (draft, AtliQ template)", counterparty: "Sunrise Foods", entity: "Pvt Ltd", side: "supplier", paper: "atliq", tracker: "C-029" },
  "2026-09-25_finserve_capital_mutual_nda_draft.md": { id: "finserve-nda", docType: "NDA", title: "FinServe Capital \"mutual\" NDA (draft)", counterparty: "FinServe Capital", entity: "Pvt Ltd", side: "mutual", paper: "client", tracker: "C-036" },
  "2026-09-26_kriti_data_labs_subcontractor_agreement_draft.md": { id: "kriti-sub", docType: "Subcontract", title: "Kriti Data Labs subcontractor agreement (AtliQ draft)", counterparty: "Kriti Data Labs", entity: "Pvt Ltd", side: "buyer", paper: "atliq", tracker: "C-037" },
  "2026-09-27_daniel_ortiz_contractor_agreement_draft.md": { id: "ortiz-ica", docType: "ICA", title: "Daniel Ortiz contractor agreement (AtliQ draft)", counterparty: "Daniel Ortiz", entity: "Inc", side: "buyer", paper: "atliq", tracker: "C-047" },
  "2026-09-27_daniel_ortiz_nda_draft.md": { id: "ortiz-nda", docType: "NDA", title: "Daniel Ortiz mutual NDA (AtliQ draft)", counterparty: "Daniel Ortiz", entity: "Inc", side: "mutual", paper: "atliq", tracker: "C-048" },
  "2026-09-27_loopmart_mutual_nda_draft.md": { id: "loopmart-nda", docType: "NDA", title: "LoopMart mutual NDA (draft)", counterparty: "LoopMart", entity: "Pvt Ltd", side: "mutual", paper: "client", tracker: "C-038" },
  "2026-09-27_marcus_reed_contractor_agreement_draft.md": { id: "marcus-ica", docType: "ICA", title: "Marcus Reed contractor agreement (AtliQ draft)", counterparty: "Marcus Reed", entity: "Pvt Ltd", side: "buyer", paper: "atliq", tracker: "C-040" },
};

const REFERENCE_DOCS: Record<string, string> = {
  "karandeep_contract_checklist.md": "Karandeep's contract checklist (2024)",
  "negotiation_notes.md": "Past negotiations (Jay's reconstruction)",
  "atliq_entities.md": "AtliQ legal entities (finance fact sheet)",
};


function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

function main() {
  const documents: Document[] = [];
  for (const [folder, kind] of [["signed_contracts", "signed"], ["incoming", "incoming"]] as const) {
    for (const file of fs.readdirSync(path.join(RAW_DIR, folder)).filter((f) => f.endsWith(".md")).sort()) {
      const meta = DOC_MAP[file];
      if (!meta) throw new Error(`No hand-checked metadata for ${folder}/${file}`);
      const text = fs.readFileSync(path.join(RAW_DIR, folder, file), "utf8").replace(/\r\n/g, "\n");
      const firstLine = text.split("\n")[0] ?? "";
      documents.push(
        Document.parse({
          id: meta.id,
          file: `${folder}/${file}`,
          kind,
          docType: meta.docType,
          title: meta.title,
          counterparty: meta.counterparty,
          date: file.slice(0, 10),
          atliqEntity: meta.entity,
          sideOfTable: meta.side,
          paper: meta.paper,
          text,
          ocr: /scanned/i.test(firstLine),
          trackerId: meta.tracker,
          references: extractReferences(text),
        }),
      );
    }
  }
  for (const [file, title] of Object.entries(REFERENCE_DOCS)) {
    const text = fs.readFileSync(path.join(RAW_DIR, file), "utf8").replace(/\r\n/g, "\n");
    documents.push(
      Document.parse({ id: "ref-" + file.replace(/\.md$/, "").replace(/_/g, "-"), file, kind: "reference", docType: "Other", title, counterparty: "AtliQ (internal)", date: "2026-09-28", sideOfTable: "mutual", paper: "atliq", text, ocr: false, references: [] }),
    );
  }

  // Tracker: one-time import (PRD §7.1). After import the deal record replaces it.
  const tracker = parseCsv(fs.readFileSync(path.join(RAW_DIR, "contract_tracker.csv"), "utf8"));

  const seed = JSON.parse(fs.readFileSync("data/seed/deals.seed.json", "utf8"));
  const NOTE_FILES: Record<string, { title: string }> = {
    "2026-04-14_brightwater_postmortem.md": { title: "Brightwater post-mortem" },
    "2026-09-22_internal_contract_queue.md": { title: "Internal contract queue meeting" },
    "2026-09-25_call_with_counsel_gulf_crown.md": { title: "Call with counsel (Mehta Rao): Gulf Crown / Al Noor" },
    "2026-09-27_harrington_huddle.md": { title: "Harrington huddle" },
  };
  const notes: Note[] = Object.entries(NOTE_FILES).map(([file, { title }]) => {
    const id = "note-" + file.slice(0, 10);
    const dealIds = seed.deals.filter((d: { notes: string[] }) => d.notes.includes(id)).map((d: { id: string }) => d.id);
    return Note.parse({
      id,
      file: "meeting_notes/" + file,
      date: file.slice(0, 10),
      title,
      text: fs.readFileSync(path.join(RAW_DIR, "meeting_notes", file), "utf8").replace(/\r\n/g, "\n"),
      dealIds, // Brightwater post-mortem: no open deal, reference only
    });
  });

  const docIds = new Set(documents.map((d) => d.id));
  const deals: Deal[] = seed.deals.map((s: Record<string, never>) => {
    const t = (s.tracker as string[]).map((id) => tracker.find((r) => r.contract_id === id)).filter(Boolean) as Record<string, string>[];
    for (const id of [...s.documents, ...s.context] as string[]) if (!docIds.has(id)) throw new Error(`deal ${s.id}: unknown document ${id}`);
    return Deal.parse({
      id: s.id,
      name: s.name,
      counterparty: s.counterparty,
      counterpartyAliases: s.aliases,
      owner: s.owner,
      deadline: s.deadline,
      deadlineNote: s.deadlineNote,
      valueUsd: s.valueUsd,
      status: "open",
      documentIds: s.documents,
      contextDocumentIds: s.context,
      noteIds: s.notes,
      linkedDealIds: s.linked,
      endClientDealId: s.endClient,
      trackerIds: s.tracker,
      trackerNotes: t.filter((r) => r.notes).map((r) => `${r.contract_id} (${r.doc_type}): ${r.notes}`),
      clientCountry: s.clientCountry,
    });
  });
  for (const d of deals) for (const id of d.documentIds) documents.find((x) => x.id === id)!.dealId = d.id;

  const company = Company.parse(JSON.parse(fs.readFileSync("data/seed/company.seed.json", "utf8")));

  writeJson("documents.json", z.array(Document).parse(documents));
  writeJson("notes.json", notes);
  writeJson("deals.json", deals);
  writeJson("company.json", company);
  writeJson("tracker.json", tracker);

  const by = (k: string) => documents.filter((d) => d.kind === k).length;
  console.log(`documents: ${documents.length} (signed ${by("signed")}, incoming ${by("incoming")}, reference ${by("reference")}); OCR: ${documents.filter((d) => d.ocr).map((d) => d.id).join(", ")}`);
  console.log(`notes: ${notes.length}; tracker rows: ${tracker.length}`);
  console.log(`deals: ${deals.length}`);
  for (const d of deals) {
    console.log(
      `  ${d.id.padEnd(13)} ${d.owner.padEnd(9)} ${(d.deadline ?? "—").padEnd(10)} docs=[${d.documentIds.join(", ")}]` +
        (d.contextDocumentIds.length ? ` context=[${d.contextDocumentIds.join(", ")}]` : "") +
        (d.linkedDealIds.length ? ` linked=[${d.linkedDealIds.join(", ")}]` : "") +
        (d.noteIds.length ? ` notes=${d.noteIds.length}` : ""),
    );
  }
}

main();

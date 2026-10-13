/**
 * npm run holdout:ingest: the held-out evaluation set (DATA_PROFILE=holdout) from the dataset's SYN_ extension:
 * 10 signed contracts (their commitments join AtliQ's register), 10 incoming drafts and 6 meeting notes that
 * were never used to build, prompt or tune anything. Writes data/holdout/{documents,deals,notes,tracker}.json.
 *  - Incoming drafts are read from the files clients send (test-uploads/formats: Word, PDF, scans → OCR)
 *    through lib/fileText.ts, exactly as an upload would be; the Markdown originals are not used.
 *  - Notes lose the dataset's narrator lines (lib/editorial.ts): they state the answers.
 *  - Deal metadata (owner, value, deadline, country) comes from SYN_contract_tracker_additions.csv and the
 *    drafts' own dates; a note is linked to every deal whose counterparty it names (a mechanical rule).
 *  - The answer key (SYN_README_answer_key.md) is never read here: it only feeds eval/holdout_cases.json.
 * Then: DATA_PROFILE=holdout npm run build:register (only the 10 new contracts call the model; the rest is
 * cached) and npm run holdout:eval.
 */
import "./_env";
import fs from "node:fs";
import path from "node:path";
import { stripNarrator, stripSynHeader } from "../lib/editorial";
import { readContractFile } from "../lib/fileText";
import { extractReferences } from "../lib/references";
import { Deal, Document, Note, type AtliqEntity, type DocType, type Side } from "../lib/types";
import { FORMAT_PLAN, FORMATS_DIR } from "./makeFormatFixtures";

process.env.DATA_PROFILE = "holdout";
const DATASET = "../Dataset";
const OUT = "data/holdout";

type Meta = { id: string; key: string; docType: DocType; title: string; counterparty: string; entity: AtliqEntity; side: Side; paper: "client" | "atliq"; tracker: string };

const SIGNED: Meta[] = [
  { key: "kestrel", id: "syn-kestrel-msa", docType: "MSA", title: "Kestrel Pharma Distribution MSA", counterparty: "Kestrel Pharma Distribution Pvt Ltd", entity: "Pvt Ltd", side: "supplier", paper: "client", tracker: "SYN-101" },
  { key: "meridale", id: "syn-meridale-msa", docType: "MSA", title: "Meridale Retail Brands MSA", counterparty: "Meridale Retail Brands Inc", entity: "Inc", side: "supplier", paper: "client", tracker: "SYN-102" },
  { key: "novaterra", id: "syn-novaterra-msa", docType: "MSA", title: "Novaterra Energy MSA + SOW-1", counterparty: "Novaterra Energy Ltd", entity: "Pvt Ltd", side: "supplier", paper: "client", tracker: "SYN-103" },
  { key: "zephyr", id: "syn-zephyr-spa", docType: "Partnership", title: "Zephyr Cloud Data partnership", counterparty: "Zephyr Cloud Data Pte Ltd", entity: "Pvt Ltd", side: "partner", paper: "client", tracker: "SYN-104" },
  { key: "ashwood", id: "syn-ashwood-baa", docType: "BAA", title: "Ashwood Senior Living BAA", counterparty: "Ashwood Senior Living Inc", entity: "Inc", side: "supplier", paper: "client", tracker: "SYN-106" },
  { key: "falconridge", id: "syn-falconridge-msa", docType: "MSA", title: "Falconridge Logistics MSA", counterparty: "Falconridge Logistics WLL", entity: "Pvt Ltd", side: "supplier", paper: "client", tracker: "SYN-107" },
  { key: "tessellate", id: "syn-tessellate-vsa", docType: "Subcontract", title: "Tessellate Analytics vendor agreement", counterparty: "Tessellate Analytics LLP", entity: "Pvt Ltd", side: "buyer", paper: "atliq", tracker: "SYN-109" },
  { key: "lumen", id: "syn-lumen-msa", docType: "MSA", title: "Lumen Small Finance Bank MSA", counterparty: "Lumen Small Finance Bank Ltd", entity: "Pvt Ltd", side: "supplier", paper: "client", tracker: "SYN-110" },
  { key: "corvina", id: "syn-corvina-msa", docType: "MSA", title: "Corvina Foods MSA + DPA", counterparty: "Corvina Foods GmbH", entity: "Pvt Ltd", side: "supplier", paper: "client", tracker: "SYN-111" },
  { key: "halvorsen", id: "syn-halvorsen-nda", docType: "NDA", title: "Halvorsen Mutual Insurance mutual NDA", counterparty: "Halvorsen Mutual Insurance Co", entity: "Inc", side: "mutual", paper: "client", tracker: "SYN-108" },
];

type DealMeta = Meta & { deal: string; name: string; aliases: string[]; context: string[]; deadline?: string };
const INCOMING: DealMeta[] = [
  { key: "pillarstone", deal: "pillarstone", name: "Pillarstone Pharma Logistics: MSA", id: "syn-pillarstone-msa", docType: "MSA", title: "Pillarstone Pharma Logistics MSA (draft)", counterparty: "Pillarstone Pharma Logistics Pvt Ltd", aliases: ["Pillarstone"], entity: "Pvt Ltd", side: "supplier", paper: "client", tracker: "SYN-112", context: [], deadline: "2026-10-09" },
  { key: "cobalt", deal: "cobalt", name: "Cobalt Outfitters: MSA + rate card", id: "syn-cobalt-msa", docType: "MSA", title: "Cobalt Outfitters MSA + rate card (draft)", counterparty: "Cobalt Outfitters Inc", aliases: ["Cobalt"], entity: "Inc", side: "supplier", paper: "client", tracker: "SYN-113", context: [], deadline: "2026-10-02" },
  { key: "aldergrove", deal: "aldergrove", name: "Aldergrove Water Services: MSA + SOW-1", id: "syn-aldergrove-msa", docType: "MSA", title: "Aldergrove Water Services MSA + SOW-1 (draft)", counterparty: "Aldergrove Water Services plc", aliases: ["Aldergrove"], entity: "Pvt Ltd", side: "supplier", paper: "client", tracker: "SYN-114", context: [], deadline: "2026-10-14" },
  { key: "quanta", deal: "quanta", name: "Quanta Lake: implementation partner agreement", id: "syn-quanta-spa", docType: "Partnership", title: "Quanta Lake implementation partner agreement (draft)", counterparty: "Quanta Lake Data Inc", aliases: ["Quanta Lake", "Quanta"], entity: "Inc", side: "partner", paper: "client", tracker: "SYN-115", context: [], deadline: "2026-10-12" },
  { key: "ashwood", deal: "ashwood", name: "Ashwood Senior Living: SOW-3", id: "syn-ashwood-sow3", docType: "SOW", title: "Ashwood Senior Living SOW-3 (draft, AtliQ template)", counterparty: "Ashwood Senior Living Inc", aliases: ["Ashwood"], entity: "Inc", side: "supplier", paper: "atliq", tracker: "SYN-116", context: ["syn-ashwood-baa"], deadline: "2026-09-30" },
  { key: "cargoline", deal: "cargoline", name: "Cargoline Shipping: MSA", id: "syn-cargoline-msa", docType: "MSA", title: "Cargoline Shipping MSA (draft)", counterparty: "Cargoline Shipping WLL", aliases: ["Cargoline"], entity: "Inc", side: "supplier", paper: "client", tracker: "SYN-117", context: [] },
  { key: "monsoon", deal: "monsoon", name: "Monsoon Data Studio: vendor agreement", id: "syn-monsoon-vsa", docType: "Subcontract", title: "Monsoon Data Studio vendor agreement (AtliQ draft)", counterparty: "Monsoon Data Studio", aliases: ["Monsoon"], entity: "Pvt Ltd", side: "buyer", paper: "atliq", tracker: "SYN-118", context: [], deadline: "2026-10-05" },
  { key: "indus", deal: "indus", name: "Indus Valley Co-operative Bank: services agreement", id: "syn-indus-sa", docType: "MSA", title: "Indus Valley Co-operative Bank services agreement (draft)", counterparty: "Indus Valley Co-operative Bank Ltd", aliases: ["Indus Valley", "Indus Valley Bank"], entity: "Pvt Ltd", side: "supplier", paper: "client", tracker: "SYN-119", context: [], deadline: "2026-10-06" },
  { key: "corvina", deal: "corvina", name: "Corvina Foods: SOW-2 + sub-processor notice", id: "syn-corvina-sow2", docType: "SOW", title: "Corvina Foods SOW-2 + sub-processor notice (AtliQ draft)", counterparty: "Corvina Foods GmbH", aliases: ["Corvina"], entity: "Pvt Ltd", side: "supplier", paper: "atliq", tracker: "SYN-120", context: ["syn-corvina-msa"], deadline: "2026-10-12" },
  { key: "greystone", deal: "greystone", name: "Greystone Claims Solutions: MSA", id: "syn-greystone-msa", docType: "MSA", title: "Greystone Claims Solutions MSA (draft)", counterparty: "Greystone Claims Solutions Inc", aliases: ["Greystone"], entity: "Inc", side: "supplier", paper: "client", tracker: "SYN-121", context: [] },
];

const find = (dir: string, key: string) => {
  const f = fs.readdirSync(path.join(DATASET, dir)).find((x) => x.startsWith("SYN_") && x.includes(key));
  if (!f) throw new Error(`no SYN_ file for ${key} in ${dir}`);
  return f;
};

function parseCsv(text: string): Record<string, string>[] {
  const rows = text.replace(/\r\n/g, "\n").trim().split("\n").map((line) => {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) c === '"' ? (line[i + 1] === '"' ? ((cur += '"'), i++) : (q = false)) : (cur += c);
      else if (c === '"') q = true;
      else if (c === ",") (out.push(cur), (cur = ""));
      else cur += c;
    }
    out.push(cur);
    return out;
  });
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

async function main() {
  const base = JSON.parse(fs.readFileSync("data/documents.json", "utf8")) as Document[];
  const baseNotes = JSON.parse(fs.readFileSync("data/notes.json", "utf8")) as Note[];
  const baseTracker = JSON.parse(fs.readFileSync("data/tracker.json", "utf8")) as Record<string, string>[];
  const tracker = parseCsv(fs.readFileSync(path.join(DATASET, "SYN_contract_tracker_additions.csv"), "utf8"));
  const row = (id: string) => tracker.find((r) => r.contract_id === id)!;

  const docs: Document[] = [];
  for (const m of SIGNED) {
    const file = find("signed_contracts", m.key);
    const text = stripSynHeader(fs.readFileSync(path.join(DATASET, "signed_contracts", file), "utf8").replace(/\r\n/g, "\n"));
    docs.push(Document.parse({ id: m.id, file: `signed_contracts/${file}`, kind: "signed", docType: m.docType, title: m.title, counterparty: m.counterparty, date: file.slice(4, 14), atliqEntity: m.entity, sideOfTable: m.side, paper: m.paper, text, ocr: /scan|OCR/i.test(text.split("\n")[0]), trackerId: m.tracker, references: extractReferences(text) }));
  }
  for (const m of INCOMING) {
    const plan = FORMAT_PLAN[m.key];
    const file = path.join(FORMATS_DIR, plan === "scan" ? `${m.key}.scan.pdf` : `${m.key}.${plan.startsWith("docx") ? "docx" : "pdf"}`);
    const r = await readContractFile(path.basename(file), new Uint8Array(fs.readFileSync(file)));
    console.log(`  ${m.id}: ${path.basename(file)} → ${r.format}${r.ocr ? " (OCR)" : ""}, ${r.text.length} chars`);
    docs.push(Document.parse({ id: m.id, file: file.replace(/\\/g, "/"), kind: "incoming", docType: m.docType, title: m.title, counterparty: m.counterparty, date: row(m.tracker).received_date, atliqEntity: m.entity, sideOfTable: m.side, paper: m.paper, text: r.text, ocr: r.ocr, trackerId: m.tracker, references: extractReferences(r.text), dealId: m.deal }));
  }

  const notes: Note[] = [];
  let stripped = 0;
  for (const file of fs.readdirSync(path.join(DATASET, "meeting_notes")).filter((f) => f.startsWith("SYN_")).sort()) {
    const { text, removed } = stripNarrator(fs.readFileSync(path.join(DATASET, "meeting_notes", file), "utf8"));
    stripped += removed.length;
    const dealIds = INCOMING.filter((m) => [m.counterparty.split(" ")[0], ...m.aliases].some((a) => text.includes(a))).map((m) => m.deal);
    const title = text.match(/^#\s+(.+)$/m)?.[1]?.replace(/\*+/g, "").trim() ?? file;
    notes.push(Note.parse({ id: `note-${file.slice(4, 14)}-${file.split("_").slice(2).join("_").replace(/\.md$/, "").slice(0, 24)}`, file: `meeting_notes/${file}`, date: file.slice(4, 14), title, text, dealIds }));
  }

  const deals: Deal[] = INCOMING.map((m) => {
    const t = row(m.tracker);
    return Deal.parse({
      id: m.deal,
      name: m.name,
      counterparty: m.counterparty,
      counterpartyAliases: m.aliases,
      owner: t.requested_by,
      deadline: m.deadline,
      deadlineNote: t.notes,
      valueUsd: t.value_usd ? Number(t.value_usd) : undefined,
      status: "open",
      documentIds: [m.id],
      contextDocumentIds: m.context,
      noteIds: notes.filter((n) => n.dealIds.includes(m.deal)).map((n) => n.id),
      linkedDealIds: [],
      trackerIds: [m.tracker],
      trackerNotes: t.notes ? [`${m.tracker} (${t.doc_type}): ${t.notes}`] : [],
      clientCountry: t.client_country,
    });
  });

  fs.mkdirSync(OUT, { recursive: true });
  const write = (f: string, v: unknown) => fs.writeFileSync(path.join(OUT, f), JSON.stringify(v, null, 2) + "\n");
  write("documents.json", [...base, ...docs]);
  write("notes.json", [...baseNotes, ...notes]);
  write("deals.json", deals);
  write("tracker.json", [...baseTracker, ...tracker]);
  console.log(`held-out: ${docs.length} documents (${SIGNED.length} signed, ${INCOMING.length} incoming), ${notes.length} notes (${stripped} narrator lines removed), ${deals.length} deals`);
  for (const d of deals) console.log(`  ${d.id.padEnd(12)} ${d.owner.padEnd(8)} ${(d.deadline ?? "—").padEnd(10)} $${d.valueUsd ?? "—"} notes=${d.noteIds.length}${d.contextDocumentIds.length ? ` context=${d.contextDocumentIds.join(",")}` : ""}`);
}

main();

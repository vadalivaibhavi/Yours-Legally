/**
 * npm run check:upload-detect: the upload detector (lib/uploadDetect.ts) against the dataset, no model calls.
 *  - notes vs contract: every meeting note must read as notes, every contract as a contract;
 *  - version vs additional: known pairs (a revised NDA, re-uploads) vs related-but-different documents.
 */
import fs from "node:fs";
import path from "node:path";
import { belongsElsewhere, findPriorVersion, guessDocType, looksLikeNotes, looksLikeTemplate } from "../lib/uploadDetect";
import type { Document } from "../lib/types";

const all = JSON.parse(fs.readFileSync("data/documents.json", "utf8")) as Document[];
const by = (id: string) => all.find((d) => d.id === id)!;
const file = (p: string) => fs.readFileSync(p, "utf8");
let failed = 0;

// Notes vs contract (reference documents such as the checklist count as notes; the entity fact sheet is a known miss).
const notesDir = "../Dataset/meeting_notes";
const notesCases: [string, string, boolean][] = [
  ...(fs.existsSync(notesDir) ? fs.readdirSync(notesDir).map((f) => [f, file(path.join(notesDir, f)), true] as [string, string, boolean]) : []),
  ...all.filter((d) => d.id !== "ref-atliq-entities").map((d) => [d.id, d.text, d.kind === "reference"] as [string, string, boolean]),
  ...["data/synthetic/harrington_ortiz_sub_baa.md", "data/synthetic/rheinwerk_annex3_dpa.md", "test-uploads/FinServe_NDA_v2_mutual.md"].map((p) => [p, file(p), false] as [string, string, boolean]),
];
const wrongNotes = notesCases.filter(([, text, notes]) => looksLikeNotes(text).notes !== notes);
console.log(`notes vs contract: ${notesCases.length - wrongNotes.length}/${notesCases.length}${wrongNotes.length ? ` · wrong: ${wrongNotes.map(([n]) => n).join(", ")}` : ""}`);
failed += wrongNotes.length;

// Document type from the title: a wrong guess would hide a real version, so none may be wrong (unknown is fine).
const contracts = all.filter((d) => d.kind !== "reference");
const wrongType = contracts.filter((d) => { const g = guessDocType(d.text); return g && g !== d.docType; });
console.log(`document type from title: ${wrongType.length} wrong of ${contracts.length}${wrongType.length ? ` · ${wrongType.map((d) => `${d.id} → ${guessDocType(d.text)}`).join(", ")}` : ""}`);
failed += wrongType.length;

// Version vs additional.
const versionCases: [string, string, string[], string | null][] = [
  ["FinServe revised NDA", file("test-uploads/FinServe_NDA_v2_mutual.md"), ["finserve-nda"], "finserve-nda"],
  ["Harrington MSA re-uploaded", by("harrington-msa").text, ["harrington-msa", "harrington-baa"], "harrington-msa"],
  ["Harrington BAA re-uploaded", by("harrington-baa").text, ["harrington-msa", "harrington-baa"], "harrington-baa"],
  ["Rheinwerk Annex 3 (DPA) next to the agreement", file("data/synthetic/rheinwerk_annex3_dpa.md"), ["rheinwerk-sa"], null],
  ["Ortiz sub-BAA in Harrington (cites the same contract no.)", file("data/synthetic/harrington_ortiz_sub_baa.md"), ["harrington-msa", "harrington-baa"], null],
  ["Sunrise SOW-2 next to its MSA", by("sunrise-sow2").text, ["sunrise-msa"], null],
  ["Al Noor NDA in a deal holding Harrington's NDA", by("alnoor-nda").text, ["harrington-nda"], null],
];
for (const [name, text, ids, expect] of versionCases) {
  const got = findPriorVersion({ text, docType: guessDocType(text) }, ids.map(by));
  const ok = (got?.doc.id ?? null) === expect;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${got ? `new version of ${got.doc.id} (${got.why})` : "additional document"}`);
}
// Uploaded into the wrong deal? (linked deals are exempt; naming this deal's client clears it)
const deals = JSON.parse(fs.readFileSync("data/deals.json", "utf8")) as { id: string; name: string; counterparty: string; counterpartyAliases: string[]; documentIds: string[]; linkedDealIds: string[] }[];
const sketch = (id: string) => {
  const d = deals.find((x) => x.id === id)!;
  return { id: d.id, name: d.name, names: [d.counterparty, ...d.counterpartyAliases], docs: d.documentIds.map(by).filter(Boolean), linked: d.linkedDealIds };
};
const sketches = deals.map((d) => sketch(d.id));
const note = (f: string) => file(path.join(notesDir, f));
const elsewhereCases: [string, string, string, string | null][] = [
  ["Gulf Crown MSA uploaded into Harrington", by("gulfcrown-msa").text, "harrington", "gulfcrown"],
  ["Lakeshore MSA uploaded into BlueOrchid", by("lakeshore-msa").text, "blueorchid", "lakeshore"],
  ["Marcus's contractor agreement uploaded into Ortiz (same AtliQ template)", by("marcus-ica").text, "ortiz", "marcus"],
  ["Gulf Crown counsel-call notes uploaded into Harrington", note("2026-09-25_call_with_counsel_gulf_crown.md"), "harrington", "gulfcrown"],
  ["Harrington huddle notes into Harrington", note("2026-09-27_harrington_huddle.md"), "harrington", null],
  ["Ortiz contractor agreement into Harrington (linked deal)", by("ortiz-ica").text, "harrington", null],
  ["Rheinwerk Annex 3 into Kriti (linked deal)", file("data/synthetic/rheinwerk_annex3_dpa.md"), "kriti", null],
  ["FinServe revised NDA into FinServe", file("test-uploads/FinServe_NDA_v2_mutual.md"), "finserve", null],
];
for (const [name, text, into, expect] of elsewhereCases) {
  const got = belongsElsewhere(text, sketch(into), sketches);
  const ok = (got?.dealId ?? null) === expect;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${got ? `belongs to ${got.dealId}? (${got.why})` : "fine here"}`);
}
// Blank templates: never reviewed. No real document may be flagged (drafts have "____" blanks too).
const realDocs: [string, string][] = [
  ...all.map((d): [string, string] => [d.id, d.text]),
  ...["data/synthetic/harrington_ortiz_sub_baa.md", "data/synthetic/rheinwerk_annex3_dpa.md", "test-uploads/FinServe_NDA_v2_mutual.md"].map((p): [string, string] => [p, file(p)]),
];
const falseTemplates = realDocs.filter(([, t]) => looksLikeTemplate(t).template).map(([n]) => n);
console.log(`real documents taken for templates: ${falseTemplates.length}${falseTemplates.length ? ` · ${falseTemplates.join(", ")}` : ""}`);
failed += falseTemplates.length;
const templateCases: [string, string][] = [
  ["Blank mutual NDA template (test-uploads)", file("test-uploads/Blank_Mutual_NDA_template.md")],
  ["Blank MSA with an empty party and {{fee}} fields", `# MASTER SERVICES AGREEMENT\n\nThis Agreement is made between ______________ (the "Client") and AtliQ Technologies Private Limited (the "Supplier").\n\n1. Services. The Supplier shall provide the services in the SOW.\n2. Fees. The Client shall pay {{fee}} within {{days}} days.\n3. Term. This Agreement runs for one year.\n`],
];
for (const [name, text] of templateCases) {
  const got = looksLikeTemplate(text);
  if (!got.template) failed++;
  console.log(`${got.template ? "ok  " : "FAIL"} ${name}: ${got.template ? `template (${got.why})` : "not flagged"}`);
}
console.log(failed ? `\n${failed} wrong` : "\nall correct");
process.exitCode = failed ? 1 : 0;

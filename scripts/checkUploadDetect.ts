/**
 * npm run check:upload-detect: the upload detector (lib/uploadDetect.ts) against the dataset, no model calls.
 *  - notes vs contract: every meeting note must read as notes, every contract as a contract;
 *  - version vs additional: known pairs (a revised NDA, re-uploads) vs related-but-different documents.
 */
import fs from "node:fs";
import path from "node:path";
import { findPriorVersion, guessDocType, looksLikeNotes } from "../lib/uploadDetect";
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
console.log(failed ? `\n${failed} wrong` : "\nall correct");
process.exitCode = failed ? 1 : 0;

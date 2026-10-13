/**
 * npm run check:file-read: every held-out draft, saved by Word as .docx / .pdf or scanned to an image-only
 * PDF (test-uploads/formats, from npm run fixtures:formats), is read back with lib/fileText.ts and compared
 * with its source text:
 *  - words: the share of the source's words read back in order (2·LCS / total; 1 = identical);
 *  - clauses: every numbered section of the source ("## 7. …") comes back as a section, so citations keep
 *    their clause numbers.
 * Text formats must be near-exact; scans go through the model (Gemini, one fast call each, cached) and get a
 * slightly lower bar for OCR noise. Exit code 1 if any file misses its bar.
 */
import "./_env";
import fs from "node:fs";
import path from "node:path";
import { splitSections } from "../lib/chunker";
import { readContractFile, UnreadableFile } from "../lib/fileText";
import { isQuotaExhausted, provider } from "../lib/llm";
import { FORMAT_PLAN, FORMATS_DIR, holdoutSource } from "./makeFormatFixtures";

export type FileReadResult = { key: string; format: string; words: number; clauses: string; missing: string[]; ok: boolean | null; note?: string };

const words = (t: string) =>
  t
    .replace(/^\*\(SYNTHETIC DATA[^\n]*\n/m, "")
    .replace(/[*`_]/g, "") // emphasis markers vanish without leaving a gap ("**LIMITED**," → "LIMITED,")
    .replace(/[#|>]/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–]/g, "-")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w && !/^-+$/.test(w));

/** 2·LCS / (|a| + |b|) over words. */
export function similarity(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 1;
  let prev = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Uint16Array(b.length + 1);
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    prev = cur;
  }
  return (2 * prev[b.length]) / (a.length + b.length);
}

const sectionNos = (t: string) => splitSections(t).filter((s) => s.no).map((s) => s.no);

export async function checkFileRead(): Promise<FileReadResult[]> {
  const out: FileReadResult[] = [];
  for (const [key, plan] of Object.entries(FORMAT_PLAN)) {
    const file = path.join(FORMATS_DIR, plan === "scan" ? `${key}.scan.pdf` : `${key}.${plan.startsWith("docx") ? "docx" : "pdf"}`);
    const format = plan === "scan" ? "scanned PDF" : plan === "docx-autonum" ? "Word, auto-numbered" : plan === "docx" ? "Word" : "PDF";
    if (!fs.existsSync(file)) {
      out.push({ key, format, words: 0, clauses: "–", missing: [], ok: false, note: `missing ${file}: run npm run fixtures:formats` });
      continue;
    }
    const src = fs.readFileSync(holdoutSource(key), "utf8");
    try {
      const r = await readContractFile(path.basename(file), new Uint8Array(fs.readFileSync(file)));
      const sim = similarity(words(src), words(r.text));
      const want = sectionNos(src);
      const got = new Set(sectionNos(r.text));
      const missing = want.filter((n) => !got.has(n));
      const bar = r.ocr ? 0.95 : 0.98;
      out.push({ key, format: `${format}${r.ocr ? " (OCR)" : ""}`, words: sim, clauses: `${want.length - missing.length}/${want.length}`, missing, ok: sim >= bar && missing.length === 0, note: r.note });
    } catch (e) {
      if (isQuotaExhausted(e)) out.push({ key, format, words: 0, clauses: "–", missing: [], ok: null, note: "not run (quota)" });
      else if (e instanceof UnreadableFile || plan === "scan") out.push({ key, format, words: 0, clauses: "–", missing: [], ok: plan === "scan" && provider() !== "gemini" ? null : false, note: (e as Error).message });
      else throw e;
    }
  }
  return out;
}

if (process.argv[1]?.endsWith("checkFileRead.ts")) {
  checkFileRead().then((rs) => {
    for (const r of rs) console.log(`${r.ok === null ? "SKIP" : r.ok ? "ok  " : "FAIL"} ${r.key.padEnd(12)} ${r.format.padEnd(24)} words ${(r.words * 100).toFixed(1)}% · clauses ${r.clauses}${r.missing.length ? ` (missing ${r.missing.join(", ")})` : ""}${r.note ? ` · ${r.note}` : ""}`);
    const bad = rs.filter((r) => r.ok === false).length;
    console.log(bad ? `\n${bad} file(s) below their bar` : "\nall files read back");
    process.exitCode = bad ? 1 : 0;
  });
}

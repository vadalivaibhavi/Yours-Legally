/**
 * Uploaded files → contract text the review can quote (FR-1 intake). No layout guessing beyond what the
 * clause chunker needs: numbered clause headings become "## N. Heading" so citations keep their clause refs.
 *  - .md / .txt: as they are.
 *  - .docx: mammoth's HTML, walked here so Word's automatic numbering (lost in plain text) is written back
 *    as "1.", "1.1" …
 *  - .pdf with a text layer: unpdf (pdf.js), lines rebuilt from positions, paragraphs from line gaps.
 *  - .pdf without one (a scan): the model reads the file itself (Gemini) and transcribes it; the document
 *    is marked OCR, so the review reads through OCR noise and quotes are checked against the transcription.
 *  - .doc (old Word) and anything else: refused with what to do instead.
 */
import mammoth from "mammoth";
import { z } from "zod";
import { callModel, type FilePart } from "./llm";

export type FileFormat = "text" | "docx" | "pdf";
export type ReadFile = { text: string; format: FileFormat; ocr: boolean; pages?: number; note?: string };

export class UnreadableFile extends Error {}

/** A PDF page with less text than this (on average) is treated as a scan. */
const SCAN_CHARS_PER_PAGE = 200;

export async function readContractFile(name: string, bytes: Uint8Array): Promise<ReadFile> {
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (["md", "txt", "markdown"].includes(ext)) return { text: new TextDecoder().decode(bytes), format: "text", ocr: false };
  if (ext === "docx") return { text: await docxText(bytes), format: "docx", ocr: false };
  if (ext === "pdf") return pdfText(bytes);
  if (ext === "doc") throw new UnreadableFile("Old Word (.doc) files can't be read: save it as .docx or PDF and upload that.");
  throw new UnreadableFile("Upload a PDF, a Word (.docx) file, or text (.md / .txt).");
}

// ---------------------------------------------------------------- Word

async function docxText(bytes: Uint8Array): Promise<string> {
  let html: string;
  try {
    html = (await mammoth.convertToHtml({ buffer: Buffer.from(bytes) })).value;
  } catch {
    throw new UnreadableFile("That Word file couldn't be opened (damaged or password-protected?).");
  }
  return toContractMarkdown(htmlToBlocks(html));
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
const decode = (s: string) => s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITIES[e.toLowerCase()] ?? m)));

/** mammoth's HTML (p, h1–h6, ol/ul/li, table/tr/td, strong/em/a/br) → text blocks, list numbers written out. */
export function htmlToBlocks(html: string): string[] {
  const blocks: string[] = [];
  const lists: { ordered: boolean; n: number }[] = [];
  let buf = "";
  let prefix = "";
  let row: string[] | null = null;
  const flush = () => {
    const t = decode(buf).replace(/[ \t]+/g, " ").trim();
    if (row) row.push(t);
    else if (t) blocks.push(prefix + t);
    buf = "";
    prefix = "";
  };
  for (const tok of html.split(/(<[^>]+>)/)) {
    const m = tok.match(/^<(\/?)([a-z0-9]+)[^>]*>$/i);
    if (!m) {
      buf += tok;
      continue;
    }
    const [, close, tag0] = m;
    const tag = tag0.toLowerCase();
    if (tag === "br") buf += " ";
    else if (/^h[1-6]$/.test(tag)) {
      if (close) flush();
      else {
        flush();
        prefix = "#".repeat(Math.min(Number(tag[1]) + 1, 6)) + " ";
      }
    } else if (tag === "p" || tag === "td" || tag === "th") {
      if (close) flush();
      else if (!row) flush();
    } else if (tag === "ol" || tag === "ul") {
      if (close) lists.pop();
      else {
        flush();
        lists.push({ ordered: tag === "ol", n: 0 });
      }
    } else if (tag === "li") {
      if (close) flush();
      else {
        flush();
        const top = lists[lists.length - 1];
        if (top) top.n++;
        // Nested numbered lists read as clause numbers: 7 → 7.1 → 7.1.1.
        const ordered = lists.every((l) => l.ordered);
        prefix = ordered && lists.length ? `${lists.map((l) => l.n).join(".")}${lists.length === 1 ? "." : ""} ` : "- ";
      }
    } else if (tag === "tr") {
      if (close) {
        flush();
        const cells = (row ?? []).filter(Boolean);
        if (cells.length) blocks.push(cells.join(" | "));
        row = null;
      } else {
        flush();
        row = [];
      }
    }
  }
  flush();
  return blocks;
}

// ---------------------------------------------------------------- PDF

type Item = { str: string; x: number; y: number; h: number; eol: boolean };

async function pdfText(bytes: Uint8Array): Promise<ReadFile> {
  const { getDocumentProxy } = await import("unpdf");
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes));
  } catch (e) {
    if (/password/i.test(String(e))) throw new UnreadableFile("That PDF is password-protected: remove the password and upload it again.");
    throw new UnreadableFile("That PDF couldn't be opened (damaged?).");
  }
  const pages: string[][] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const items: Item[] = (tc.items as { str?: string; transform?: number[]; height?: number; hasEOL?: boolean }[])
      .filter((it) => typeof it.str === "string" && it.transform)
      .map((it) => ({ str: it.str!, x: it.transform![4], y: it.transform![5], h: it.height || Math.abs(it.transform![3]) || 10, eol: !!it.hasEOL }));
    pages.push(pageBlocks(items));
  }
  const chars = pages.flat().join("").replace(/\s/g, "").length;
  if (pdf.numPages && chars / pdf.numPages >= SCAN_CHARS_PER_PAGE) {
    return { text: toContractMarkdown(dropRunningLines(pages)), format: "pdf", ocr: false, pages: pdf.numPages };
  }
  return { ...(await ocrPdf(bytes)), pages: pdf.numPages };
}

/** One page's text items → paragraphs: items on the same baseline form a line; a larger gap starts a paragraph. */
function pageBlocks(items: Item[]): string[] {
  const lines: { y: number; h: number; text: string; x: number }[] = [];
  for (const it of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    if (!it.str.trim() && !lines.length) continue;
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) < Math.max(2, it.h * 0.4)) last.text += (/\s$/.test(last.text) || /^\s/.test(it.str) ? "" : needsSpace(last.text, it.str) ? " " : "") + it.str;
    else lines.push({ y: it.y, h: it.h, text: it.str, x: it.x });
  }
  const clean = lines.map((l) => ({ ...l, text: l.text.replace(/\s+/g, " ").trim() })).filter((l) => l.text);
  const gaps = clean.slice(1).map((l, i) => clean[i].y - l.y).filter((g) => g > 0).sort((a, b) => a - b);
  // Line spacing: the median gap, but never more than 1.25 × the font size (a page of short paragraphs has
  // mostly paragraph gaps, which would otherwise read as the line spacing and merge everything).
  const fontH = [...clean.map((l) => l.h)].sort((a, b) => a - b)[Math.floor(clean.length / 2)] || 12;
  const typical = Math.min(gaps.length ? gaps[Math.floor(gaps.length / 2)] : 14, fontH * 1.25);
  const blocks: string[] = [];
  let cur = "";
  clean.forEach((l, i) => {
    const gap = i ? clean[i - 1].y - l.y : 0;
    const prev = i ? clean[i - 1].text : "";
    const isHeading = (t: string) => t.length <= 90 && !/[.;:,]$/.test(t) && (HEADING.test(t) || ATTACHMENT.test(t) || !!titleHeading(t));
    // A new clause number starts a block only after a finished sentence or a heading ("1600 West End Avenue" after "Inc.," does not).
    const numbered = /^(\d{1,2}(\.\d{1,2})*\.?|\([a-z0-9]{1,4}\)|[-•])\s/.test(l.text) && (/[.;:]$/.test(prev) || isHeading(prev));
    const startsNew = i === 0 || gap > typical * 1.35 || isHeading(l.text) || isHeading(prev) || numbered;
    if (startsNew && cur) {
      blocks.push(cur);
      cur = "";
    }
    cur = cur ? joinLine(cur, l.text) : l.text;
  });
  if (cur) blocks.push(cur);
  return blocks;
}

const needsSpace = (a: string, b: string) => /[\w,.;:)\]]$/.test(a) && /^[\w(“"'$£€]/.test(b);
/** Join two lines of one paragraph; a line ending in a hyphen joins without a space. */
const joinLine = (a: string, b: string) => (/[a-z]-$/.test(a) ? a + b : `${a} ${b}`); // keep the hyphen: "data-" + "quality" is a compound, and quotes must match

/** Headers/footers repeated on most pages ("Page 3 of 9", "Confidential", the document title) are dropped. */
function dropRunningLines(pages: string[][]): string[] {
  if (pages.length < 3) return pages.flat().filter((b) => !/^Page \d+( of \d+)?$/i.test(b));
  const norm = (s: string) => s.replace(/\d+/g, "#").toLowerCase();
  const count = new Map<string, number>();
  for (const p of pages) for (const b of new Set([...p.slice(0, 2), ...p.slice(-2)].map(norm))) count.set(b, (count.get(b) ?? 0) + 1);
  const running = new Set([...count].filter(([b, n]) => n >= Math.ceil(pages.length * 0.6) && b.length < 120).map(([b]) => b));
  return pages.flatMap((p) => p.filter((b) => !running.has(norm(b))));
}

const OcrResult = z.object({
  text: z.string().describe("The full document text, transcribed exactly, in reading order, as Markdown."),
  illegible: z.array(z.string()).describe("Places that could not be read, e.g. 'clause 9.1, second sentence smudged'."),
});

const OCR_SYSTEM = `You transcribe scanned contracts for a contract-review tool. Transcribe the document EXACTLY as printed: every word, number, date and amount in reading order. Never summarise, correct, translate or complete text. Write clause headings as Markdown headings "## <number>. <HEADING>" and keep clause numbers (7.1, (a)) at the start of their paragraphs. Leave out page numbers and running headers/footers. Where text can't be read, write [illegible] in its place and list it under illegible. Signatures and stamps: write [signature] or [stamp].`;

async function ocrPdf(bytes: Uint8Array): Promise<Omit<ReadFile, "pages">> {
  const file: FilePart = { mimeType: "application/pdf", base64: Buffer.from(bytes).toString("base64") };
  const r = await callModel({ task: "ocr", system: OCR_SYSTEM, input: "Transcribe this scanned contract.", schema: OcrResult, file });
  if (!r.ok) throw new UnreadableFile(`That PDF is a scan (no text layer) and couldn't be read: ${r.message}. Upload a text PDF or a Word file instead.`);
  const text = r.data.text.trim();
  if (text.replace(/\s/g, "").length < 200) throw new UnreadableFile("That PDF is a scan and almost nothing in it could be read. Upload a clearer copy or a Word file.");
  return { text, format: "pdf", ocr: true, note: r.data.illegible.length ? `Read by OCR; not readable: ${r.data.illegible.join("; ")}` : "Read by OCR" };
}

// ---------------------------------------------------------------- shared

/** A numbered clause heading on its own line: "7. LIMITATION OF LIABILITY", "ARTICLE 7 — FEES", "Section 7 Fees". */
const HEADING = /^(?:(\d{1,2})\.?\s+([A-Z][A-Z0-9 ,;&'()/\-–—]{2,80})|(?:ARTICLE|Article)\s+(\d{1,2})\s*[.:—–-]?\s*(.{2,80})|(?:Section|SECTION|§)\s*(\d{1,2})\.?\s+([A-Z].{2,80}))$/;
/** "SCHEDULE 2 — MILESTONES", "Annex 3", "EXHIBIT A: RATE CARD": an attachment heading (the annex check looks for it). */
const ATTACHMENT = /^(?:SCHEDULE|Schedule|ANNEX|Annex|ANNEXURE|Annexure|EXHIBIT|Exhibit|APPENDIX|Appendix|ATTACHMENT|Attachment)\s+[A-Z0-9]{1,4}\b(?:\s*[—–:.-]\s*.{1,80})?$/;
/** "7. Fees. The Client shall pay …": an inline heading in Title Case followed by the clause text. */
const INLINE_HEADING = /^(\d{1,2})\.\s+([A-Z][A-Za-z'’&/,\- ]{1,60}?)\.\s+(\S.*)$/;

/** Text blocks → Markdown the chunker splits into numbered sections ("## N. Heading"). */
export function toContractMarkdown(blocks: string[]): string {
  const out: string[] = [];
  let titled = false;
  for (const [idx, raw] of blocks.entries()) {
    const b = raw.trim();
    if (!b) continue;
    if (/^#{1,6} /.test(b)) {
      // Word headings: numbered ones become clause sections, the first unnumbered one the title.
      const inner = b.replace(/^#+\s+/, "");
      const h = inner.match(HEADING) ?? titleHeading(inner);
      const lost = blocks[idx + 1]?.trim().match(/^(\d{1,2})\.\d{1,2}\.?\s/); // automatic numbering dropped: "1.1 …" follows
      if (h) out.push(headingLine(h));
      else if (titled && lost) out.push(`## ${lost[1]}. ${inner}`);
      else if (!titled) out.push(`# ${inner}`);
      else out.push(`## ${inner}`);
      titled = true;
      continue;
    }
    if (b.length <= 100 && ATTACHMENT.test(b)) {
      out.push(`## ${b}`);
      titled = true;
      continue;
    }
    const h = b.length <= 90 ? (b.match(HEADING) ?? titleHeading(b)) : null;
    if (h && !/[.;:,]$/.test(b)) {
      out.push(headingLine(h));
      titled = true;
      continue;
    }
    const inl = b.match(INLINE_HEADING);
    if (inl && inl[2].split(" ").length <= 6 && !/^\d/.test(inl[3])) {
      out.push(`## ${inl[1]}. ${inl[2]}`, inl[3]);
      titled = true;
      continue;
    }
    if (!titled && b.length <= 120 && b === b.toUpperCase() && /[A-Z]{4}/.test(b)) {
      out.push(`# ${b}`);
      titled = true;
      continue;
    }
    out.push(b);
  }
  return out.join("\n\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** "7. Limitation of Liability": a short numbered line in Title Case that doesn't read as a sentence (a trailing "(added by …)" note is allowed). */
function titleHeading(b: string): RegExpMatchArray | null {
  const core = b.replace(/\s*\([^()]*\)$/, "");
  const m = core.match(/^(\d{1,2})\.?\s+([A-Z][A-Za-z0-9 ,&'’()/\-–—]{2,70})$/);
  if (!m || m[2].split(/\s+/).length > 8 || /\b(shall|will|must|may|is|are|has|have)\b/.test(m[2])) return null;
  if (core !== b) m[2] += b.slice(core.length);
  return m;
}

function headingLine(h: RegExpMatchArray): string {
  if (h[1]) return `## ${h[1]}. ${h[2].trim()}`;
  if (h[3]) return `## ARTICLE ${h[3]} — ${h[4].trim()}`;
  return `## ${h[5]}. ${h[6].trim()}`;
}

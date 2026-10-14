/**
 * npm run fixtures:formats: the 10 held-out drafts (Dataset/incoming/SYN_*) as the files clients really send.
 * Step 1 (this script): Markdown → HTML pages in test-uploads/formats/html/.
 * Step 2 (scripts/makeFormatFixtures.ps1, Windows + Word + Edge): Word saves them as .docx / .pdf, and Edge
 * screenshots pages that Word wraps in an image-only PDF (a scan with no text layer).
 * The plan says which file becomes which format; scripts/checkFileRead.ts reads them back and compares.
 */
import fs from "node:fs";
import path from "node:path";

export const FORMAT_PLAN: Record<string, "docx" | "docx-autonum" | "pdf" | "scan"> = {
  pillarstone: "docx",
  cobalt: "docx",
  quanta: "docx",
  greystone: "docx-autonum",
  indus: "docx-autonum",
  aldergrove: "pdf",
  ashwood: "pdf",
  cargoline: "pdf",
  corvina: "scan",
  monsoon: "scan",
};

/** The held-out drafts (the dataset's SYN_ files, copied into the repo so a fresh clone and CI can run every check). */
export const HOLDOUT_DIR = "data/raw/holdout/incoming";
export const FORMATS_DIR = "test-uploads/formats";

export function holdoutSource(key: string): string {
  const f = fs.readdirSync(HOLDOUT_DIR).find((x) => x.startsWith("SYN_") && x.includes(key));
  if (!f) throw new Error(`no held-out draft for ${key}`);
  return path.join(HOLDOUT_DIR, f);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\*(.+?)\*/g, "<i>$1</i>");

/** The dataset's Markdown → simple HTML. autonum: clause headings become a Word auto-numbered list. */
function toHtml(md: string, autonum: boolean): string {
  const out: string[] = [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    if (/^\*\(SYNTHETIC DATA/.test(l)) continue; // the dataset's editorial header is not part of the contract
    if (l.startsWith("|")) {
      const rows: string[] = [];
      for (; i < lines.length && lines[i].startsWith("|"); i++) {
        if (/^\|[\s:|-]+\|$/.test(lines[i])) continue;
        rows.push(`<tr>${lines[i].slice(1, -1).split("|").map((c) => `<td>${inline(c.trim())}</td>`).join("")}</tr>`);
      }
      i--;
      out.push(`<table border="1" cellpadding="4">${rows.join("")}</table>`);
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = l.match(/^# (.+)/))) out.push(`<h1 style="text-align:center">${inline(m[1])}</h1>`);
    else if ((m = l.match(/^## (\d+)\.\s+(.+)/)) && autonum) out.push(`<ol start="${m[1]}"><li><h2>${inline(m[2])}</h2></li></ol>`);
    else if ((m = l.match(/^## (.+)/))) out.push(`<h2>${inline(m[1])}</h2>`);
    else if ((m = l.match(/^#{3,} (.+)/))) out.push(`<h3>${inline(m[1])}</h3>`);
    else if (/^\s+\(/.test(l)) out.push(`<p style="margin-left:2em">${inline(l.trim())}</p>`);
    else out.push(`<p>${inline(l.trim())}</p>`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.35;max-width:46em;margin:3em auto} h1{font-size:15pt} h2{font-size:12pt;margin-top:1.2em} td{font-size:11pt}</style></head><body>${out.join("\n")}</body></html>`;
}

/** Scans: one HTML page per ~1,400 characters, for Edge to screenshot. */
function scanPages(md: string): string[] {
  const html = toHtml(md, false);
  const body = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>")).split("\n");
  const pages: string[][] = [[]];
  let n = 0;
  for (const b of body) {
    if (n > 1400 && pages[pages.length - 1].length) {
      pages.push([]);
      n = 0;
    }
    pages[pages.length - 1].push(b);
    n += b.replace(/<[^>]+>/g, "").length;
  }
  return pages.map((p) => html.slice(0, html.indexOf("<body>") + 6).replace("margin:3em auto", "margin:2em 3em;background:#fbfaf6;filter:contrast(1.05)") + p.join("\n") + "</body></html>");
}

if (process.argv[1]?.endsWith("makeFormatFixtures.ts")) {
  const htmlDir = path.join(FORMATS_DIR, "html");
  fs.mkdirSync(htmlDir, { recursive: true });
  for (const [key, fmt] of Object.entries(FORMAT_PLAN)) {
    const md = fs.readFileSync(holdoutSource(key), "utf8");
    if (fmt === "scan") scanPages(md).forEach((p, i) => fs.writeFileSync(path.join(htmlDir, `${key}.scan-${i + 1}.html`), p));
    else fs.writeFileSync(path.join(htmlDir, `${key}.${fmt}.html`), toHtml(md, fmt === "docx-autonum"));
  }
  console.log(`HTML written to ${htmlDir}; now run: powershell -File scripts/makeFormatFixtures.ps1`);
}

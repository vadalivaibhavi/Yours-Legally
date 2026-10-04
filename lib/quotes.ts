/**
 * Citation guardrail (PRD §10 "Hallucinated or wrong citation"; CLAUDE.md): every quote shown
 * must be string-matched to the source. Matching ignores only formatting noise (markdown bold,
 * whitespace, curly quotes, dash variants); the returned span is the exact source text.
 * A quote may elide text with "..." / "…": each part must match, in order.
 */

type Norm = { text: string; map: number[] };

function normalise(s: string): Norm {
  const out: string[] = [];
  const map: number[] = [];
  let lastSpace = true;
  for (let i = 0; i < s.length; i++) {
    let c = s[i];
    if (c === "*" || c === "_" || c === "`") continue; // markdown emphasis
    if (c === "‘" || c === "’") c = "'";
    if (c === "“" || c === "”") c = '"';
    if (c === "–" || c === "—" || c === "−") c = "-";
    if (c === " ") c = " ";
    if (/\s/.test(c)) {
      if (lastSpace) continue;
      c = " ";
      lastSpace = true;
    } else lastSpace = false;
    out.push(c.toLowerCase());
    map.push(i);
  }
  while (out.length && out[out.length - 1] === " ") {
    out.pop();
    map.pop();
  }
  return { text: out.join(""), map };
}

const strCache = new Map<string, Norm>();
function normCached(s: string): Norm {
  let n = strCache.get(s);
  if (!n) {
    n = normalise(s);
    if (strCache.size > 200) strCache.clear();
    strCache.set(s, n);
  }
  return n;
}

/** Returns the exact source span matching the quote, or null if the quote isn't in the source. */
export function locateQuote(source: string, quote: string): string | null {
  if (!quote || quote.trim().length < 8) return null;
  const parts = quote
    .split(/\s*(?:\.\.\.|…|\[\.\.\.\])\s*/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (!parts.length) return null;
  const src = normCached(source);
  let from = 0;
  let start = -1;
  let end = -1;
  for (const part of parts) {
    const q = normalise(part).text.replace(/^[\s"'(]+|[\s"'.,;:)]+$/g, "");
    if (q.length < 4) continue;
    const at = src.text.indexOf(q, from);
    if (at < 0) return null;
    if (start < 0) start = at;
    end = at + q.length - 1;
    from = at + q.length;
  }
  if (start < 0) return null;
  return source.slice(src.map[start], src.map[end] + 1);
}

export function quoteMatches(source: string, quote: string): boolean {
  return locateQuote(source, quote) !== null;
}

/** First clause number appearing before a position, e.g. "12.1" — used to repair clause refs. */
export function sectionNumberOf(clauseRef: string): string {
  const m = clauseRef.match(/(\d+)(?:\.\d+)*/);
  return m ? m[1] : "";
}

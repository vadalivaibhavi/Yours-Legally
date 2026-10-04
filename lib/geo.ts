/** Region vocabulary helpers: exact, testable matching for the structured conflict filter (PRD §5). */

export const GCC = ["UAE", "Saudi Arabia", "Qatar", "Kuwait", "Bahrain", "Oman"];
const EU = ["Germany", "EU", "Europe"];

const ALIASES: Record<string, string> = {
  "united arab emirates": "UAE",
  uae: "UAE",
  dubai: "UAE",
  "abu dhabi": "UAE",
  ksa: "Saudi Arabia",
  "kingdom of saudi arabia": "Saudi Arabia",
  "saudi arabia": "Saudi Arabia",
  oman: "Oman",
  "sultanate of oman": "Oman",
  muscat: "Oman",
  qatar: "Qatar",
  kuwait: "Kuwait",
  bahrain: "Bahrain",
  usa: "USA",
  us: "USA",
  "united states": "USA",
  "united kingdom": "UK",
  uk: "UK",
  germany: "Germany",
  india: "India",
  singapore: "Singapore",
  gcc: "GCC",
  eu: "EU",
  europe: "Europe",
  worldwide: "Worldwide",
};

export function canonRegion(r: string): string {
  return ALIASES[r.trim().toLowerCase()] ?? r.trim();
}

/** Expand a region list to concrete countries (GCC → six states; EU/Europe → European markers). */
export function expandRegions(regions: string[]): Set<string> {
  const out = new Set<string>();
  for (const raw of regions) {
    const r = canonRegion(raw);
    if (r === "GCC") GCC.forEach((c) => out.add(c));
    else if (r === "EU" || r === "Europe") EU.forEach((c) => out.add(c));
    else out.add(r);
  }
  return out;
}

/** True when two region lists overlap. "Worldwide" overlaps everything. */
export function regionsOverlap(a: string[], b: string[]): boolean {
  const A = expandRegions(a);
  const B = expandRegions(b);
  if (A.has("Worldwide") || B.has("Worldwide")) return true;
  for (const x of A) if (B.has(x)) return true;
  return false;
}

export function intersectRegions(a: string[], b: string[]): string[] {
  const A = expandRegions(a);
  const B = expandRegions(b);
  if (A.has("Worldwide")) return [...B];
  if (B.has("Worldwide")) return [...A];
  return [...A].filter((x) => B.has(x));
}

/** Expected AtliQ entity by client country (finance fact sheet): Inc = US clients only. */
export function expectedEntityFor(country: string | null | undefined): "Inc" | "Pvt Ltd" | null {
  if (!country) return null;
  return canonRegion(country) === "USA" ? "Inc" : "Pvt Ltd";
}

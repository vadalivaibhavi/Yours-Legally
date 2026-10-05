/**
 * Shared CLI flags for every script:
 *   --deal <id>[,<id>…]   (repeatable; bare deal ids also work: `npm run review -- gulfcrown`)
 *   --case EV-xx[,EV-yy…] (repeatable)
 *   --force, --no-versions, … (any other --flag)
 */
export type Args = { deals: string[]; cases: string[]; flags: Set<string>; positional: string[] };

export function parseArgs(argv = process.argv.slice(2)): Args {
  const deals: string[] = [];
  const cases: string[] = [];
  const flags = new Set<string>();
  const positional: string[] = [];
  const list = (v: string | undefined) => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--deal" || a === "--deals") deals.push(...list(argv[++i]));
    else if (a.startsWith("--deal=")) deals.push(...list(a.slice(7)));
    else if (a === "--case" || a === "--cases") cases.push(...list(argv[++i]).map((c) => c.toUpperCase()));
    else if (a.startsWith("--case=")) cases.push(...list(a.slice(7)).map((c) => c.toUpperCase()));
    else if (a.startsWith("--")) flags.add(a.slice(2));
    else positional.push(a);
  }
  return { deals, cases, flags, positional };
}

/** Fail fast on a typo'd id instead of silently doing nothing. */
export function checkIds(kind: string, asked: string[], valid: string[]) {
  const unknown = asked.filter((x) => !valid.includes(x));
  if (unknown.length) {
    console.error(`Unknown ${kind}: ${unknown.join(", ")}. Valid: ${valid.join(", ")}`);
    process.exit(1);
  }
}

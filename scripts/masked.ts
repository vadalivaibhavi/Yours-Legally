/**
 * Runs a script with masking on (FR-26, MASKING=on), on any OS:
 *   npm run masked:review -- --deal lakeshore   → tsx scripts/masked.ts review --deal lakeshore
 *   npm run masked:eval                          → tsx scripts/masked.ts eval
 * Masked runs use their own cache keys, briefs (data/briefs-masked) and report (eval/results-masked.*).
 */
process.env.MASKING = "on";
const [script, ...rest] = process.argv.slice(2);
if (!/^[a-zA-Z]+$/.test(script ?? "")) throw new Error("usage: tsx scripts/masked.ts <script> [args]");
process.argv = [process.argv[0], `scripts/${script}.ts`, ...rest];
import(`./${script}.ts`);

export {}; // a module, so its names stay local

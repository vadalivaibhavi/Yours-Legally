/**
 * Runs a script on the held-out profile (DATA_PROFILE=holdout), on any OS:
 *   npm run holdout:register  → tsx scripts/holdout.ts buildRegister
 *   npm run holdout:review    → tsx scripts/holdout.ts review [--deal x] [--force]
 */
process.env.DATA_PROFILE = "holdout";
const [script, ...rest] = process.argv.slice(2);
if (!/^[a-zA-Z]+$/.test(script ?? "")) throw new Error("usage: tsx scripts/holdout.ts <script> [args]");
process.argv = [process.argv[0], `scripts/${script}.ts`, ...rest];
import(`./${script}.ts`);

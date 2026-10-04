/**
 * Smoke test for lib/clauseIndex.ts (Phase 1 spec 1c):
 *   npm run search -- "liquidated damages 1% per week uncapped" ld
 * Expected top 3 includes Acme (standard), Al Noor (exception) and Brightwater (accident).
 */
import "./_env";
import { search } from "../lib/clauseIndex";
import { ClauseType } from "../lib/types";

async function main() {
  const [text, type = "ld", k = "3"] = process.argv.slice(2);
  if (!text) {
    console.log('usage: npm run search -- "<clause text>" <clauseType> [k]');
    return;
  }
  const hits = await search(text, ClauseType.parse(type), Number(k), 0);
  console.log(`query (${type}): ${text}\n`);
  for (const h of hits) {
    const c = h.chunk;
    console.log(`${h.score.toFixed(3)}  [${c.label}]  ${c.counterparty} (${c.date}) §${c.clauseNo} ${c.heading}`);
    if (c.labelNote) console.log(`        ${c.labelNote}`);
    if (h.alsoIn.length) console.log(`        same position also in: ${h.alsoIn.join(", ")}`);
    console.log(`        "${c.text.replace(/\s+/g, " ").slice(0, 180)}…"`);
  }
}

main();

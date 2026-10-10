/**
 * The one clause-search entry point (FR-22, Build Plan §3). Prototype storage is a pre-built
 * index file with in-code cosine similarity; production would swap this module for
 * Postgres + a vector extension without changing callers.
 *
 * Reference only: results never set severity or the verdict (PRD §10). Only signed contracts
 * are indexed, so drafts can never be returned.
 */
import fs from "node:fs";
import path from "node:path";
import { clauseIndexFile } from "./config";
import { cosine, embed, embedModel } from "./embed";
import type { ClauseChunk, ClauseChunkMeta, ClauseType } from "./types";

/** Tuned on EV-P1–P7 (see eval/results.md). Below this: "No similar clause signed before." */
export const SIMILARITY_THRESHOLD = Number(process.env.SIMILARITY_THRESHOLD || 0.75);

export type SimilarHit = { chunk: ClauseChunkMeta; score: number; alsoIn: string[] };

let index: ClauseChunk[] | null = null;

export function loadIndex(): ClauseChunk[] {
  if (index) return index;
  const p = path.join(process.cwd(), "data", clauseIndexFile());
  if (!fs.existsSync(p)) return (index = []);
  const file = JSON.parse(fs.readFileSync(p, "utf8")) as { embedModel?: string; chunks: ClauseChunk[] };
  // Vectors from different embedding models can't be compared: a mismatch would return nonsense, so stop.
  if (file.embedModel && file.embedModel !== embedModel()) throw new Error(`The clause index (data/${clauseIndexFile()}) was built with ${file.embedModel}, but EMBED_MODEL is ${embedModel()}. Rebuild it with npm run build:index, or switch EMBED_PROVIDER back.`);
  return (index = file.chunks);
}

export function indexMeta(): ClauseChunkMeta[] {
  return loadIndex().map(strip);
}

function strip(c: ClauseChunk): ClauseChunkMeta {
  const { embedding: _e, ...meta } = c;
  return meta;
}

/** Same-label clauses this close are one repeated position (e.g. Acme/Northwind/Trustline LDs: 0.94–0.975). */
const DUPLICATE_COSINE = 0.94;
/** Near-ties go to clauses that carry Karandeep's intent label: a tagged precedent says how he decided. */
const TAGGED_BOOST = 0.02;

/**
 * Cosine-rank same-type signed clauses; one hit per contract; a repeated position (same intent label,
 * near-identical text) is shown once, as its earliest instance (the origin precedent), with the later
 * contracts listed in `alsoIn`. Top k above the threshold.
 */
export function searchByVector(vec: number[], clauseType: ClauseType, k = 3, threshold = SIMILARITY_THRESHOLD): SimilarHit[] {
  const ranked = loadIndex()
    .filter((c) => c.clauseType === clauseType)
    .map((c) => ({ c, score: cosine(vec, c.embedding) }))
    .filter((h) => h.score >= threshold)
    .sort((a, b) => b.score + (b.c.label !== "untagged" ? TAGGED_BOOST : 0) - (a.score + (a.c.label !== "untagged" ? TAGGED_BOOST : 0)));
  const picked: { c: ClauseChunk; score: number; alsoIn: string[] }[] = [];
  for (const h of ranked) {
    if (picked.some((p) => p.c.docId === h.c.docId)) continue;
    const dup = picked.find((p) => p.c.label === h.c.label && cosine(p.c.embedding, h.c.embedding) >= DUPLICATE_COSINE);
    if (dup) {
      if (h.c.date < dup.c.date) {
        dup.alsoIn.push(`${dup.c.counterparty} (${dup.c.date.slice(0, 7)})`);
        dup.c = h.c; // keep the best score, show the origin
      } else dup.alsoIn.push(`${h.c.counterparty} (${h.c.date.slice(0, 7)})`);
      continue;
    }
    if (picked.length < k) picked.push({ c: h.c, score: h.score, alsoIn: [] });
  }
  return picked.map((p) => ({ chunk: strip(p.c), score: p.score, alsoIn: p.alsoIn }));
}

/** search(text, clauseType, k): embed the query, filter by clause type, cosine rank, top k above threshold. */
export async function search(text: string, clauseType: ClauseType, k = 3, threshold = SIMILARITY_THRESHOLD): Promise<SimilarHit[]> {
  const [vec] = await embed([text]);
  return searchByVector(vec, clauseType, k, threshold);
}

/** Batch form used by the review engine: one embedding call for all key clauses of a contract. */
export async function searchMany(
  queries: { text: string; clauseType: ClauseType }[],
  k = 3,
  threshold = SIMILARITY_THRESHOLD,
): Promise<SimilarHit[][]> {
  if (!queries.length) return [];
  const vecs = await embed(queries.map((q) => q.text));
  return queries.map((q, i) => searchByVector(vecs[i], q.clauseType, k, threshold));
}

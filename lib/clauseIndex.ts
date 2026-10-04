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
import { cosine, embed } from "./embed";
import type { ClauseChunk, ClauseChunkMeta, ClauseType } from "./types";

/** Tuned on EV-P1–P7 (see eval/results.md). Below this: "No similar clause signed before." */
export const SIMILARITY_THRESHOLD = Number(process.env.SIMILARITY_THRESHOLD || 0.6);

export type SimilarHit = { chunk: ClauseChunkMeta; score: number };

let index: ClauseChunk[] | null = null;

export function loadIndex(): ClauseChunk[] {
  if (index) return index;
  const p = path.join(process.cwd(), "data", "clause_index.json");
  index = fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf8")).chunks as ClauseChunk[]) : [];
  return index;
}

export function indexMeta(): ClauseChunkMeta[] {
  return loadIndex().map(strip);
}

function strip(c: ClauseChunk): ClauseChunkMeta {
  const { embedding: _e, ...meta } = c;
  return meta;
}

export function searchByVector(vec: number[], clauseType: ClauseType, k = 3, threshold = SIMILARITY_THRESHOLD): SimilarHit[] {
  return loadIndex()
    .filter((c) => c.clauseType === clauseType)
    .map((c) => ({ chunk: strip(c), score: cosine(vec, c.embedding) }))
    .filter((h) => h.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
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

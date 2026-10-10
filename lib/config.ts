import fs from "node:fs";
import path from "node:path";

export const ROOT = process.cwd();
export const DATA_DIR = path.join(ROOT, "data");
export const RAW_DIR = path.join(DATA_DIR, "raw", "Dataset");

/** Writable directory: local data/ in dev and scripts, /tmp on Vercel (read-only bundle). */
export function writableDir(sub: string): string {
  const base = process.env.VERCEL ? path.join("/tmp", "yours-legally") : DATA_DIR;
  const dir = path.join(base, sub);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Two run profiles (README "Local testing vs the final build"):
 *  - final (deployed on Vercel): LLM_PROVIDER=gemini + EMBED_PROVIDER=gemini; briefs in data/briefs, clause
 *    index data/clause_index.json. These are committed and shipped.
 *  - local testing: LLM_PROVIDER=ollama (and EMBED_PROVIDER=ollama to test offline); briefs in
 *    data/briefs-ollama, index data/clause_index.ollama.json. Never committed, never shipped, and they never
 *    overwrite the final ones. The model cache is tagged by provider as well (lib/llm.ts providerTag).
 */
export function briefsDir(): string {
  const p = (process.env.LLM_PROVIDER || "gemini").toLowerCase();
  return p === "gemini" ? "briefs" : `briefs-${p}`;
}
/** Clause index for the current embedding model: vectors from different models can't be compared. */
export function clauseIndexFile(): string {
  const e = (process.env.EMBED_PROVIDER || "gemini").toLowerCase();
  return e === "gemini" ? "clause_index.json" : `clause_index.${e}.json`;
}

/** "Today" is fixed for reproducible demos and evals (Phase 1 spec §0). */
export function appToday(): string {
  return process.env.APP_TODAY || "2026-10-04";
}

export function todayDate(): Date {
  return new Date(appToday() + "T00:00:00Z");
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(fromIso.slice(0, 10) + "T00:00:00Z");
  const b = Date.parse(toIso.slice(0, 10) + "T00:00:00Z");
  return Math.round((b - a) / 86_400_000);
}

export function readJson<T>(rel: string, fallback?: T): T {
  const p = path.join(DATA_DIR, rel);
  if (!fs.existsSync(p)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing data file: data/${rel}. Run the Phase 1 scripts first.`);
  }
  return JSON.parse(fs.readFileSync(p, "utf8")) as T;
}

export function writeJson(rel: string, value: unknown): void {
  const p = path.join(DATA_DIR, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(value, null, 2) + "\n");
}

/**
 * The one embedding wrapper (Build Plan §2). Changing the embedding model means re-running
 * `npm run build:index` once. Vectors are L2-normalised so cosine = dot product.
 * Providers: gemini | openai | voyage | local (hashed bag-of-words, no key) | mock.
 * Server-only.
 */
import fs from "node:fs";
import path from "node:path";
import { hash, logCall, QuotaExhaustedError } from "./llm";
import { writableDir } from "./config";

export const EMBED_DIM = 768;

export function embedProvider(): string {
  return (process.env.EMBED_PROVIDER || "local").toLowerCase();
}
export function embedModel(): string {
  return process.env.EMBED_MODEL || (embedProvider() === "local" ? "local-hash-768" : "gemini-embedding-001");
}

let tokensUsed = 0;
export function drainEmbedTokens() {
  const t = tokensUsed;
  tokensUsed = 0;
  return t;
}

export async function embed(texts: string[]): Promise<number[][]> {
  const out: (number[] | null)[] = texts.map((t) => readCache(t));
  const missing = texts.map((t, i) => (out[i] ? -1 : i)).filter((i) => i >= 0);
  for (let s = 0; s < missing.length; s += 100) {
    const idx = missing.slice(s, s + 100);
    const vecs = await embedBatch(idx.map((i) => texts[i]));
    idx.forEach((i, j) => {
      out[i] = normalise(vecs[j]);
      writeCache(texts[i], out[i]!);
    });
  }
  return out as number[][];
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const p = embedProvider();
  if (p === "local" || p === "mock") return texts.map(localEmbed);
  const key = process.env.EMBED_API_KEY || process.env.LLM_API_KEY;
  if (!key) throw new Error("EMBED_API_KEY is not set");
  const approxTokens = texts.reduce((n, t) => n + Math.ceil(t.length / 4), 0);
  tokensUsed += approxTokens;
  logCall({ task: "embed", model: embedModel(), inputTokens: approxTokens, outputTokens: 0, ms: 0, cached: false, ok: true });

  if (p === "gemini") {
    const model = embedModel();
    const res = await withRetry(() =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          requests: texts.map((t) => ({
            model: `models/${model}`,
            content: { parts: [{ text: t.slice(0, 8000) }] },
            taskType: "SEMANTIC_SIMILARITY",
            outputDimensionality: EMBED_DIM,
          })),
        }),
      }),
    );
    const j = await res.json();
    return j.embeddings.map((e: { values: number[] }) => e.values);
  }
  if (p === "openai") {
    const res = await withRetry(() =>
      fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: embedModel(), input: texts, dimensions: EMBED_DIM }),
      }),
    );
    const j = await res.json();
    return j.data.map((d: { embedding: number[] }) => d.embedding);
  }
  if (p === "voyage") {
    const res = await withRetry(() =>
      fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: embedModel(), input: texts }),
      }),
    );
    const j = await res.json();
    return j.data.map((d: { embedding: number[] }) => d.embedding);
  }
  throw new Error(`unknown EMBED_PROVIDER ${p}`);
}

async function withRetry(f: () => Promise<Response>): Promise<Response> {
  let last = "";
  for (let i = 0; i < 6; i++) {
    const r = await f();
    if (r.ok) return r;
    const body = await r.text();
    last = `HTTP ${r.status}: ${body.slice(0, 200)}`;
    if (r.status !== 429 && r.status < 500) break;
    // Daily embedding quota used up: stop the run cleanly (resume tomorrow), like the LLM wrapper.
    if (r.status === 429 && /PerDay|limit: 0/i.test(body)) throw new QuotaExhaustedError([`embeddings (${embedModel()})`]);
    // Free tiers limit embeddings per minute: wait out the window the API asks for.
    const m = body.match(/retry in ([\d.]+)s|"retryDelay":\s*"(\d+)s"/i);
    const wait = m ? Number(m[1] ?? m[2]) * 1000 + 1000 : r.status === 429 ? 61_000 : 5000 * (i + 1);
    await new Promise((res) => setTimeout(res, wait));
  }
  throw new Error("embedding failed: " + last);
}

/** Keyless fallback: signed feature hashing of word uni/bi-grams. Deterministic, offline. */
export function localEmbed(text: string): number[] {
  const v = new Array(EMBED_DIM).fill(0);
  const words = text.toLowerCase().replace(/[^a-z0-9%.\s]/g, " ").split(/\s+/).filter((w) => w.length > 1);
  const grams = [...words, ...words.slice(1).map((w, i) => words[i] + " " + w)];
  for (const g of grams) {
    const h = parseInt(hash(g).slice(0, 8), 16);
    v[h % EMBED_DIM] += h & 0x100 ? 1 : -1;
  }
  return v;
}

export function normalise(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => Math.round((x / n) * 1e5) / 1e5);
}

export function cosine(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function cacheFile(text: string) {
  return path.join(writableDir(path.join("cache", "embed")), hash(embedProvider() + embedModel() + EMBED_DIM + text) + ".json");
}
function readCache(text: string): number[] | null {
  const p = cacheFile(text);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}
function writeCache(text: string, v: number[]) {
  try {
    fs.writeFileSync(cacheFile(text), JSON.stringify(v));
  } catch {
    /* best effort */
  }
}

/**
 * The one LLM wrapper (Build Plan §2). Changing provider touches this file and env vars only.
 * - Model per task from config (fast vs strong); comma-separated env values are a fallback chain,
 *   because free tiers rate-limit per model.
 * - Every output is validated with zod. Invalid JSON/schema → one retry with the error, then
 *   "couldn't complete: review manually" (CLAUDE.md rule; PRD §9.2 System failure).
 * - Results are cached by a hash of the full request in data/cache/llm, so re-runs of unchanged
 *   documents are instant and free.
 * Server-only: reads API keys from the environment.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { writableDir } from "./config";

export type Task =
  | "extract" // F2 intake extraction (fast)
  | "route" // F2 doc-type routing (fast)
  | "classify" // clause typing for the index, seller free text (fast)
  | "notes" // F5 notes scan (strong: feeds the compliance alert)
  | "register" // F1 register extraction (strong)
  | "conflict" // F3 collision reasoning (strong)
  | "playbook" // F4 playbook / mirror / flow-down (strong)
  | "nda" // F2 fast lane: NDA mutuality checklist (strong model, low thinking: <1 min target)
  | "differs" // FR-22 "how it differs" lines (strong)
  | "brief"; // F6 headline + next action from findings (strong)

const TIER: Record<Task, "fast" | "strong"> = {
  extract: "fast",
  route: "fast",
  classify: "fast",
  notes: "strong", // compliance events must never be missed (PRD §11: 100% on compliance-alert cases)
  register: "strong",
  conflict: "strong",
  playbook: "strong",
  nda: "strong",
  differs: "strong",
  brief: "strong",
};

export const MANUAL_REVIEW = "couldn't complete: review manually";

export type Usage = { inputTokens: number; outputTokens: number };
export type LlmOk<T> = { ok: true; data: T; model: string; usage: Usage; cached: boolean; ms: number };
export type LlmErr = { ok: false; error: string; message: typeof MANUAL_REVIEW };
export type LlmResult<T> = LlmOk<T> | LlmErr;

export type CallArgs<S extends z.ZodType> = {
  task: Task;
  system: string;
  input: string;
  schema: S;
  /** Returned when LLM_PROVIDER=mock (Phase 0 / unit tests). */
  mock?: z.infer<S>;
  /** Bypass the cache (e.g. forced re-check). */
  noCache?: boolean;
};

export function provider(): string {
  return (process.env.LLM_PROVIDER || "mock").toLowerCase();
}

export function modelsFor(task: Task): string[] {
  const tier = TIER[task];
  const raw = tier === "fast" ? process.env.LLM_MODEL_FAST : process.env.LLM_MODEL_STRONG;
  const list = (raw || "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : ["mock-model"];
}

/** Prompt/schema version: bump to invalidate cached outputs after prompt changes (audit, FR-15). */
export const PROMPT_VERSION = "p1";

// ---------------------------------------------------------------- usage log (feeds cost estimate)
const usageLog: { task: Task; model: string; usage: Usage; ms: number; cached: boolean }[] = [];
export function drainUsage() {
  return usageLog.splice(0, usageLog.length);
}

// ---------------------------------------------------------------- main entry
export async function callModel<S extends z.ZodType>(args: CallArgs<S>): Promise<LlmResult<z.infer<S>>> {
  const { task, system, input, schema } = args;
  const jsonSchema = toJsonSchema(schema);
  const key = hash([PROMPT_VERSION, task, TIER[task], system, input, JSON.stringify(jsonSchema)].join("\u0000"));

  if (provider() === "mock") {
    if (args.mock === undefined) return fail("LLM_PROVIDER=mock and no mock value for task " + task);
    const parsed = schema.safeParse(args.mock);
    return parsed.success
      ? { ok: true, data: parsed.data, model: "mock", usage: { inputTokens: 0, outputTokens: 0 }, cached: false, ms: 0 }
      : fail("mock value does not match schema: " + parsed.error.message);
  }

  if (!args.noCache) {
    const hit = readCache(key);
    // A strong-tier answer produced by a lite fallback model is not reused once a strong model is available.
    const degraded = hit && TIER[task] === "strong" && /lite/.test(hit.model) && !modelsFor(task).every((m) => /lite/.test(m));
    if (hit && !degraded) {
      const parsed = schema.safeParse(hit.data);
      if (parsed.success) {
        usageLog.push({ task, model: hit.model, usage: { inputTokens: 0, outputTokens: 0 }, ms: 0, cached: true });
        return { ok: true, data: parsed.data, model: hit.model, usage: hit.usage, cached: true, ms: 0 };
      }
    }
  }

  const started = Date.now();
  let lastError = "";
  let prompt = input;
  // Attempt 1 + one retry on invalid JSON / schema mismatch (CLAUDE.md).
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await generateWithFallback(task, system, prompt, jsonSchema);
    if (!res.ok) return fail(res.error);
    const json = parseJsonLoose(res.text);
    const parsed = json === undefined ? null : schema.safeParse(json);
    if (parsed && parsed.success) {
      const ms = Date.now() - started;
      writeCache(key, { model: res.model, usage: res.usage, data: parsed.data });
      usageLog.push({ task, model: res.model, usage: res.usage, ms, cached: false });
      return { ok: true, data: parsed.data, model: res.model, usage: res.usage, cached: false, ms };
    }
    lastError = json === undefined ? "invalid JSON" : `schema mismatch: ${parsed?.error.message.slice(0, 1500)}`;
    prompt =
      input +
      `\n\n---\nYour previous answer was rejected (${lastError}). Return ONLY valid JSON matching this JSON Schema:\n` +
      JSON.stringify(jsonSchema);
  }
  return fail(lastError);
}

function fail(error: string): LlmErr {
  return { ok: false, error, message: MANUAL_REVIEW };
}

// ---------------------------------------------------------------- providers
type GenOk = { ok: true; text: string; model: string; usage: Usage };
type GenErr = { ok: false; error: string };

async function generateWithFallback(task: Task, system: string, input: string, schema: object): Promise<GenOk | GenErr> {
  const errors: string[] = [];
  for (const model of modelsFor(task)) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await generateOnce(model, thinkingFor(task), system, input, schema);
      if (r.ok) return r;
      errors.push(`${model}: ${r.error.slice(0, 120)}`);
      if (r.retry === "same" && attempt < 3) {
        // Overloaded (503) models recover in tens of seconds: back off 15s, 30s, 60s.
        await sleep(r.waitMs ?? 15_000 * 2 ** attempt);
        continue;
      }
      break; // quota / not found / fatal → next model in the chain
    }
  }
  return { ok: false, error: errors.join(" | ").slice(0, 2000) };
}

type Once = GenOk | (GenErr & { retry?: "same" | "next"; waitMs?: number });

async function generateOnce(model: string, thinking: "low" | "high", system: string, input: string, schema: object): Promise<Once> {
  const p = provider();
  const key = process.env.LLM_API_KEY;
  if (!key) return { ok: false, error: "LLM_API_KEY is not set", retry: "next" };
  try {
    if (p === "gemini") return await gemini(model, thinking, key, system, input, schema);
    if (p === "anthropic") return await anthropic(model, key, system, input, schema);
    if (p === "openai") return await openai(model, key, system, input, schema);
    return { ok: false, error: `unknown LLM_PROVIDER ${p}` };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 300), retry: "same" };
  }
}

async function gemini(model: string, thinking: "low" | "high", key: string, system: string, input: string, schema: object): Promise<Once> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = (withSchema: boolean) => ({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: input }] }],
    generationConfig: {
      responseMimeType: "application/json",
      ...(withSchema ? { responseJsonSchema: schema } : {}),
      thinkingConfig: { thinkingLevel: thinking },
    },
  });
  let res = await fetchWithTimeout(url, key, body(true));
  if (res.status === 400) {
    // Some models reject parts of the schema or the thinking config: retry plain JSON mode.
    const plain = body(false) as Record<string, unknown>;
    (plain.generationConfig as Record<string, unknown>).thinkingConfig = undefined;
    plain.contents = [{ role: "user", parts: [{ text: input + "\n\nReturn JSON matching this JSON Schema:\n" + JSON.stringify(schema) }] }];
    res = await fetchWithTimeout(url, key, plain);
  }
  const txt = await res.text();
  if (!res.ok) return classifyHttpError(res.status, txt);
  const j = JSON.parse(txt);
  const parts: { text?: string; thought?: boolean }[] = j?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.filter((x) => !x.thought && typeof x.text === "string").map((x) => x.text).join("");
  if (!text) return { ok: false, error: `empty response (${j?.candidates?.[0]?.finishReason ?? "no candidate"})`, retry: "same" };
  const u = j.usageMetadata ?? {};
  return {
    ok: true,
    text,
    model,
    usage: { inputTokens: u.promptTokenCount ?? 0, outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) },
  };
}

async function anthropic(model: string, key: string, system: string, input: string, schema: object): Promise<Once> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      system: system + "\n\nReturn ONLY a JSON object matching this JSON Schema, no prose:\n" + JSON.stringify(schema),
      messages: [{ role: "user", content: input }],
    }),
  });
  const txt = await res.text();
  if (!res.ok) return classifyHttpError(res.status, txt);
  const j = JSON.parse(txt);
  const text = (j.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  return { ok: true, text, model, usage: { inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0 } };
}

async function openai(model: string, key: string, system: string, input: string, schema: object): Promise<Once> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system + "\n\nReturn ONLY JSON matching this JSON Schema:\n" + JSON.stringify(schema) },
        { role: "user", content: input },
      ],
      response_format: { type: "json_object" },
    }),
  });
  const txt = await res.text();
  if (!res.ok) return classifyHttpError(res.status, txt);
  const j = JSON.parse(txt);
  return {
    ok: true,
    text: j.choices?.[0]?.message?.content ?? "",
    model,
    usage: { inputTokens: j.usage?.prompt_tokens ?? 0, outputTokens: j.usage?.completion_tokens ?? 0 },
  };
}

/** Reasoning depth per task: deep where judgment matters, shallow where latency matters. */
const THINKING: Partial<Record<Task, "low" | "high">> = { nda: "low", differs: "low", brief: "low" };
export function thinkingFor(task: Task): "low" | "high" {
  return THINKING[task] ?? (TIER[task] === "fast" ? "low" : "high");
}

function classifyHttpError(status: number, body: string): GenErr & { retry?: "same" | "next"; waitMs?: number } {
  const msg = `HTTP ${status}: ${body.replace(/\s+/g, " ").slice(0, 240)}`;
  if (status === 429) {
    // Per-minute limits are worth one wait; daily/zero quotas move to the next model.
    const perDay = /PerDay|limit: 0/i.test(body);
    const m = body.match(/retry in ([\d.]+)s/i);
    const wait = m ? Math.min(Number(m[1]) * 1000 + 500, 65_000) : 30_000;
    return perDay ? { ok: false, error: msg, retry: "next" } : { ok: false, error: msg, retry: "same", waitMs: wait };
  }
  if (status >= 500) return { ok: false, error: msg, retry: "same" };
  return { ok: false, error: msg, retry: "next" };
}

async function fetchWithTimeout(url: string, key: string, body: unknown, ms = 240_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------- helpers
export function toJsonSchema(schema: z.ZodType): object {
  const s = z.toJSONSchema(schema, { target: "draft-7", unrepresentable: "any" }) as Record<string, unknown>;
  delete s.$schema;
  return s;
}

export function parseJsonLoose(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(t.slice(a, b + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

export function hash(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 32);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type CacheEntry = { model: string; usage: Usage; data: unknown };

function cachePath(key: string) {
  return path.join(writableDir(path.join("cache", "llm")), key + ".json");
}
function readCache(key: string): CacheEntry | null {
  const p = cachePath(key);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null; // corrupt cache entry: ignore
  }
}
function writeCache(key: string, entry: CacheEntry) {
  try {
    fs.writeFileSync(cachePath(key), JSON.stringify(entry));
  } catch {
    /* cache is best-effort */
  }
}

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
import { AsyncLocalStorage } from "node:async_hooks";
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

/**
 * Every model in the task's chain has used its daily quota. Runs stop cleanly on this (resume tomorrow:
 * completed calls are cached); it is never turned into a "review manually" result.
 */
export class QuotaExhaustedError extends Error {
  constructor(public readonly models: string[]) {
    super(`daily quota reached for ${models.join(", ")}: resume tomorrow (completed steps are cached)`);
    this.name = "QuotaExhaustedError";
  }
}
export const isQuotaExhausted = (e: unknown): e is QuotaExhaustedError => e instanceof Error && e.name === "QuotaExhaustedError";

/** Who a call is for (script + deal): stamped on every line of the call log. */
type RunContext = { script?: string; dealId?: string; caseId?: string };
const runContext = new AsyncLocalStorage<RunContext>();
export function withRunContext<T>(ctx: RunContext, fn: () => Promise<T>): Promise<T> {
  return runContext.run({ ...(runContext.getStore() ?? {}), ...ctx }, fn);
}

/** One JSON line per model call (cached, succeeded or failed) in data/runs/calls-<date>.jsonl: tokens per task and model. */
export function logCall(rec: { task: string; model: string; inputTokens: number; outputTokens: number; ms: number; cached: boolean; ok: boolean; error?: string }) {
  try {
    const line = JSON.stringify({ at: new Date().toISOString(), ...(runContext.getStore() ?? {}), ...rec, error: rec.error?.slice(0, 200) });
    fs.appendFileSync(path.join(writableDir("runs"), `calls-${new Date().toISOString().slice(0, 10)}.jsonl`), line + "\n");
  } catch {
    /* logging is best-effort */
  }
}

/** Free tiers cap requests per minute: space out model requests (LLM_MIN_INTERVAL_MS, default 4 s ≈ 15/min). */
let nextSlot = 0;
async function throttle() {
  const gap = Number(process.env.LLM_MIN_INTERVAL_MS ?? 4000);
  if (gap <= 0) return;
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + gap;
  if (wait) await sleep(wait);
}

/** Models whose daily quota is used up, remembered until Google's reset (midnight Pacific) so runs skip them. */
const quotaDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
function exhaustedFile() {
  return path.join(writableDir("cache"), "quota-exhausted.json");
}
function exhaustedToday(): Set<string> {
  try {
    const j = JSON.parse(fs.readFileSync(exhaustedFile(), "utf8")) as Record<string, string>;
    return new Set(Object.entries(j).filter(([, day]) => day === quotaDay()).map(([m]) => m));
  } catch {
    return new Set();
  }
}
function markExhausted(model: string) {
  try {
    const f = exhaustedFile();
    const j = fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, "utf8")) as Record<string, string>) : {};
    j[model] = quotaDay();
    fs.writeFileSync(f, JSON.stringify(j, null, 1));
  } catch {
    /* best effort */
  }
}

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
type UsageRecord = { task: Task; model: string; usage: Usage; ms: number; cached: boolean };
const globalUsage: UsageRecord[] = [];
/** Per-review usage, so deals reviewed in parallel don't mix their token counts. */
const usageScope = new AsyncLocalStorage<UsageRecord[]>();
const usageLog = { push: (r: UsageRecord) => (usageScope.getStore() ?? globalUsage).push(r) };

/** Run fn with its own usage log; returns the result and every model call made inside it. */
export async function withUsage<T>(fn: () => Promise<T>): Promise<{ result: T; usage: UsageRecord[] }> {
  const usage: UsageRecord[] = [];
  const result = await usageScope.run(usage, fn);
  return { result, usage };
}

/** Model calls made so far in the current withUsage() scope. */
export function currentUsage(): UsageRecord[] {
  return [...(usageScope.getStore() ?? [])];
}

export function drainUsage() {
  return globalUsage.splice(0, globalUsage.length);
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
        logCall({ task, model: hit.model, inputTokens: 0, outputTokens: 0, ms: 0, cached: true, ok: true });
        return { ok: true, data: parsed.data, model: hit.model, usage: hit.usage, cached: true, ms: 0 };
      }
    }
  }

  const started = Date.now();
  let lastError = "";
  let prompt = input;
  // Attempt 1 + one retry on invalid JSON / schema mismatch (CLAUDE.md).
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await generateWithFallback(task, system, prompt, jsonSchema); // throws QuotaExhaustedError when the chain is out of daily quota
    if (!res.ok) {
      logCall({ task, model: modelsFor(task).join(","), inputTokens: 0, outputTokens: 0, ms: Date.now() - started, cached: false, ok: false, error: res.error });
      return fail(res.error);
    }
    const json = parseJsonLoose(res.text);
    const parsed = json === undefined ? null : schema.safeParse(json);
    if (parsed && parsed.success) {
      const ms = Date.now() - started;
      writeCache(key, { model: res.model, usage: res.usage, data: parsed.data });
      usageLog.push({ task, model: res.model, usage: res.usage, ms, cached: false });
      logCall({ task, model: res.model, inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, ms, cached: false, ok: true });
      return { ok: true, data: parsed.data, model: res.model, usage: res.usage, cached: false, ms };
    }
    // Invalid JSON still cost tokens: log the attempt before retrying.
    logCall({ task, model: res.model, inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, ms: Date.now() - started, cached: false, ok: false, error: "invalid JSON / schema" });
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

/**
 * Total time budget for one model call across all retries and fallback models (LLM_CALL_BUDGET_MS,
 * default 5 min). When it runs out the call fails cleanly → "couldn't complete: review manually",
 * so an overloaded provider can never hang a review (PRD §9.2 System failure).
 */
export function callBudgetMs(): number {
  return Number(process.env.LLM_CALL_BUDGET_MS || 300_000);
}

async function generateWithFallback(task: Task, system: string, input: string, schema: object): Promise<GenOk | GenErr> {
  const errors: string[] = [];
  let deadline = Date.now() + callBudgetMs();
  const timedOut = () => ({ ok: false as const, error: `timed out after ${Math.round(callBudgetMs() / 1000)}s across retries | ${errors.join(" | ")}`.slice(0, 2000) });
  const chain = modelsFor(task);
  const exhausted = exhaustedToday();
  for (const model of chain) {
    if (exhausted.has(model)) continue; // known to be out of daily quota until the reset
    for (let attempt = 0; attempt < 4; attempt++) {
      if (Date.now() >= deadline) return timedOut();
      await throttle();
      const r = await generateOnce(model, thinkingFor(task), system, input, schema, deadline);
      if (r.ok) return r;
      errors.push(`${model}: ${r.error.slice(0, 120)}`);
      if (r.daily) {
        exhausted.add(model);
        markExhausted(model);
        break; // next model in the chain
      }
      if (r.retry === "same" && attempt < 3) {
        if (r.rateLimited) {
          // Per-minute limit: wait exactly what Google asks, then retry. Rate-limit waits don't eat the call budget.
          const wait = r.waitMs ?? 30_000;
          deadline += wait;
          await sleep(wait);
          continue;
        }
        // Overloaded (503) models recover in tens of seconds: back off 15s, 30s, 60s (never past the deadline).
        const wait = r.waitMs ?? 15_000 * 2 ** attempt;
        if (Date.now() + wait >= deadline) return timedOut();
        await sleep(wait);
        continue;
      }
      break; // not found / fatal → next model in the chain
    }
  }
  // Every model in the chain is out of daily quota: stop the run cleanly instead of "review manually".
  if (chain.every((m) => exhausted.has(m))) throw new QuotaExhaustedError(chain);
  return { ok: false, error: errors.join(" | ").slice(0, 2000) };
}

type Once = GenOk | (GenErr & { retry?: "same" | "next"; waitMs?: number; daily?: boolean; rateLimited?: boolean });

async function generateOnce(model: string, thinking: "low" | "high", system: string, input: string, schema: object, deadline: number): Promise<Once> {
  // Each request is cut off at the call deadline (and never waits more than 4 min on its own).
  const ms = Math.max(1_000, Math.min(240_000, deadline - Date.now()));
  const p = provider();
  const key = process.env.LLM_API_KEY;
  if (!key) return { ok: false, error: "LLM_API_KEY is not set", retry: "next" };
  try {
    if (p === "gemini") return await gemini(model, thinking, key, system, input, schema, ms);
    if (p === "anthropic") return await anthropic(model, key, system, input, schema, ms);
    if (p === "openai") return await openai(model, key, system, input, schema, ms);
    return { ok: false, error: `unknown LLM_PROVIDER ${p}` };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 300), retry: "same" };
  }
}

async function gemini(model: string, thinking: "low" | "high", key: string, system: string, input: string, schema: object, ms: number): Promise<Once> {
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
  let res = await fetchWithTimeout(url, key, body(true), ms);
  if (res.status === 400) {
    // Some models reject parts of the schema or the thinking config: retry plain JSON mode.
    const plain = body(false) as Record<string, unknown>;
    (plain.generationConfig as Record<string, unknown>).thinkingConfig = undefined;
    plain.contents = [{ role: "user", parts: [{ text: input + "\n\nReturn JSON matching this JSON Schema:\n" + JSON.stringify(schema) }] }];
    res = await fetchWithTimeout(url, key, plain, ms);
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

async function anthropic(model: string, key: string, system: string, input: string, schema: object, ms: number): Promise<Once> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(ms),
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

async function openai(model: string, key: string, system: string, input: string, schema: object, ms: number): Promise<Once> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(ms),
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
const THINKING: Partial<Record<Task, "low" | "high">> = { nda: "low", brief: "low" };
export function thinkingFor(task: Task): "low" | "high" {
  return THINKING[task] ?? (TIER[task] === "fast" ? "low" : "high");
}

function classifyHttpError(status: number, body: string): GenErr & { retry?: "same" | "next"; waitMs?: number; daily?: boolean; rateLimited?: boolean } {
  const msg = `HTTP ${status}: ${body.replace(/\s+/g, " ").slice(0, 240)}`;
  if (status === 429) {
    // Daily (or zero) quota → this model is done for today. Per-minute → wait the delay Google returns and retry.
    if (/PerDay|limit: 0\b/i.test(body)) return { ok: false, error: msg, retry: "next", daily: true };
    const m = body.match(/"retryDelay":\s*"([\d.]+)s"/) ?? body.match(/retry in ([\d.]+)s/i);
    const wait = m ? Math.min(Number(m[1]) * 1000 + 1000, 180_000) : 30_000;
    return { ok: false, error: msg, retry: "same", waitMs: wait, rateLimited: true };
  }
  if (status >= 500) return { ok: false, error: msg, retry: "same" };
  return { ok: false, error: msg, retry: "next" };
}

async function fetchWithTimeout(url: string, key: string, body: unknown, ms: number): Promise<Response> {
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

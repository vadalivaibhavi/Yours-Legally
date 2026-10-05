# Yours Legally (prototype)
Contract-review assistant for AtliQ (capstone). Spec: docs/PRD_Yours_Legally_v0.9.md (FR-IDs), tests: docs/Eval_Set.md (EV-IDs).

## Stack
Next.js App Router + TypeScript + Tailwind. No auth library (role switch), no database (JSON files in /data + file cache). Deployed on Vercel.

## Rules
- API keys only on the server (route handlers / server actions). Never in client code.
- All LLM calls go through lib/llm.ts; all embeddings through lib/embed.ts; all clause search through lib/clauseIndex.ts.
- Every model output is validated with a zod schema. Retry once on invalid JSON, then return "couldn't complete: review manually".
- Rules (entity, law, payment days, LD/liability caps, insurance, required documents, expiry) are plain TypeScript functions, not prompts.
- Conflict check uses structured register filters only, never similarity search.
- Similar past clauses are reference only: they must never change severity or the verdict.
- Every quoted clause must be string-matched to the source text; drop findings whose quote doesn't match.
- The brief is generated only from structured findings.
- Verdicts: SIGN | SIGN AFTER CHANGES | SEND BACK | HOLD (+ compliance alert). Never recommend Reject. Never say "breach" or "enforceable".
- Decision buttons record status only; nothing is ever sent, signed or emailed.
- Seller role never sees the Register screen, Karandeep's brief, similar clauses or other clients' terms.
- Cache results by document hash in /data/cache.
- Reference FR/EV IDs in commit messages and code comments where relevant.

## Project notes (Next.js 16)
- `proxy.ts` replaces middleware; `cookies()`, `headers()`, `params`, `searchParams` are async.
- LLM provider: Gemini for development; Groq (`LLM_PROVIDER=groq`, off until the foundations are done) is the demo provider, so final eval and cost numbers must come from Groq. Embeddings stay on Gemini.
- `APP_TODAY` (default 2026-10-04) fixes "today" for expiry, due-in and live/expired.
- Scripts: `npm run ingest`, `build:register`, `check:register`, `build:index`, `search`, `build:eval`, `review`, `eval`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Yours Legally, — Prototype Build Plan (v2)

> **Historical plan (13 Oct).** This was the build plan written before coding. The prototype as built is described in the repo README and `docs/Pending_Work.md`; product decisions made while building are in PRD v1.0 (marked *(build)*). Kept for the record; not updated.


**Build mode:** KaVi builds in **Claude Code**; Claude (this chat) writes the phase specs and reviews each phase.
**Deploy target:** Vercel, connected through GitHub in Phase 0.
**LLM + embeddings provider:** needed before Phase 1b (the register extraction is the first real AI call). The build stays provider-neutral; models are compared on the evals in Phase 2.
**Deadline:** not confirmed. Phases are sized in working sessions; PRD §15 gets dates once the deadline is known.
**Source of truth:** `PRD_Yours_Legally_v0.9.md` (FR IDs), `Eval_Set.md` (EV IDs), `Traceability_Matrix.md`.

---

## 1. Setup: Claude Code → GitHub → Vercel

1. Install **Node.js (LTS)**, **Git** and **Claude Code** on your laptop, and create accounts on **GitHub** and **Vercel** (the free Hobby plan is enough).
2. Create an empty folder, e.g. `C:\yours-legally`, separate from the capstone folder, and open Claude Code in it.
3. Copy these into a `docs/` subfolder so Claude Code can read them: `PRD_Yours_Legally_v0.9.md`, `Eval_Set.md`, `Obligations_Register.md`, `Step0_Answer_Key.md`, `Build_Plan.md`, `Phase1_Spec.md` … `Phase5_Spec.md`. Copy the dataset into `data/raw/`, keeping the dataset's folder structure.
4. Create `CLAUDE.md` in the root with the project rules in §4. Claude Code reads it at the start of every session.
5. Ask Claude Code to create the GitHub repo and push. In Vercel, go to **Add New → Project**, import the repo, then add the environment variables (§2). After that, every push to `main` deploys automatically, and each branch gets its own preview URL.
6. Run locally with `npm run dev` while building. Push when a phase's exit check passes.

**Working style in Claude Code**
- Start each phase in **plan mode** (Shift+Tab). Paste the phase spec, review its plan, then let it build.
- Commit after each working step. If something goes wrong, you can go back.
- Ask it to run the evals itself (`npm run eval`), and paste the results here for review.
- Keep `.env.local` out of Git. Claude Code should set up `.gitignore`; check that it did.

**Why deploy in Phase 0:** build errors, missing environment variables and timeouts are easy to fix while the app is small, not in demo week. Vercel's free plan limits how long a server function can run, which is why the register and the clause index are pre-built and results are cached.

---

## 2. Model choice: why the build doesn't depend on it

| Rule | In code |
|---|---|
| One LLM wrapper | `lib/llm.ts` → `callModel({task, system, input, schema})`. Changing provider touches this file and the environment variables only. |
| One embedding wrapper | `lib/embed.ts` → `embed(texts[])`. Use any embeddings API. Anthropic doesn't offer one, so pair Claude with e.g. Voyage AI, or use OpenAI or Gemini embeddings. Changing it means re-running the index script once. |
| Structured outputs | Every AI step returns JSON validated with zod. The UI never parses free text. |
| Model per task in config | `extract` and `route` use the fast model; `conflict`, `playbook`, `brief` and `differs` use the strong one. |
| Inputs fit in context | A contract is a few thousand tokens. Only filtered register entries and the top-3 similar clauses are sent, never everything. |
| Evals decide | Swapping a model means running `npm run eval`, and the scores decide. The same run produces the token counts for the cost estimate. |
| Cache | Results are stored by document hash, so re-runs of unchanged documents are instant and free. |

**Environment variables:** `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL_FAST`, `LLM_MODEL_STRONG`, `EMBED_PROVIDER`, `EMBED_API_KEY`, `EMBED_MODEL`.

---

## 3. Retrieval design (decided 4 Oct)

| | Conflict check (F3) | Similar past clauses (F4, FR-22) |
|---|---|---|
| Question | "Does any live commitment apply to this deal?" | "Have we signed something like this before, and how did we decide?" |
| Method | **Structured filter** on register fields (type, entity and affiliates, sector, region, services, assets, dates) → filtered entries go to the reasoning model | **Vector similarity**: incoming clause embedding vs the signed clause index, filtered by clause type, top 3 above a threshold |
| Why | A miss is the worst failure, so matching must be exact and testable | A near miss costs little; it's reference material, never a decision input |
| Effect on verdict | Sets blockers | **None.** Shown beside the playbook finding, with its intent label |

**Clause index:** each signed contract is split into clause chunks: `{id, contract, date, entity, side, clause_no, heading, text, clause_type, label}`. The label (standard / exception / concession / accident / untagged) comes from `Obligations_Register.md` §C/§E. Chunks are embedded **once by a script** and saved to `data/clause_index.json`.

**Storage:**
- **Prototype:** the index file, with cosine similarity in code. A few hundred clauses is instant.
- **Production:** Postgres with a vector extension, so the register, deals, clauses and vectors live in one database. The swap sits behind `lib/clauseIndex.ts` (`search(text, clauseType, k)`).
- **Optional:** if you want a real vector database in the demo, add Neon Postgres + pgvector from Vercel's marketplace in Phase 2. That's about +½ session.

---

## 4. `CLAUDE.md` (paste as-is)

```
# Yours Legally, (prototype)
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
```

---

## 5. Phases

| Phase | What gets built | Exit check (reviewed here before moving on) | Size |
|---|---|---|---|
| **0. Setup** | Next.js app; pages: Queue `/`, Deal `/deal/[id]`, Brief `/deal/[id]/brief/[v]`, Register `/register`; role switch; stub `lib/llm.ts` and `lib/embed.ts`; GitHub + Vercel | Live URL; Register hidden for the Seller role | 1 session |
| **1. Data layer** | `scripts/ingest.ts`: dataset → `data/deals.json`, `documents.json` (text + metadata), `notes.json`, `entities.json`, one-time tracker import. `scripts/buildRegister.ts`: AI extraction → `register.json`, compared with `Obligations_Register.md`. `scripts/buildClauseIndex.ts`: signed contracts → clause chunks + labels + embeddings → `clause_index.json`. `playbook.json`, `required_docs.json`. Eval set as test fixtures. | Register matches the hand-built one (Al Noor live to ~2029, Orbit expired, Northwind IP present). Clause index covers all readable signed contracts, with labels on Acme, Al Noor, Brightwater, Meridian, Northwind and CareBridge. Queue lists the 7 open deals. | 2–3 sessions |
| **2. Review engine** | F2 (extract → gate rules → NDA routing) → F3 (structured conflict check) → F4 (playbook, mirror mode, NDA mutuality, **similar past clauses** with a "how it differs" line) → F5 (required documents + notes) → F6 (brief from findings, citation check). `npm run eval` covers EV-01–15 and EV-P1–P7. | Core cases pass: Lakeshore, Gulf Crown, Rheinwerk, FinServe (fast lane), Harrington (compliance alert), Datavane, Kriti. Clean cases (LoopMart, Sunrise SOW-2, Orbit expired) raise no blockers. EV-P recall@3 ≥80%, with the verdict unchanged by the panel. | 4 sessions |
| **3. Karandeep's UI** | Queue showing due in / overdue; deal page; upload with deal linking (auto / ask once / new); brief: verdict, ≤3 blockers, side-by-side clauses, **expandable "similar past clauses" under each key clause**, decision panel (recorded, never executed); Contract facts card; Register screen (Verify / Edit / Reject); "Input added → re-check" with one version pair; pinned compliance alert | Rheinwerk end to end on the live URL, plus the Harrington alert and the Gulf Crown LD panel showing Acme (standard) / Al Noor (one-off) / Brightwater (accident) | 3 sessions |
| **4. Seller side (thin)** | Deal form, heads-up stamped "as of [date]", re-check banner | BlueOrchid and Lakeshore seller cases (EV-S1, EV-S2) | 1–2 sessions |
| **5. Deploy and document** | Final deploy; README covering what it is, the architecture (incl. the two retrieval modes), how to run it, eval results, dataset additions and synthetic cases, known limits; demo rehearsal | Live URL + README + eval table | 1 session |

**Faked or left out on purpose:**
- **Real login:** a role switch stands in for it.
- **Counsel-pack export:** a static preview only.
- **Playbook proposals (FR-16):** not built.
- **Late-finding detection (FR-18):** not built.
- **Email, Drive or calendar intake:** not built.

All of these are declared in the README.

---

## 6. Phase 0 prompt (paste into Claude Code, in plan mode)

> Read CLAUDE.md and docs/PRD_Yours_Legally_v0.9.md (§9.1 output spec, §6 FRs).
> Set up the Phase 0 skeleton from docs/Build_Plan.md §5:
> - Next.js App Router + TypeScript + Tailwind app named "Yours Legally,".
> - Pages: `/` Queue, `/deal/[id]` Deal, `/deal/[id]/brief/[v]` Brief, `/register` Register, with placeholder content and a clean, professional layout.
> - A role switch in the header (Karandeep / Seller), kept in a cookie. Hide and block `/register` for Seller.
> - `lib/llm.ts` with `callModel({task, system, input, schema})`, which reads the environment variables from Build_Plan §2, picks the model by task, and validates with zod. Return mock data for now.
> - `lib/embed.ts` with `embed(texts: string[]): number[][]` (mock for now).
> - `lib/clauseIndex.ts` with `search(text, clauseType, k)` (mock for now).
> - `.env.example` listing the variables, plus a `.gitignore` that excludes `.env.local` and `data/cache`.
> - Then initialise git, create a GitHub repo named `yours-legally`, and push.

**Exit check:** Vercel URL loads; switching to Seller hides the Register page; no keys in the repo.

## 7. Next

Each phase has its own spec with steps, exit check and ready-to-paste prompts:

| Phase | Spec | Key decisions inside |
|---|---|---|
| 1. Data layer | `Phase1_Spec.md` | LLM + embeddings provider before 1b; fixed `APP_TODAY` |
| 2. Review engine | `Phase2_Spec.md` | Verdict is computed by code; similar clauses attached after severity; step-wise API calls for Vercel limits |
| 3. Karandeep's UI | `Phase3_Spec.md` | Interaction state in browser storage behind `lib/store.ts` (+ Reset demo); /metrics shows the North Star |
| 4. Seller side | `Phase4_Spec.md` | Code-first rate/region checks; redaction guardrail; demo waiver control |
| 5. Deploy & document | `Phase5_Spec.md` | Demo passcode + provider spend limits; cost-report for Step 4; 5-minute demo path |

Send the Phase 0 URL and repo link first, then each phase's exit-check outputs.

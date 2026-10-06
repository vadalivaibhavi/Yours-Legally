# Yours Legally,

A contract-review assistant for AtliQ, a 2-entity analytics company with no legal team. It gives AtliQ the memory it lacks. It builds a **commitments register of everything AtliQ has already promised**, checks every incoming and outgoing contract against that register and AtliQ's own negotiation playbook, and hands the CEO (Karandeep) a **verdict-first, cited, decision-ready brief**. Sellers get a dated heads-up before they promise a client anything.

Capstone prototype. Spec: [`docs/PRD_Yours_Legally_v0.9.md`](docs/PRD_Yours_Legally_v0.9.md) (FR IDs) · tests: [`docs/Eval_Set.md`](docs/Eval_Set.md) (EV IDs) · plan: [`docs/Build_Plan.md`](docs/Build_Plan.md) and [`docs/Phase1_Spec.md`](docs/Phase1_Spec.md).

> Decision support, not legal advice. The product records decisions; it never sends, signs or contacts anyone.

---

## What you can do in it

| Who | Screen | What it does | PRD |
|---|---|---|---|
| Karandeep | **Queue** `/` | Every open deal with "due in X days" / "overdue" (from a fixed demo date), status incl. *waiting for input (owner)*, latest verdict. Deadline orders the list; it never changes risk. | F8 · FR-14 |
| Karandeep | **Brief** (opens in place on the deal page) | Verdict + next action → pinned compliance alert → ≤3 blockers with both clauses side by side → waiting for input (upload slot, re-check) → must fix → please confirm (from notes) → worth negotiating → what's fine / what wasn't seen → deal bundle → contract facts card → counsel pack → decision & feedback panel. Every key clause has an expandable **similar past clauses** panel. | F6 · FR-11, FR-12, FR-17, FR-21, FR-22 |
| Karandeep | **Commitments register** `/register` | All commitments AI-extracted from the 17 signed documents, in two lists: *Restrictions* (can block a new deal: non-competes, exclusivity, pricing promises, IP given away) and *Duties* (must keep performing: data location, breach-notice windows, insurance, audits). Live / expired / unknown, filters that apply instantly, source clause + definitions, Verify / Edit / Reject, the open deals each entry affects, coverage gaps. | F1 · FR-1, FR-2 |
| Anyone | **Upload** `/upload` | Upload a draft; it's extracted, linked to its deal (auto when certain, asks once when ambiguous, new deal otherwise), and a new brief version is issued. | FR-3, FR-17 |
| Seller (one shared role) | **Deal** `/deal/[id]` | Every deal is visible to sellers. Deal check (client, sector, regions and services required, otherwise "not evaluated"): client, sector, regions/sites, services, rates by role, tools to reuse, data handling, free text → per item clear / needs attention / conflict / couldn't check, stamped "as of [date]", never revealing another client's name or rates. Re-check banner when Karandeep re-checks the deal or the register changes. | F7 · FR-13, FR-19 |

**Signed copies close a deal.** Upload the signed, final copy into a deal (*Upload signed copy*, or tick "This is the signed, final copy") and the deal becomes **Signed**, whatever the brief or a draft decision said: it leaves the active queue (listed under *Signed*), and the commitments in the signed text are extracted into the register with the same extractor and rules as the original 17 contracts (`lib/registerExtract.ts`, unverified until Karandeep verifies them). Every later review and seller check uses them, and open deals are flagged for re-check. If the extraction can't run (quota, model busy) the deal is still Signed and shows *Add to register* to retry. No brief is made for a signed copy.

**Review workflow.** Every reaction, confirmation and the chosen decision saves the moment it is made ("Saving… / Saved ✓"), and every choice can be changed. A chosen decision is a draft: the queue shows "Review in progress x/y" until every blocker and high finding has a reaction (medium items are worth negotiating, not deal-breaking, so they are optional), notes facts behind a compliance event are answered and a decision is chosen; the brief then prompts **Finalise review**, and only then does the deal show as Decided. Changing anything afterwards reopens the review. Every action is kept in the audit log (`data/state`), not shown in the UI. Queue status colours: green = decided, orange = in progress, red = waiting for input, blue = not started; the verdict column is plain text. Model wording is kept plain: lawyer jargon like "redline" is rewritten ("ask for changes to …") by the same guardrail that removes "breach".

**Roles.** A role switch in the header stands in for sign-in: Karandeep, or Seller (one shared view for Bhavin, Dhaval and Jay). Sellers see every deal's seller side, never the register, a brief, similar clauses or other clients' terms. `proxy.ts` blocks those routes and every page and server action re-checks the role.

---

## Architecture

```
signed contracts ──► F1 register build (strong model, 1 call/doc) ──► data/register.json ──┐ structured filter
                 └─► clause chunking + intent labels + embeddings ──► data/clause_index.json ──┐ vector similarity
                                                                                            │  │
draft ─► F2 extract (fast) ─► gate RULES ─► route ─┬─ NDA fast lane: mutuality checklist ───┤  │
                                                   └─ full review: F3 conflict ◄────────────┘  │
                                                                   F4 playbook / mirror / flow-down
                                                                   F5 bundle RULES + notes scan
                         findings ─► verdict RULES ─► F6 brief text (from findings only)
                                                   └─► similar past clauses attached AFTER the verdict ◄┘
```

**Rules where a rule works, AI where judgment is needed (PRD §5).**
- *Plain TypeScript rules* (`lib/review/gate.ts`, `verdict.ts`, `bundle.ts`, `lib/dates.ts`): entity vs client country, parties = invoicing entity, governing law vs entity, payment ≤ 45 days, LDs capped and never on contract value or per day, liability capped, insurance asked vs held, annexes present, required documents per party, expiry / live status, the verdict itself.
- *AI* (`lib/llm.ts`, one provider-neutral wrapper): fact extraction with verbatim snippets, collision reasoning over definitions and scope, playbook / mirror / flow-down comparison, NDA mutuality, notes scan, "how it differs" lines, the headline. Every output is validated with zod; on invalid JSON it retries once, then returns *"couldn't complete: review manually"*. A failed step can never produce a clean verdict.

**Two retrieval modes, each where it fits (Build Plan §3).**

| | Conflict check (F3) | Similar past clauses (F4, FR-22) |
|---|---|---|
| Question | Does a live commitment apply to this deal? | Have we signed something like this, and how did we decide? |
| Method | **Structured filter** on register fields (`lib/review/conflict.ts → filterRegister`): type, bound entity incl. affiliates, sector, region (GCC expanded), assets, live status. The model then reasons only over the filtered entries. | **Vector similarity** (`lib/clauseIndex.ts → search`): same clause type, cosine, one hit per contract, repeated positions collapsed to their origin (Acme for the LD standard), labelled near-ties preferred, top 3 above a threshold. |
| Why | A miss is the worst failure: matching must be exact and testable. | A near miss costs little: it's reference material. |
| Effect on verdict | Sets blockers | **None.** `computeVerdict()` takes findings only; the eval checks every brief's verdict with and without the panel. |

**Guardrails in code.**
- Every quote is string-matched to its source (`lib/quotes.ts`). Findings without a valid citation are dropped.
- Model-written prose is sanitised: no "breach" or "enforceable" conclusions, and Reject is never recommended (`guardrails.ts`).
- Expired commitments are never candidates.
- Unverified register entries are used immediately but labelled.
- On AtliQ's own paper, findings are "fix before sending", not blockers.
- A note can close a compliance alert, but never a contractual blocker.
- Similar clauses are Karandeep-only.

**Storage.** No database (Build Plan §4). Pre-built JSON in `data/` (committed) plus runtime state (uploads, decisions, reactions, verification, seller checks, audit log) in one JSON file: `data/state/` locally, `/tmp` on Vercel. Model results are cached by request hash in `data/cache/`. Production would move the register, deals, clauses and vectors into Postgres + a vector extension, behind the same `lib/clauseIndex.ts` / `lib/register.ts` interfaces.

**Model choice.** Provider-neutral: `LLM_PROVIDER` = `gemini` | `anthropic` | `openai` | `mock`. Each task has a tier: `extract`, `route` and `classify` use the fast model; `register`, `conflict`, `playbook`, `nda`, `notes`, `differs` and `brief` use the strong one. Each tier is a comma-separated fallback chain. The prototype runs on Google Gemini (flash for strong, flash-lite for fast; `gemini-embedding-001` at 768 dims).

### Code map

```
app/            Queue, deal, brief, register, upload pages + server actions (app/deal/actions.ts, app/upload/actions.ts)
components/     FindingCard (clauses side by side, precedent, similar clauses, reactions), SellerCheckPanel, RegisterActions, ui
lib/llm.ts      the one LLM wrapper          lib/embed.ts       the one embedding wrapper
lib/clauseIndex.ts  clause search (FR-22)    lib/register.ts    effective register (+ Verify/Edit/Reject overlay)
lib/review/     extract · gate · conflict · playbook (incl. NDA) · similar · bundle · notes · verdict · effective · pipeline
lib/seller.ts   seller deal check            lib/linking.ts     deal linking on upload
lib/store.ts    runtime state + audit log    lib/types.ts       zod schemas for every data shape
scripts/        ingest · buildRegister · checkRegister · buildClauseIndex · search · buildEvalCases · review · eval
data/           raw dataset, seeds, register.json, clause_index.json, playbook.json, required_docs.json, briefs/, runs/
```

---

## Run it

Requirements: Node 20+ (built on Node 24), npm.

```bash
npm install
cp .env.example .env.local   # then add LLM_API_KEY / EMBED_API_KEY
npm run dev                  # http://localhost:3000
```

The committed `data/` already holds the register, clause index and one brief per deal, so the app works without running any script. To rebuild from the dataset:

| Command | Phase | What it does |
|---|---|---|
| `npm run ingest` | 1a | Dataset → documents, notes, deals, company facts (hand-checked map + `data/seed/deals.seed.json`) |
| `npm run build:register` | 1b | One strong-model call per signed document → `data/register.json` (quotes verified, status from `APP_TODAY`, waivers linked) |
| `npm run check:register` | 1b | Compares with the hand-built key `data/expected/register.expected.json` |
| `npm run build:index` | 1c | Clause chunks + labels + embeddings → `data/clause_index.json` |
| `npm run search -- "liquidated damages 1% per week uncapped" ld` | 1c | Smoke test of similar-clause search |
| `npm run build:eval` | 1d | `docs/Eval_Set.md` + `eval/case_keys.json` → `eval/cases.json` |
| `npm run review` (or `-- --deal gulfcrown`) | 2 | Review pipeline → `data/briefs/<deal>.json` (v1 per deal). Resumable: skips deals whose brief is complete and built from the current inputs (`--force` to redo) |
| `npm run eval` (or `-- --case EV-10`, `-- --deal kriti`) | 2 | EV cases → `eval/results.md`; a filtered run updates its cases inside the last full report |
| `npm run pending` (or `-- --deal kriti`) | – | Regenerates the auto part of `docs/Pending_Work.md` (with `--deal`: prints that deal's pending items) |

**Free tier.** Everything runs one deal and one case at a time, with model calls spaced `LLM_MIN_INTERVAL_MS` apart. A per-minute 429 waits the delay Google returns and retries. When a model's daily quota is used up, the next model in its chain is tried. When the whole chain is out, the run stops with "daily quota reached, resume tomorrow": nothing incomplete is written, and the same command resumes after the reset (midnight Pacific), because finished calls are cached and complete briefs are skipped. Eval cases stopped by quota are reported as "not run (quota)", never as failures. In the app, a re-check, upload or seller check that hits the daily quota shows a message instead of an error.

Every model call (input/output tokens, task, model, deal, eval case, cache hit or not) is appended to `data/runs/calls-<date>.jsonl`; each review run also writes `data/runs/review-<time>.json` with a per-task, per-model token summary (input for the cost estimate).

### Environment

| Variable | Example | Notes |
|---|---|---|
| `LLM_PROVIDER` | `gemini` | `gemini` (development) · `groq` (demo) · `anthropic` · `openai` · `mock` |
| `GROQ_API_KEY` / `GROQ_MODEL_FAST` / `GROQ_MODEL_STRONG` | — / `openai/gpt-oss-20b` / `openai/gpt-oss-120b` | used only when `LLM_PROVIDER=groq`; `LLM_API_KEY` stays the Gemini key |
| `LLM_API_KEY` | | server-only; never in client code |
| `LLM_MODEL_FAST` | `gemini-flash-lite-latest,gemini-3.5-flash-lite` | comma = fallback chain |
| `LLM_MODEL_STRONG` | `gemini-flash-latest,gemini-3.5-flash,…` | comma = fallback chain |
| `EMBED_PROVIDER` / `EMBED_API_KEY` / `EMBED_MODEL` | `gemini` / same key / `gemini-embedding-001` | `local` works offline (hashed bag-of-words) |
| `LLM_CALL_BUDGET_MS` | `300000` | total time for one model call across retries and fallbacks; then it fails cleanly to "review manually" (waiting out a per-minute 429 doesn't count) |
| `LLM_MIN_INTERVAL_MS` | `4000` | minimum gap between model calls (free-tier pacing; `0` on a billed key) |
| `REVIEW_CONCURRENCY` | `1` | deals reviewed at once by `npm run review` (dependants wait for their client deal); raise it on a billed key |
| `APP_TODAY` | `2026-10-04` | fixed "today" so expiry, due-in and evals are reproducible |

### Switching to Groq (demo provider)

Gemini is for development only; the demo, the final eval numbers and the cost estimate come from Groq. The Groq adapter (`lib/llm.ts`, OpenAI-compatible API) is built and **off** until the review engine and screens are done on Gemini. Embeddings stay on Gemini: Groq has no embedding model, and the clause index is built once.

1. In the Groq console, **set a spending limit first**, then create a paid API key.
2. In `.env.local`: `LLM_PROVIDER=groq` and `GROQ_API_KEY=…` (models default to `openai/gpt-oss-20b` fast and `openai/gpt-oss-120b` strong). On the paid tier, also set `LLM_MIN_INTERVAL_MS=0` and `REVIEW_CONCURRENCY=3`.
3. `npm run eval` once. Every step re-runs: the cache and the brief hashes are per provider, so no Gemini answer is reused. Expect some prompt fixes, because a different model behaves differently.
4. Pre-warm: `npm run review -- --force`, so every committed brief is regenerated on Groq. `npm run eval` warns about any brief still made on Gemini.
5. Record the final numbers: `npm run eval` (the report header names the provider and models) and `npm run cost -- --provider groq` (Groq list prices per model, from the per-call log).

### Deploy (GitHub → Vercel)

1. Create an empty **private** GitHub repo named `yours-legally`, then from this folder:
   ```bash
   git remote add origin https://github.com/<you>/yours-legally.git
   git push -u origin main
   ```
2. In Vercel: **Add New → Project**, import the repo, add the environment variables above, deploy. Every push to `main` redeploys; branches get preview URLs.
3. `next.config.ts` ships `data/**` with the serverless functions. Pages that re-check set `maxDuration = 300`. `.env.local` is gitignored.

---

## Eval results

Full table: [`eval/results.md`](eval/results.md) (regenerate with `npm run eval`). Last run: **42 passed · 4 failed · 4 skipped of 50 cases** (best single run so far: 47). Skipped: EV-V1–V3 (version pairs need model calls; all three passed in the previous full run) and EV-V4 (FR-18 not built).

| PRD §11 dimension | Threshold | Result |
|---|---|---|
| Register accuracy & coverage (EV-R1–R5) | ≥90% fields exact, 100% live restrictions | 7/7 must-have entries, 86/86 fields exact; Orbit expired + illegible §9.1 reported; unverified label works |
| Verdicts on incoming contracts (EV-01–15) | expected verdict, must-find, must-not-flag | 11/15: Gulf Crown, Lakeshore, BlueOrchid, Rheinwerk, FinServe (fast lane), LoopMart (clean), Sunrise (clean), Marcus, Ortiz, EV-14, EV-15 |
| Compliance alerts & notes (EV-C1–C2) | alert closed by note; note never clears a blocker | 2/2 |
| Deal linking (EV-L1–L6) | auto when certain, ask when ambiguous, user choice final | 6/6 |
| Access control (EV-A1–A3) | sellers can't see brief/register/other deals/other clients' rates | 3/3 |
| Seller checks (EV-S1–S8) | expected status per item; unmatched → couldn't check; banner on change | 8/8 |
| Similar past clauses (EV-P1–P7) | recall@3 ≥80%, labels right, verdict unchanged | recall@3 **100%** (10/10); verdict identical with and without the panel on all 13 briefs |
| Citation validity | 100% | 136/136 quotes string-matched to source |
| Guardrails | 0 legal conclusions, 0 Reject | 0 / 0 across 520 model-written strings |

**The 4 failures, honestly.** All four are judgment calls where the model's answer varies between runs; the deterministic checks don't vary.
- **EV-03 TravelHub:** HOLD instead of SEND BACK. The model reads TravelHub (a hotel distribution platform building hotel-ranking AI for UAE/KSA hotels) as squarely inside Al Noor's "Hospitality Business" definition; the answer key calls it arguable, for counsel. The system errs cautious: it blocks rather than misses.
- **EV-05 Datavane:** SIGN AFTER CHANGES instead of HOLD. The CloudSpan exclusivity collision *is* found, but this run judged it fixable by carving India + GCC out of the territory (high, not blocker); the previous run called it a blocker.
- **EV-10 Kriti / EV-12 Harrington:** one IP finding each (Kriti's IP flow-down to Rheinwerk; Harrington's background-IP assignment) was found in earlier runs and missed in this one. Both verdicts are right.
- In earlier runs, EV-11 (Marcus) and EV-13 (Ortiz) failed instead. Marcus flags a real tools-licence gap the answer key doesn't list. Ortiz was fixed by aligning the termination rule with the Rohan Iyer precedent.

The briefs were produced over several runs because Gemini's **free tier** allows 20 requests per model per day per project. On the free tier, run `npm run review` once a day until it finishes without the quota message: each run picks up where the last one stopped. On a billed key (`LLM_MIN_INTERVAL_MS=0`, `REVIEW_CONCURRENCY=3`) one run regenerates everything.

**Cost (from `npm run cost`, Gemini flash pricing placeholders $0.30 / $2.50 per 1M tokens):** register build ≈ $0.35 one-off for 17 contracts; a review ≈ 9.6k input / 8.6k output tokens ≈ $0.02–0.07 per deal, so roughly **$0.25–0.50/month at 9–20 contracts**, model cost only. NDA fast lane ran in 15 s when the model wasn't overloaded (one run took 365 s waiting out 503 "high demand" retries on the free tier).

---

## Dataset: what was added or hand-prepared (declared, per the brief)

**Hand-prepared seeds** (stand-ins for one-time human work, PRD §14 Stage 2):
- `data/seed/deals.seed.json`: deal grouping + linking (Harrington MSA+BAA with the signed NDA as context; Ortiz → Harrington; Kriti → Rheinwerk; Marcus → Lakeshore), deadlines from the 22 Sep meeting and tracker notes. Stands in for the tracker import + linking.
- `data/seed/labels.seed.json`: intent labels (standard / exception / concession / accident) for past clauses, from `Obligations_Register.md` §C/§E/§G. Stands in for Karandeep's ~30-minute tagging session.
- `data/seed/company.seed.json`: entities from the finance sheet; insurance held = $1M cyber only (everything else unknown); client list by sector for the reverse covenant scan.
- `data/playbook.json`: 14 rules from the checklist, negotiation notes and register §G, **seeded as approved on Karandeep's behalf**.
- `data/required_docs.json`: deal type → documents per party.
- `data/expected/register.expected.json`: the hand-built register answer key.

**Synthetic documents and inputs** (teaching material, clearly marked in each file):
- `data/synthetic/travelhub_v2_entity_fixed.md`: TravelHub revised draft with Pvt Ltd as the party (EV-V1).
- `data/synthetic/rheinwerk_annex3_dpa.md`: Rheinwerk's missing Annex 3 DPA incl. SCCs (EV-V2).
- `data/synthetic/harrington_ortiz_sub_baa.md`: subcontractor BAA for Daniel Ortiz (EV-V3).
- `data/seed/seller_checks.seed.json`: Jay's BlueOrchid deal check declaring "India hotels only" (EV-15, FR-20).
- Seller-check inputs (EV-S1–S8), deal-linking uploads (EV-L3, EV-L4) and a synthetic Saudi hotel waiver (EV-S8) live in `eval/case_keys.json`.

---

## Faked or left out on purpose

- **Real login:** a role switch stands in for SSO.
- **Counsel-pack export:** a static preview inside the brief; nothing is sent.
- **Playbook proposals (FR-16):** not built. "+ Something the brief missed" and reactions are recorded in the audit log for that loop.
- **Late-finding detection (FR-18):** not built (EV-V4 is reported as skipped).
- **Email, Drive or calendar intake:** not built. Upload only, with a one-time tracker import.
- **PDF / OCR upload:** the prototype reads `.md` / `.txt` (the dataset is already text; the scanned Orbit file keeps its OCR errors and illegible clause).

## Pending work

Everything that couldn't be run or checked yet because of model quota or tooling is tracked in [`docs/Pending_Work.md`](docs/Pending_Work.md); `npm run pending` refreshes its auto-detected part.

## Known limits

- **Free model tier.** Gemini's free tier allows about 20 requests per model per day, so the review uses fallback chains and caches every call. A full review of all 13 deals is about 60 strong-model calls. A real deployment needs a paid key; the cost estimate uses `data/runs/`.
- **Fallback models.** On the free tier you can append flash-lite models to `LLM_MODEL_STRONG` so a review completes when the flash quota is gone (that's how the last 5 deals were produced). Quality drops on mirror / flow-down reasoning (EV-10, EV-13). Without them, a quota failure gives "couldn't complete: review manually" and HOLD, never a clean verdict.
- **Model variance.** In EV-V1, low-severity playbook notes on *unchanged* text differed between v1 and v2 (lite model). That's exactly what late-finding detection (FR-18, not built) is meant to catch. Severity on interpretive points can move between runs; deterministic rules pin the critical ones (entity, LD base/cap, payment, liability, insurance, required documents, expiry), and the verdict is computed by rule. The 3-run consistency eval (PRD §11) is not automated: results are cached by input hash, so re-runs of unchanged documents are identical by construction.
- **State on Vercel is ephemeral** (`/tmp`): uploads, decisions and verifications reset when the function instance is recycled. The committed briefs always load.
- **The register is only as complete as the documents collected:** ~10 referenced contracts are not in the dataset (ShopSwift SOW, PixelCraft, the intercompany services agreement…). Every brief says so under "what wasn't seen".
- The demo date (`APP_TODAY`) is fixed at 4 Oct 2026; event timestamps (decisions, uploads) use the real clock.

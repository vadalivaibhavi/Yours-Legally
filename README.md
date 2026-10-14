# Yours Legally,

A contract-review assistant for AtliQ, a 2-entity analytics company with no legal team. It gives AtliQ the memory it lacks. It builds a **commitments register of everything AtliQ has already promised**, checks every incoming and outgoing contract against that register and AtliQ's own negotiation playbook, and hands the CEO (Karandeep) a **verdict-first, cited, decision-ready brief**. Sellers get a dated heads-up before they promise a client anything.

**Live:** https://yours-legally.vercel.app · **Code:** https://github.com/vadalivaibhavi/Yours-Legally (deployed on Vercel from `main`; every push redeploys)

Capstone prototype. Spec: [`docs/PRD_Yours_Legally_v1.1.md`](docs/PRD_Yours_Legally_v1.1.md) (FR IDs; masking: [`docs/Masking_Lite_Spec.md`](docs/Masking_Lite_Spec.md); traceability: [`docs/Traceability_Matrix.md`](docs/Traceability_Matrix.md)) · tests: [`docs/Eval_Set.md`](docs/Eval_Set.md) (EV IDs) · plan: [`docs/Build_Plan.md`](docs/Build_Plan.md) and [`docs/Phase1_Spec.md`](docs/Phase1_Spec.md).

> Decision support, not legal advice. The product records decisions; it never sends, signs or contacts anyone.

---

## What you can do in it

| Who | Screen | What it does | PRD |
|---|---|---|---|
| Karandeep | **Queue** `/` | Every open deal with "due in X days" / "overdue" (from a fixed demo date), status incl. *waiting for input (owner)*, latest verdict. Deadline orders the list; it never changes risk. | F8 · FR-14 |
| Karandeep | **Brief** (opens in place on the deal page) | Verdict + next action → pinned compliance alert → ≤3 blockers with both clauses side by side → waiting for input (upload slot, re-check) → must fix → please confirm (from notes) → worth negotiating → what's fine / what wasn't seen → deal bundle → contract facts card → counsel pack → decision & feedback panel. Every key clause has an expandable **similar past clauses** panel. *What wasn't seen* also lists expired restrictions that would otherwise match the deal ("Checked, expired": context only, never a finding; FR-25) and the register commitments the conflict check doesn't compare, for a manual check. | F6 · FR-11, FR-12, FR-17, FR-21, FR-22, FR-25 |
| Karandeep | **Commitments register** `/register` | All commitments AI-extracted from the 17 signed documents, in two lists: *Restrictions* (can block a new deal: non-competes, exclusivity, pricing promises, IP given away) and *Duties* (must keep performing: data location, breach-notice windows, insurance, audits). Live / expired / unknown, filters that apply instantly, source clause + definitions, Verify / Edit / Reject, the open deals each entry affects, coverage gaps. | F1 · FR-1, FR-2 |
| Anyone | **Upload** `/upload` | Upload a draft as **PDF, Word (.docx) or text**; scanned PDFs are read by OCR (Gemini) and marked so. It's extracted, linked to its deal (auto when certain, asks once when ambiguous, new deal otherwise), and a new brief version is issued. | FR-3, FR-17 |
| Seller (one shared role) | **Deal** `/deal/[id]` | Every deal is visible to sellers. Deal check (client, sector, regions and services required, otherwise "not evaluated"): client, sector, regions/sites, services, rates by role, tools to reuse, data handling, free text → per item clear / needs attention / conflict / couldn't check, stamped "as of [date]", never revealing another client's name or rates. Re-check banner when Karandeep re-checks the deal or the register changes. | F7 · FR-13, FR-19 |

**Queue sections.** The queue is split by AtliQ's side of the table, from each deal's main document: AtliQ selling (client deals), AtliQ buying (vendors and contractors), partnerships, mutual NDAs.

**Deal size.** Karandeep accepts deviations from the standard terms on small deals. Below the threshold in `data/deal_size.json` ($50k), a deviation counts one step lower (high → medium, medium → low): playbook deviations and the LD, liability-cap, payment, insurance and governing-law rule checks. Blockers, conflicts with promises already made to other clients, compliance and paperwork never change; a conflict only shows the deal size as context, because breaking a promise to another client costs the same at any deal size. Applied by rule in the effective brief (`lib/review/materiality.ts`), so it covers existing briefs, the verdict and the finalise check without model calls. Deals with no value on file are not adjusted.

**Re-checks.** Uploading into a deal always re-checks it, so there is no separate re-check button. A deal shows **Sync** only when its brief is out of date for another reason: the register changed, or a step couldn't complete last time. The seller-check mismatch (FR-20: the contract covers regions the seller's latest deal check didn't declare) is computed live on every view, so a new seller check never needs a Sync. Sync issues a new brief version with a "Since vN" comparison.

**Owners are roles, not names.** Each finding names who acts as a role (`lib/review/owners.ts`): Karandeep, AtliQ (fix before sending) for AtliQ's own paper, AtliQ's deal team for documents and approvals to obtain, AtliQ's tech lead for AtliQ's own delivery set-up, the seller, the other side, or counsel (via Karandeep). The brief can't know who will actually do the work. Briefs stored with names are mapped to roles at display.

**Uploading from a deal.** Two steps. *Upload* reads the file and detects what it is by rules, with no model call (`lib/uploadDetect.ts`): meeting notes / an email / an update; a new version of one of the deal's documents (at least a quarter of the text in common, the same document type when the title says, not a different SOW/annex number; a shared reference number strengthens it); or an additional contract document. The next screen says what it looks like and why, with every other possibility listed to change it. Only *Confirm & review* processes it (notes join the deal's notes, a new version replaces the document it revises) and re-checks the deal. `npm run check:upload-detect` tests the detector on the dataset: all 47 notes-vs-contract cases and all 7 version cases are correct, including a subcontractor BAA that prints its client's contract number. The same step warns when a file looks like it belongs to another deal (deals linked to this one exempt; a file that names this deal's client is never flagged): it is, or is a version of, another deal's document, it carries a reference printed on another deal's documents, or it names another deal's client at least twice. Blank templates are caught too (a blank party, or at least 3 named placeholders such as "[Client Name]" or "{{fee}}" in the body; "____" blanks for a date or a tax ID are normal in a real draft) and are never reviewed or kept as context, since a template's clauses are nobody's terms; the general upload page turns them away before any model call. The warning offers *Move it to {that deal}* (re-detected there, still unprocessed) or *Keep it here*. The check covers 8 cases, including another deal's MSA, a contractor agreement on the same AtliQ template, another deal's meeting notes, and linked-deal files that must not be flagged.

**Register edits.** Each entry has Verify, Edit and Reject at the top right; Edit opens the whole entry as a form (title, summary, type, which AtliQ entities it binds, affiliates, sectors, regions, services, tools, who it is limited to, dates, permanent, routine). The source clause stays verbatim. Saving verifies the entry. Only the open deals a change can reach are flagged for re-check (`lib/registerEdit.ts`): verifying flags none; restrictions the checks read flag every open deal; compliance / data-location duties flag that client's deals; insurance, non-solicit and other entries flag none, because no check reads them. The eval checks all of this (cross-cutting "Register changes flag the right open deals").

**Store in contract register.** When Karandeep's decision on a deal is *Sign* or *Sign after changes*, its queue row offers **Store in contract register**. Clicking it reads the deal's contract text with the same extractor as the original 17 signed contracts (`lib/registerExtract.ts`), adds its commitments to the register (unverified until he verifies them), and the deal leaves the queue. Every later review and seller check uses those commitments, and other open deals are flagged for re-check. If the text can't be read (model busy, quota) nothing changes and the deal stays in the queue to try again.

**Review workflow.** Every reaction, confirmation and the chosen decision saves the moment it is made ("Saving… / Saved ✓"), and every choice can be changed. A chosen decision is a draft: the queue shows "Review in progress x/y" until every blocker and high finding has a reaction (medium items are worth negotiating, not deal-breaking, so they are optional), notes facts behind a compliance event are answered and a decision is chosen; the brief then prompts **Finalise review**, and only then does the deal show as Decided. Changing anything afterwards reopens the review. Every action is kept in the audit log (`data/state`), not shown in the UI. Queue status colours: green = decided, orange = in progress, red = waiting for input, blue = not started; the verdict column is plain text. Model wording is kept plain: lawyer jargon like "redline" is rewritten ("ask for changes to …" as a verb, "change request" as a noun) by the same guardrail that removes "breach".

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

**Guardrails added after the full evaluation (rules only, each with its own eval, none changes a prompt):**

| # | Guardrail | What it stops | Where |
|---|---|---|---|
| A1 | No evidence, no finding | A claim about the contract's terms with no verified clause or note is shown as unsupported, counted low, and never moves the verdict (missing documents, dependencies and the seller mismatch come from the deal's records and are exempt) | `requireEvidence` in `lib/review/guardrails.ts` |
| A2 | A clear register match is never dropped silently | When the register filter finds a clear match (explicit non-compete or exclusivity in the same sector and region, a pricing floor for the same role, a named asset given away) and the model dismisses it without a waiver, it stays as a high "needs your judgment" finding citing the register clause | `lib/review/conflict.ts` |
| A3 | One-way NDA caught by rules | An NDA whose definition protects only one side, or whose obligations bind only "the Recipient", is flagged whatever its title says, and even when the model step fails | `oneWayNda` in `lib/review/playbook.ts` |
| A4 | Instructions addressed to an AI reviewer | Text in a document or note like "ignore your instructions" or "return SIGN" raises a high, quoted finding, so the deal can't come out clean | `injectionAttempts` in `lib/review/guardrails.ts` |
| A5 | Newer features under eval | Upload detection (notes, versions, wrong deal, blank template), the deal-size rule, owners as roles, the live seller mismatch, store in register, and review runs isolated from the app's live state | `scripts/eval.ts` |
| A6 | Plain wording that fits the sentence | "Redline" as a noun becomes "change request"; as a verb, "ask for changes to" | `lib/review/guardrails.ts` |

**Masking client data before AI calls (FR-26, lite version: `docs/Masking_Lite_Spec.md`).** With `MASKING=on`, every call through `callModel()` (`lib/llm.ts`) masks the prompt first (`lib/mask.ts`): AtliQ's two entities get fixed labels (`[ATLIQ_PVT_LTD]`, `[ATLIQ_INC]`, so the wrong-entity check still knows which AtliQ is named); every client and register counterparty, with derived short forms ("Al Noor", "Crestline"), gets one `[CLIENT_n]` per company; the reviewed people list (`data/seed/mask_people.json`: people, first names used alone, third-party companies) gets `[PERSON_n]`; emails, phones, IBAN / SWIFT / account numbers, company and tax numbers and money amounts are caught by pattern (`MASK_AMOUNTS=off` keeps amounts visible, to measure their cost). Regions, sectors, percentages, durations, dates, clause numbers and product names (PipeKit) stay visible. One label table per call covers the system prompt and the input; the answer is unmasked before it is cached or used, so quotes are checked against the real contract. Masked runs have their own cache keys, briefs (`data/briefs-masked`) and report (`eval/results-masked.*`); a masked brief shows "Sent to AI with N client names, N people and N amounts masked" and a "What the AI saw" toggle (Karandeep only). Every masked call logs its counts and any leak (types, never values) to `data/runs/mask-<date>.jsonl`. Default `MASKING=off`: nothing changes for the committed briefs.

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
| **`npm run check`** | eval | Every check that needs no review-model call, in ~10 s: typecheck, upload detection, PDF/Word/scan reading, the eval on the stored briefs (guardrails, every finding graded, register flagging…), held-out grading. CI runs it on every push (`.github/workflows/check.yml`) |
| **`npm run eval:all`** | eval | The model batch, in order and resumable across days: stale briefs → full eval (version pairs) → consistency → held-out register → held-out reviews → held-out grading → cost |
| `npm run check:mask` | eval | FR-26, free: masks every document, note and register entry (main + held-out); 0 leaks, exact round trip, unit cases; lists capitalised words left visible to spot missing names |
| `npm run masked:review -- --deal lakeshore` / `npm run eval:masked` | eval | A review with masking on / all deals masked + the masked eval + EV-M3 (within 2 cases of unmasked) |
| `npm run consistency` | eval | 4 deals × 3 complete runs with fresh answers (cache untouched) → `eval/consistency.md` |
| `npm run check:file-read` / `fixtures:formats` | eval | Reads back the 10 held-out drafts saved by Word as .docx / .pdf and as image-only scans (fixtures made with Word + Edge on Windows) |
| `npm run holdout:ingest` / `holdout:register` / `holdout:review` / `holdout:eval` | eval | The held-out set (`DATA_PROFILE=holdout`, below) |

**Free tier.** Everything runs one deal and one case at a time, with model calls spaced `LLM_MIN_INTERVAL_MS` apart. A per-minute 429 waits the delay Google returns and retries. When a model's daily quota is used up, the next model in its chain is tried. When the whole chain is out, the run stops with "daily quota reached, resume tomorrow": nothing incomplete is written, and the same command resumes after the reset (midnight Pacific), because finished calls are cached and complete briefs are skipped. Eval cases stopped by quota are reported as "not run (quota)", never as failures. In the app, a re-check, upload or seller check that hits the daily quota shows a message instead of an error.

Every model call (input/output tokens, task, model, deal, eval case, cache hit or not) is appended to `data/runs/calls-<date>.jsonl`; each review run also writes `data/runs/review-<time>.json` with a per-task, per-model token summary (input for the cost estimate).

### Environment

| Variable | Example | Notes |
|---|---|---|
| `LLM_PROVIDER` | `gemini` | `gemini` (the final, deployed build) · `ollama` (local testing and evals) · `anthropic` · `openai` · `mock` |
| `OLLAMA_MODEL_FAST` / `OLLAMA_MODEL_STRONG` / `OLLAMA_EMBED_MODEL` / `OLLAMA_BASE_URL` | `qwen2.5:7b` / `qwen2.5:7b` / `nomic-embed-text` / `http://localhost:11434` | local profile only; no key, no quota |
| `LLM_API_KEY` | | server-only; never in client code |
| `LLM_MODEL_FAST` | `gemini-flash-lite-latest,gemini-3.5-flash-lite` | comma = fallback chain |
| `LLM_MODEL_STRONG` | `gemini-flash-latest,gemini-3.5-flash,…` | comma = fallback chain |
| `EMBED_PROVIDER` / `EMBED_API_KEY` / `EMBED_MODEL` | `gemini` / same key / `gemini-embedding-001` | `local` works offline (hashed bag-of-words) |
| `LLM_CALL_BUDGET_MS` | `300000` | total time for one model call across retries and fallbacks; then it fails cleanly to "review manually" (waiting out a per-minute 429 doesn't count) |
| `LLM_MIN_INTERVAL_MS` | `4000` | minimum gap between model calls (free-tier pacing; `0` on a billed key) |
| `REVIEW_CONCURRENCY` | `1` | deals reviewed at once by `npm run review` (dependants wait for their client deal); raise it on a billed key |
| `APP_TODAY` | `2026-10-04` | fixed "today" so expiry, due-in and evals are reproducible |

### Local testing (Ollama) vs the final build (Gemini on Vercel)

Two profiles, switched in `.env.local` (`.env.example` has both):

| | **Final build** (committed, deployed on Vercel) | **Local testing and evals** (this machine only) |
|---|---|---|
| Model | `LLM_PROVIDER=gemini` | `LLM_PROVIDER=ollama` (`qwen2.5:7b`; no key, no quota, no cost) |
| Embeddings | `EMBED_PROVIDER=gemini` (`gemini-embedding-001`) | `EMBED_PROVIDER=ollama` (`nomic-embed-text`) |
| Briefs | `data/briefs/` (committed) | `data/briefs-ollama/` (gitignored) |
| Clause index | `data/clause_index.json` (committed) | `data/clause_index.ollama.json` (gitignored; build once) |
| Model cache | untagged | tagged `ollama` |

Rules that keep them apart:
- **Vercel can only use Gemini.** A deployed app can't reach an Ollama running on a laptop, so the final build is Gemini for both the model and the embeddings.
- **Embeddings must match their index.** Vectors from different models can't be compared, so each embedding provider has its own clause index, and the app stops with a clear error if the index and `EMBED_MODEL` don't match. It never returns nonsense matches.
- **Local runs never overwrite final outputs.** Briefs go to their own folder and cache entries are tagged, so nothing from Ollama can leak into the committed briefs.
- **Ollama has its own time limits.** Locally there is no rate limit and calls get up to 20 minutes, independent of the Gemini settings.

**Switch to local:** in `.env.local` set `LLM_PROVIDER=ollama` and `EMBED_PROVIDER=ollama` (Ollama running, with `qwen2.5:7b` and `nomic-embed-text` pulled; llama3.2 (3B) proved too weak: it invented findings), then once `npm run build:index`. After that, `npm run review`, `npm run eval` and the app all run locally.

**Switch back to final** (after local testing): set both back to `gemini`, then `npm run review` (fills or refreshes `data/briefs`) and `npm run eval` for the numbers you report. The eval report header names the provider and warns if any brief came from another one. `npm run cost -- --provider gemini` gives the cost. Local runs are free.

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

Full table: [`eval/results.md`](eval/results.md) (regenerate with `npm run eval`). Last full run (14 Oct, Gemini, on the leak-free briefs, Eval_Set v1.1): **61 passed · 3 failed · 3 skipped of 67 cases**. The 3 failures are judgment cases (EV-03, EV-05, EV-12, below). Skipped: EV-V4 (FR-18 not built), EV-M2 (no name detection in the lite masking) and EV-M3 (the full masked run, deferred by decision; EV-M1 and EV-M4 pass). The 17 cases added in v1.1 (EV-G1–G9 guardrails, EV-F1–F4 file reading, EV-M1–M4 masking) are graded by the checks listed below. `npm run check` runs the model-free part on every change; `npm run eval:all` runs everything.

> **Eval integrity fix (13 Oct).** Each dataset meeting note ends with an italic narrator line that the dataset calls ground truth ("no BAA had been signed; the extract remained with the two Pune engineers"). It was reaching the notes step as if said in the meeting: part of the answer was in the input. It is now removed at ingest (`lib/editorial.ts`) and all 13 briefs were regenerated. No case was lost: Harrington's compliance alert is still found from the note itself.

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
| **Every finding graded** (`eval/finding_labels.json`) | all findings labelled, ≤5% wrong | 83/83 graded: **84% correct**, 5% partly right, 8% noise, 1 duplicate, 1 wrong (a quote that doesn't support its claim); 4 with the wrong severity. Two output bugs found this way were fixed (garbled carve-out names; "pay-when-paid, up to N days") |
| **Masking (FR-26, EV-M1)** | 0 leaks | `npm run check:mask`: 150 texts (main + held-out documents, notes, register entries) masked, **0 leaks**, round trip exact 150/150, unit cases right (aliases, line-broken names, possessives, AtliQ labels, visible items). **EV-M4 passes** (Lakeshore reviewed with masking on, 14 Oct: 5 calls sent with 22 client names, 13 people and 30 amounts masked, 0 leaks logged; no label left in the brief, 6/6 quotes match the contract; same verdict, HOLD on the Crestline pricing promise, as unmasked). EV-M3 (full masked vs unmasked run, `npm run eval:masked`) not run: masking at this level was accepted for the demo. EV-M2 is out of the lite version (below) |
| Reading real files | text formats ≥98% of words + every clause number; scans ≥95% | 10/10: Word 100%, Word with auto-numbered headings 100%, PDF 98.4–99.4%, scanned PDF via OCR 99.5–99.6%; every clause number recovered |
| Consistency (PRD §11, 3 runs) | same verdict on fresh answers | **12/12 complete runs agree** on their deal's verdict: TravelHub 3/3 SEND BACK (EV-03 passes on every fresh run; the stored brief is an unlucky HOLD), Datavane 3/3 SIGN AFTER CHANGES (EV-05's miss is systematic, not variance: the CloudSpan collision is always found but never as a blocker), Kriti 3/3 SIGN AFTER CHANGES (EV-10 passes 2/3: individual findings vary), LoopMart 3/3 SIGN. Reliability: 3 of 15 runs lost a step to provider 503s; all 3 came out HOLD, never a clean verdict (`eval/consistency.md`) |
| **Held-out set** (never used for tuning; below) | answer-key verdicts, conflicts, false alarms | **verdicts 9/10**, conflicts found 7/11, playbook/entity points 10/13, **0 false alarms on the clean draft**, register key 8/10; every finding graded: 74% correct (+4% partly), 16% noise, 3 wrong |
| Added guardrails and newer features (A1–A6) | every check passes, no model calls | 11/11: no counted finding without a clause; 5 strong-match rules; one-way NDA caught; 5/5 injection attempts caught, 0 of the real documents flagged; 17/17 upload cases; deal-size, roles, live mismatch, store-in-register and review isolation all right; 8/8 wording sentences |

**The 3 failures, honestly.** All three are judgment calls; the deterministic checks don't vary.
- **EV-03 TravelHub:** HOLD instead of SEND BACK. The model reads TravelHub (a hotel distribution platform building hotel-ranking AI for UAE/KSA hotels) as squarely inside Al Noor's "Hospitality Business" definition; the answer key calls it arguable, for counsel. The system errs cautious: it blocks rather than misses.
- **EV-05 Datavane:** SIGN AFTER CHANGES instead of HOLD. The CloudSpan exclusivity collision *is* found, but this run judged it fixable by carving India + GCC out of the territory (high, not blocker); the previous run called it a blocker.
- **EV-12 Harrington:** the background-IP assignment is missed; the verdict (HOLD + compliance alert) is right. EV-10 (Kriti) passes since the 14 Oct regeneration and on 2 of 3 fresh runs.
- In earlier runs, EV-11 (Marcus) and EV-13 (Ortiz) failed instead. Marcus flags a real tools-licence gap the answer key doesn't list. Ortiz was fixed by aligning the termination rule with the Rohan Iyer precedent.

The briefs were produced over several runs because Gemini's **free tier** allows 20 requests per model per day per project. On the free tier, run `npm run review` once a day until it finishes without the quota message: each run picks up where the last one stopped. On a billed key (`LLM_MIN_INTERVAL_MS=0`, `REVIEW_CONCURRENCY=3`) one run regenerates everything.

**Cost and latency (from `npm run cost`, Gemini flash pricing placeholders $0.30 / $2.50 per 1M tokens):** a fresh review ≈ **$0.03–0.05 per deal, 45–95 s** (measured on the 15 consistency runs and 10 held-out reviews), so roughly **$0.35–1.00/month at 9–20 contracts**, model cost only; register build ≈ $0.35 one-off for 17 contracts (≈ $0.03 per added contract); OCR of a 2-page scan ≈ 12 s on the fast model. The NDA fast lane runs in 20–45 s.

### Held-out evaluation

The 13 deals above were used while building and tuning, so their score says the system works on what it was built for, not how it generalises. The dataset's **SYN_ extension** was never used: 10 signed contracts, 10 incoming drafts and 6 notes, with its own answer key. `DATA_PROFILE=holdout` runs the same app on it with its own data in `data/holdout/`:
- the 10 drafts come in as the files clients send (Word, auto-numbered Word, PDF, scanned PDF) through the upload reader, not as clean Markdown;
- the 10 signed contracts go through the same register extraction and join the existing 17;
- notes lose their narrator lines; "today" is the set's own date (28 Sep 2026);
- `eval/holdout_cases.json` was written from the answer key and **committed before the first held-out run**; any later edit must be logged in it. Grading is per item: verdicts, conflicts found (the right signed contract cited at blocker/high), playbook/entity points, false alarms on the clean draft (Greystone), and the register key (type, end date, expiry, affiliates).

Results ([`eval/holdout-results.md`](eval/holdout-results.md), 14 Oct, Gemini): **verdicts 9/10 · conflicts found 7/11 · playbook / entity points 10/13 · false alarms on the clean draft 0 · register key 8/10**; every finding graded (`eval/holdout_finding_labels.json`): 50 findings, 74% correct (+4% partly), 16% noise, 3 wrong.

What it showed that the tuned set couldn't:
- **The conflict check only reads 5 commitment types** (non-compete, exclusivity, pricing promise, IP given away / not received). Commitments of other kinds are extracted into the register but never compared with a new deal: Zephyr's right of first refusal (Indus), Tessellate's take-or-pay minimum (Monsoon), Corvina's rate freeze and DPA hosting terms (Corvina SOW-2), Ashwood's offshore-PHI ban. That is all 4 missed conflicts. Kept as a declared limit (Known limits); the brief now lists such commitments for a manual check, and that list points to the right contract in **4/4** cases (Tessellate's take-or-pay minimum itself wasn't extracted, but the contract is listed).
- **Severity runs low on clear collisions:** Zephyr (Quanta, named in its Schedule 1) and Falconridge (Cargoline, #1 on its protected list) were raised as high / "possible", not blockers, so Quanta came out SIGN AFTER CHANGES instead of HOLD.
- **Guardrail A2 has a cost:** it raised two pricing-promise matches on Corvina whose rates are above both floors (the model had dismissed them correctly).
- **Two bugs**, both fixed after this run (the scores above are the pre-registered run, kept as the record): the PDF/Word reader didn't turn "SCHEDULE 2 — MILESTONES" into a heading, so two schedules that were present were reported missing; and a DPA annexed to a signed contract (Corvina's MSA, Annex 2) wasn't counted as a DPA (`lib/review/bundle.ts` containsDpa). Fixing the DPA bug **lowers** the held-out verdicts to 8/10: Corvina's HOLD rested partly on that false "missing DPA"; without it the review finds only the 30-day sub-processor notice (its real deal-breakers, the US transfer, the rate freeze and Kriti not under contract, are commitment kinds the conflict check doesn't compare; the "check by hand" list points to Corvina's DPA hosting terms).
- Cobalt's own pricing promise was found, but under a different key than the pre-registered case expected, so HO-02 counts it as a miss.

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
- **Old Word (.doc):** not read; the upload asks for .docx or PDF. Scans need the Gemini provider (the model reads the file).

## Pending work

Everything that couldn't be run or checked yet because of model quota or tooling is tracked in [`docs/Pending_Work.md`](docs/Pending_Work.md); `npm run pending` refreshes its auto-detected part.

## Known limits

- **Masking is the lite version** (`docs/Masking_Lite_Spec.md` §6): names on no list (e.g. a new client's director) are not caught, since there is no local name-detection tool, so **EV-M2 is expected to fail and is skipped**; scanned PDFs go to Gemini as images for OCR before anything can be masked (logged as unmasked); the clause index and similar-clause lookups are embedded from unmasked text. Data retention (PRD §8: contract life + 7 years; unsigned drafts 90 days) is a product policy: the prototype has no long-term store.

- **The conflict check compares 5 kinds of commitment with a new deal:** non-competes, exclusivity, pricing promises, and IP given away / not received (`lib/review/conflict.ts`). The register also holds other kinds (rights of first refusal, minimum purchase commitments, rate freezes, data-hosting and sub-processor terms, offshore-access bans); these are **not compared**. Instead, each brief lists the live ones that plausibly concern the deal under *What wasn't seen → Commitments the conflict check doesn't compare (check by hand)*: any commitment owed to the same client, plus restrictive kinds from other contracts in the same sector and region or, for vendor deals, from AtliQ's other vendor contracts (`lib/review/unchecked.ts`; rules only, never in the verdict). On the held-out set this list points to the right contract for all 4 conflicts the check missed.

- **Free model tier.** Gemini's free tier allows about 20 requests per model per day, so the review uses fallback chains and caches every call. A full review of all 13 deals is about 60 strong-model calls. A real deployment needs a paid key; the cost estimate uses `data/runs/`.
- **Fallback models.** On the free tier you can append flash-lite models to `LLM_MODEL_STRONG` so a review completes when the flash quota is gone (that's how the last 5 deals were produced). Quality drops on mirror / flow-down reasoning (EV-10, EV-13). Without them, a quota failure gives "couldn't complete: review manually" and HOLD, never a clean verdict.
- **Model variance.** In EV-V1, low-severity playbook notes on *unchanged* text differed between v1 and v2 (lite model). That's exactly what late-finding detection (FR-18, not built) is meant to catch. Severity on interpretive points can move between runs; deterministic rules pin the critical ones (entity, LD base/cap, payment, liability, insurance, required documents, expiry), and the verdict is computed by rule. Stored briefs replay cached answers, so the main eval grades one sample per deal; `npm run consistency` measures the spread on fresh answers.
- **State on Vercel is ephemeral** (`/tmp`): uploads, decisions and verifications reset when the function instance is recycled. The committed briefs always load.
- **The register is only as complete as the documents collected:** ~10 referenced contracts are not in the dataset (ShopSwift SOW, PixelCraft, the intercompany services agreement…). Every brief says so under "what wasn't seen".
- The demo date (`APP_TODAY`) is fixed at 4 Oct 2026; event timestamps (decisions, uploads) use the real clock.

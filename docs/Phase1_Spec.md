# Phase 1 Spec: Data Layer

**Goal:** turn the dataset into the structured data every later phase reads: deals, documents, notes, company facts, the **obligations register** (F1), the **clause index** for similar past clauses (FR-22), the **playbook**, the **required-documents rules** and the **eval fixtures**. All of it is built by scripts on your laptop and committed to the repo as JSON. Vercel only reads these files and never runs the heavy jobs.

**Size:** 2–3 sessions. **PRD links:** FR-1, FR-2 (read-only for now), FR-9, FR-14, FR-22 · §7.1 · EV-R1–R5.

---

## 0. Before you start (decisions needed now)

| Decision | Why now | Recommendation |
|---|---|---|
| **LLM provider + API key** | The register extraction (1b) is the first real AI call | Any provider with structured JSON output. If you pick Claude, you need an **Anthropic API key** from the Claude Console. Your Claude Code login doesn't cover API calls from your app. |
| **Embeddings provider + key** | The clause index (1c) needs embeddings | One that pairs with your LLM choice (e.g. Voyage AI with Claude; OpenAI or Gemini embeddings otherwise) |
| **"Today" for the demo** | Expiry, "due in X days" and live/expired all depend on the date | Fix it in config: `APP_TODAY=2026-10-04`, so the demo and evals give the same answer whenever they're run |

> This moves the provider choice from "before Phase 2" to "before Phase 1b". The comparison between models still happens in Phase 2, with the evals.

---

## 1. Repo layout after Phase 1

```
data/
  raw/                      ← the Dataset folder, copied as-is (skip __MACOSX, .DS_Store)
  seed/
    deals.seed.json         ← hand-checked deal grouping (the one-time "tracker import + linking" result)
    labels.seed.json        ← intent labels for past clauses (from Obligations_Register §C/§E)
    company.seed.json       ← AtliQ entities, regions, insurance held
  documents.json  notes.json  deals.json  company.json
  register.json             ← AI-built, verified=false
  clause_index.json         ← chunks + embeddings
  playbook.json  required_docs.json
  expected/register.expected.json   ← hand-built answer key (from docs/Obligations_Register.md)
  runs/                     ← token counts + timings per script run (feeds the cost estimate)
eval/cases.json             ← fixtures from docs/Eval_Set.md
lib/types.ts                ← all shared types (zod schemas + TS types)
scripts/ ingest.ts  buildRegister.ts  checkRegister.ts  buildClauseIndex.ts  buildEvalCases.ts
```

---

## 2. Data shapes (`lib/types.ts`, zod)

```ts
Document     { id, file, kind: 'signed'|'incoming'|'note'|'reference', docType: 'MSA'|'SOW'|'NDA'|'BAA'|'ICA'|'Partnership'|'Subcontract'|'Waiver'|'Other',
               counterparty, date, atliqEntity?: 'Pvt Ltd'|'Inc'|'FZ-LLC'|..., sideOfTable: 'supplier'|'buyer'|'partner'|'mutual',
               paper: 'client'|'atliq', text, ocr: boolean, dealId? }
Deal         { id, name, counterparty, owner, deadline?, valueUsd?, status: 'open'|'waiting_for_input'|'decided'|'signed',
               documentIds[], noteIds[], linkedDealIds[] /* e.g. Kriti → Rheinwerk, Ortiz → Harrington, Marcus → Lakeshore */ }
Note         { id, file, date, title, text, dealIds[] }
Company      { entities[{ name, country, servesRegions[], invoices[] }], insuranceHeld[{ type, amountUsd }], deliveryModel }
RegisterEntry{ id, type: 'non_compete'|'exclusivity'|'mfn_pricing'|'ip_transfer'|'ip_retention'|'data_location'|'insurance'|'non_solicit'|'compliance'|'other',
               sourceDocId, clauseRef, quote /* verbatim */, bindsEntities[], includesAffiliates: boolean,
               scope{ sectors[], regions[], services[], assets[], counterparties[] },
               start, end?, endRule? /* e.g. "term + 18 months" */, waivers[{ docId, clauseRef, covers }],
               status /* computed by rule from APP_TODAY: live|expired|unknown */, verified: false, notes? }
ClauseChunk  { id, docId, counterparty, date, atliqEntity, sideOfTable, clauseNo, heading, text,
               clauseType: 'ld'|'liability'|'indemnity'|'payment'|'ip'|'confidentiality'|'non_compete'|'non_solicit'|'governing_law'|'data_protection'|'termination'|'insurance'|'other',
               label: 'standard'|'exception'|'concession'|'accident'|'untagged', labelNote?, embedding: number[] }
PlaybookRule { id, topic, clauseType, standard, acceptableRange?, neverAccept[], appliesTo: 'both'|'incoming'|'atliq_paper',
               precedents[{ docId, clauseRef, label }], source, approved: true /* seeded as approved for the prototype; declared in README */ }
RequiredDocRule { id, when{ sector?, region?, dataType? }, perParty: string[] /* e.g. ['NDA','MSA','BAA','sub-BAA per subcontractor/affiliate'] */ }
EvalCase     { id, inputs: docId[], expectedVerdict?, mustFind: string[], mustNotFlag: string[], expectedPrecedents?: {docId, label}[] }
```

---

## 3. Steps

### 1a. Ingest (no AI)
- Read every `.md` in `data/raw/Dataset/{signed_contracts,incoming,meeting_notes}`. Get `date` from the file name, `kind` from the folder, and `ocr: true` when the file says "scanned".
- `docType`, `counterparty`, `atliqEntity` and `sideOfTable` come from a **small hand-checked map** in the script. That's fine here: real extraction of incoming drafts is F2, in Phase 2. Signed-contract facts get re-extracted in 1b.
- `contract_tracker.csv` → seed deals (counterparty, deadline, value, requested_by as owner). Then apply `deals.seed.json`, which groups the 15 incoming documents into deals and links related deals:
  - Harrington MSA + BAA, with the signed NDA as context
  - Ortiz ICA + NDA → linked to Harrington
  - Kriti → linked to Rheinwerk
  - Marcus Reed → linked to Lakeshore
- Each meeting note → attach to its deals:
  - 22 Sep queue note → all queued deals
  - Gulf Crown counsel call → Gulf Crown
  - Harrington huddle → Harrington
  - Brightwater post-mortem → no open deal; reference only
- Company facts come from `atliq_entities.md`, plus insurance held: **$1M cyber only known**, so mark everything else "unknown".

### 1b. Build the register (AI, strong model, one call per signed document)
- **Input:** one signed document's full text. **Output:** `RegisterEntry[]` validated with zod.
- **Prompt rules:**
  - Extract every commitment that limits what AtliQ can do, gives something away or must keep being performed.
  - Include affiliates when the clause says so.
  - Quote verbatim, with the clause number.
  - Never guess illegible text; mark it `"illegible"` in notes.
  - Don't judge whether a commitment is "fine".
- **After extraction (code, not AI):**
  - Check every `quote` is an exact substring of the source. Drop any entry that fails and log it.
  - Compute `status` from `end` / `endRule` against `APP_TODAY`.
  - Link the **Al Noor waiver letter** to the Al Noor non-compete as a waiver ("covers: Seaside only").
- `checkRegister.ts` compares with `data/expected/register.expected.json` (Claude Code builds this from `docs/Obligations_Register.md` §A–D). It prints matched / missing / extra entries, and field mismatches on type, entities, affiliates, scope and end date.
- Commit `register.json` once the check passes the exit bar. All entries keep `verified: false`; verifying happens in the Register screen (Phase 3).

### 1c. Clause index (FR-22)
- **Chunking (no AI):**
  - One chunk per numbered section: `## 7. DELAY AND LIQUIDATED DAMAGES`, or `7. TITLE` lines in the OCR scan.
  - Split a section longer than ~1,500 characters at its sub-clauses (7.1, 7.2…).
  - Skip recitals, signature blocks and definitions-only sections. Keep definitions that change meaning (e.g. "Affiliate", "Hospitality Business") as `other`.
- **clauseType:** the heading keyword map first; the fast model only when the heading is unclear.
- **label:** from `labels.seed.json`; everything else is `untagged`.

  | Contract · clause | Label |
  |---|---|
  | Acme §7 LDs | standard |
  | Acme indemnity | standard |
  | PayTrack §10 indemnity | standard |
  | Trustline payment (45 days) | standard |
  | Sunrise liability / service credits | standard |
  | Al Noor NDA, Harrington NDA (confidentiality) | standard (genuinely mutual) |
  | CareBridge BAA | standard (counsel-reviewed) |
  | Rohan ICA payment / termination / liability | standard |
  | Rohan ICA IP | accident |
  | Al Noor MSA LD cap 10% | **exception: one-off, never a precedent** |
  | Northwind governing law | concession |
  | CloudSpan governing law | concession |
  | Brightwater LDs, governing law, set-off | accident |
  | Meridian NDA | accident |
  | Crestline MFN | accident (accepted on a false premise) |

- **Embedding:** batch the chunks through `lib/embed.ts` and save the vectors into `clause_index.json`. Log the count and token totals in `data/runs/`.
- **`lib/clauseIndex.ts`:** `search(text, clauseType, k=3, threshold)`. It embeds the query, keeps only chunks of the same `clauseType`, ranks by cosine similarity and returns the top k above the threshold. Start with a threshold of 0.75 and tune it in Phase 2 on EV-P.
- **Smoke test (`npm run search -- "liquidated damages 1% per week uncapped" ld`):** the top 3 should include Acme (standard), Al Noor (exception) and Brightwater (accident).

### 1d. Playbook, required docs, eval fixtures
- **`playbook.json`:** from `karandeep_contract_checklist.md`, `negotiation_notes.md` and `docs/Obligations_Register.md` §G. One rule per topic:

  | Topic | Standard |
  |---|---|
  | Delay penalties (LDs) | 0.5% of milestone/week, 5% cap, client delays excluded, sole remedy |
  | Payment | ≤45 days |
  | Liability | Capped (1× fees) |
  | Indemnity | Mutual; none for the indemnified party's own negligence |
  | IP | Background IP retained, licence to the client |
  | NDA | Truly mutual, no hidden covenants, residuals mutual or none |
  | Governing law | Matches the entity |
  | Non-compete | None, or narrow and time-limited |
  | Data protection | DPA/BAA before data moves |
  | AtliQ paper | Mirror test; flow-down of the client's obligations, not its leverage |

  Each rule lists its precedents with labels.
- **`required_docs.json`:**
  - US healthcare / PHI → NDA, MSA, BAA, plus a sub-BAA for each subcontractor and affiliate that touches PHI.
  - EU personal data → DPA, plus SCCs for transfers to India, plus sub-processor terms.
  - India payment data → localisation clause.
  - Any subcontractor on a client deal → client consent, and flow-down of IP, confidentiality and data terms.
- **`eval/cases.json`:** generated from `docs/Eval_Set.md` (EV-R, EV-01–15, EV-P1–P7). Phase 2's `npm run eval` reads it.

### 1e. Wire the pages to real data (read-only)
- **Queue `/`:** deals from `deals.json`, showing deadline as "due in X days" / "overdue" (from `APP_TODAY`), owner and status, sorted by deadline (FR-14).
- **Register `/register`:** entries grouped live / expired, filterable by type and client. Each shows its quote and clause and an "unverified" badge. No buttons yet.
- **Deal page:** documents and notes attached to the deal.

---

## 4. Exit check (send me these)

1. `npm run check:register` output. **Must:**
   - **Al Noor** non-compete live to ~Sep 2029, binding Pvt Ltd and affiliates, with the Seaside-only waiver linked
   - **Crestline MFN** live to Jul 2027, Inc and affiliates
   - **CloudSpan** exclusivity India + GCC to Aug 2028
   - **Northwind** IP over incorporated tools (PipeKit)
   - **Rohan** IP retention
   - **Meridian** no-hire
   - **Orbit** non-compete **expired**, with the illegible indemnity reported, not guessed

   **Target:** all live restrictions present (100%), ≥90% of fields exact.
2. The clause-index summary: number of chunks per contract and type, the labelled chunks, and the output of the LD smoke search.
3. Screenshots of the Queue (7 open deals with due-in / overdue) and the Register page on the Vercel preview URL.
4. `data/runs/` totals (tokens and time). We'll reuse them in the cost estimate.

---

## 5. Prompts for Claude Code (one per step, plan mode each time)

**1a**
> Read CLAUDE.md, docs/Phase1_Spec.md and docs/Build_Plan.md. Do step 1a only: create lib/types.ts (zod schemas from §2), data/seed/*.seed.json, and scripts/ingest.ts producing documents.json, notes.json, deals.json and company.json from data/raw. Show me the deal grouping for review before writing deals.seed.json. Add an `APP_TODAY` config (default 2026-10-04).

**1b**
> Do step 1b: scripts/buildRegister.ts (one strong-model call per signed document via lib/llm.ts, zod-validated, verbatim-quote check, status computed from APP_TODAY, Al Noor waiver linked), data/expected/register.expected.json from docs/Obligations_Register.md §A–D, and scripts/checkRegister.ts. Log tokens and time to data/runs/. Run it and show me the check output.

**1c**
> Do step 1c: the chunker, clause typing, labels from labels.seed.json, embeddings via lib/embed.ts, clause_index.json, lib/clauseIndex.ts search(), and an `npm run search` script. Run the LD smoke test.

**1d + 1e**
> Do steps 1d and 1e: playbook.json, required_docs.json, eval/cases.json from docs/Eval_Set.md, and wire the Queue, Register and Deal pages to the JSON (read-only). Push to a branch so Vercel builds a preview.

---

## 6. Things to declare in the README later
- `deals.seed.json` and `labels.seed.json` are hand-prepared. They stand in for the one-time tracker import, deal linking and Karandeep's ~30-minute tagging session (PRD §14, Stage 2).
- Playbook rules are seeded as "approved" on Karandeep's behalf.
- `APP_TODAY` is fixed at 4 Oct 2026, so results are reproducible.

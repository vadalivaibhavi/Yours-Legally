# Phase 2 Spec: Review Engine

> **Historical plan (13 Oct).** This was the build plan written before coding. The prototype as built is described in the repo README and `docs/Pending_Work.md`; product decisions made while building are in PRD v1.0 (marked *(build)*). Kept for the record; not updated.


**Goal:** turn a deal's documents into **findings**, and the findings into a **brief** with a verdict, entirely on the server and testable with `npm run eval`. There is no UI work in this phase beyond a raw JSON viewer.

**Size:** ~4 sessions. **PRD links:** F2–F6 · FR-3 (facts only), FR-4–FR-11, FR-17, FR-22 · §9.1, §9.2, §10, §11 · EV-01–EV-15, EV-P1–P7, EV-C1–C2.

**Golden rule:** AI extracts and judges. **Code** decides what counts as a pass or fail, which entries are candidates, which quotes are valid, and what the verdict is.

---

## 1. Pipeline

```
runReview(dealId, { docIds, confirmations, similarClauses: true })
  1. intake      (F2)  extract ContractFacts per document               → fast model
  2. gate        (F2)  rules over facts                                 → code
  3. route       (F2)  NDA → fast lane (4a), else full review (4b)      → code
  4a. ndaLane    (F4+F3) mutuality checklist + covenant scan             → strong model, 1 call
  4b. conflicts  (F3)  structured filter → reasoning per candidate set  → code + strong model
      playbook   (F4)  key clauses vs playbook, mirror, flow-down       → strong model
      similar    (F4)  clauseIndex.search per key clause + "how it differs" → embeddings + fast model
      bundle     (F5)  required docs + notes facts                      → code + fast model
  5. verdict     (F6)  rules over findings                              → code
  6. brief       (F6)  wording from findings JSON only                  → strong model + quote check
```

**Hybrid gate (FR-17):** steps 4a/4b always run when the main agreement is present and readable, even if gate rules fail. They're skipped only when the main agreement is missing, unreadable or the wrong document, and then "fine-print checks will run once [item] is provided" is listed under *not seen*.

**Failure handling:** if any step errors after one retry, the brief shows **"Couldn't complete: review manually"** with what did and didn't run. It is never "clean".

---

## 2. Types (add to `lib/types.ts`)

```ts
ContractFacts { docId, docType, parties[], atliqEntity, sideOfTable, paper, clientCountry, governingLaw, forum,
                paymentDays, ldTerms{ rate, base, cap, clientDelayExcluded, soleRemedy }, liabilityCap, insuranceRequired[],
                referencedAnnexes[], crossReferences[], endClient?, sectors[], regions[], services[], assetsMentioned[],
                sources: Record<field, { clauseRef, quote }> }          // every field carries its source snippet
Finding { id, key /* stable across versions: kind + entryId|ruleId + clauseRef */, feature: 'F2'|'F3'|'F4'|'F5',
          kind: 'gate'|'conflict'|'playbook'|'mirror'|'flowdown'|'mutuality'|'missing_doc'|'notes_fact'|'compliance_event'|'deal_facts_mismatch',
          severity: 'blocker'|'high'|'medium'|'ok', title, impact, citations[{ docId, clauseRef, quote }],
          registerEntryId?, entryVerified?, playbookRuleId?, precedent?{ docId, clauseRef, label },
          similarClauses?[{ chunkId, docId, clauseRef, date, label, score, differs }],
          owner: 'karandeep'|'business'|'counsel'|'other_side', needsJudgment: boolean, readings?: string[],
          fix?: string, resolvableByChange: boolean, confidence: 'high'|'medium'|'low', missingItem?{ what, owner } }
Brief { dealId, version, createdAt, inputsHash, verdict: 'SIGN'|'SIGN AFTER CHANGES'|'SEND BACK'|'HOLD', nextAction,
        complianceAlert?{ findingId, status: 'open' }, blockers: findingId[] /* ≤3 */, moreFindings[], worthNegotiating[],
        fine: string[], notSeen: string[], confirmPrompts[], facts: ContractFacts[], staged: boolean,
        versions{ registerVersion, playbookVersion, models, promptVersion }, timings, tokens }
```

---

## 3. Steps

### 2a. Intake + gate + routing (F2)
- **Extraction:** a fast model fills `ContractFacts` from the document text. Every `sources[field].quote` must be an exact substring of the source; a field that fails the check is set to "unknown" and listed under *not seen*.
- **Gate rules** (`lib/rules/gate.ts`, pure functions, each returning pass/fail with the clause):

| Rule | Logic |
|---|---|
| Entity vs client country | US client → **AtliQ Inc**; any other country → **AtliQ Technologies Pvt Ltd** (from `company.json`) |
| Parties = invoicing entity | Entity named in the parties block equals the entity named for invoicing and payment |
| Governing law vs entity | Pvt Ltd → Indian law expected; Inc → US state law expected. Any other law → **medium** + "check precedent" (Northwind and CloudSpan were concessions). Not a blocker. |
| Payment | ≤45 days (Trustline negotiated maximum) |
| LDs | Capped; client delays excluded |
| Liability | Capped |
| Insurance | Required vs `company.insuranceHeld`. If "unknown", it's a "needs confirmation" item, not a pass. |
| Annexes | Every referenced annex/exhibit present in the deal (EV-06 Annex 3) |
| Template fit (AtliQ paper) | Template's entity and law fit the counterparty's residence (EV-11 Marcus Reed) |

- **Routing:** `docType === 'NDA'` → fast lane; everything else → full review.

### 2b. Conflict check (F3), structured filter → reasoning
1. **Candidate filter** (`lib/rules/candidates.ts`, code). Include a **live** register entry when **any** of these holds:
   - its regions overlap the deal's regions (use a region map: country → region, e.g. UAE, Oman, Saudi → GCC; Germany → EU)
   - its sectors overlap
   - its assets appear in `assetsMentioned`
   - it's an MFN entry and the AtliQ entity or an affiliate is a party
   - it's an exclusivity entry and the deal is a partnership or reseller arrangement
   - its scope field is empty or unknown (safer to include)
   - **Expired entries are excluded by code** (EV-14).

   The filter is deliberately loose, because a wasted candidate costs pennies and a missed one is the worst failure.
2. **Reasoning:** one strong-model call with the contract's relevant clauses plus all candidates. For each candidate the output is `applies | may_apply (needs judgment, both readings) | does_not_apply`, with verbatim quotes from **both** documents and the applicable waivers.
3. **Post-processing (code):**
   - Quote check on both sides.
   - Severity: `applies` → blocker; `may_apply` → high with `needsJudgment`.
   - Owner: a needs-judgment item with high stakes → counsel; otherwise Karandeep.
   - `entryVerified` copied from the register.
   - Banned words ("breach", "enforceable", "illegal") are rewritten or the item is flagged in the eval.

### 2c. Playbook and fairness (F4), plus similar past clauses (FR-22)
- **Key clauses:** reuse the Phase 1 chunker on the incoming document, typed by clause type. Only key types go through: `ld, liability, indemnity, payment, ip, confidentiality, non_compete, non_solicit, governing_law, data_protection`.
- **Comparison:** one strong-model call per document with the key clauses plus the matching playbook rules. For each clause:

  | Field | Values |
  |---|---|
  | Deviation | `none` · `negotiable` (medium) · `critical` (high/blocker by rule's `neverAccept`) |
  | Fair counter-position | Drawn from the rule's standard |
  | Precedent | From `rule.precedents` |

  Exceptions and accidents are **never** offered as the standard.
- **Mirror mode** (`paper === 'atliq'`): same rules, but the question is "would AtliQ accept this clause if it were the supplier?" (EV-10 Kriti, EV-11 Marcus).
- **Flow-down** (AtliQ paper with a linked client deal): compare the client contract's obligations (IP ownership, data protection, confidentiality, consent to subcontract, compliance terms) with the vendor agreement. Flag what isn't passed down. Never pass down the client's one-sided terms.
- **NDA mutuality (fast lane, 4a):** one call covering the FR-8 checklist (who is protected by the confidentiality definition, whose obligations, residuals, remedies/indemnity, hidden covenants, term) plus a covenant scan against live `non_compete | non_solicit | exclusivity` register entries. The title is ignored. Target <1 min end to end.
- **Similar past clauses:**
  - For each key clause, call `clauseIndex.search(text, clauseType, 3, threshold)`.
  - Then one fast-model call writes a ≤15-word "how it differs" line per result.
  - **Attach the results after severity is set.** The verdict function never reads `similarClauses`. The eval runs once with `--no-similar` to prove it.

### 2d. Bundle and data readiness (F5)
- **Required documents:** match `required_docs.json` on the deal's sector, region and data type. For each party, mark each document `present | referenced_not_present | missing`. Missing items become findings with `missingItem.owner`.
- **Notes facts:** a fast model reads the deal's notes and outputs facts (`data_moved`, `staffing`, `promise`, `tool_reuse`) with a verbatim quote, each turned into a **confirm prompt**.
- **Compliance event:** when a confirmed fact matches a compliance rule (e.g. regulated data moved before the required agreement), create a finding `kind: compliance_event`. The brief pins it as the compliance alert (FR-21).
- **Confirmations** come in as input (`confirmations: { promptKey: 'confirmed'|'not_true'|edited }`). The eval fixtures set them for EV-12 so the alert fires.

### 2e. Verdict (code, `lib/rules/verdict.ts`)

```
if main agreement missing/unreadable              → HOLD (staged), nextAction = provide [item]
if any compliance alert open                      → never SIGN; at least HOLD
if any blocker with !resolvableByChange           → HOLD
else if any gate failure owned by other side      → SEND BACK   (fixes + all fine-print findings)
else if any blocker/high/medium deviations        → SIGN AFTER CHANGES   (AtliQ paper: "fix before sending")
else                                              → SIGN
missing inputs (any rule above)                   → also status 'waiting_for_input' + owner
```

- **Never** `REJECT`.
- **Blockers shown:** the top 3 by severity, then owner tier (counsel > Karandeep > business), then confidence. The rest go under `moreFindings`.
- **Calibration points to check in the eval:**
  - BlueOrchid (EV-04) → SIGN AFTER CHANGES, because carving out properties 10–12 fully resolves it.
  - Lakeshore (EV-02) → HOLD: the fix is a commercial decision, not a contract edit.
  - TravelHub (EV-03) → SEND BACK, with the Al Noor item as needs-judgment (high, not a blocker).

### 2f. Brief wording (F6)
- The strong model gets **findings JSON only** (no contract text). It writes `impact` lines in plain business English, `nextAction`, and a one-line "fine" list from passed checks.
- **Code check:** any quote-like text in the output must match an existing citation, otherwise the line is regenerated once and then dropped.
- **Not seen:** missing documents, illegible parts, unconfirmed facts, "no meeting notes attached" when a deal has none, unverified register entries used.

### 2g. API and performance
- **`POST /api/review/step`** with `{ dealId, step, state }`. The client calls the steps in order, so no single server function runs long (Vercel limit). Set `export const maxDuration` per route.
- **Cache:** key = hash(doc texts + confirmations + register version + playbook version + models + promptVersion) → `data/cache/{hash}.json`.
- **`npm run prewarm`** runs every dataset deal and commits the cache, so the demo is instant. New uploads run live.
- **`GET /api/review/[dealId]`** returns the latest brief JSON. Use a raw viewer page for this phase.

### 2h. Eval harness (`npm run eval`)
- **Fixtures** (`eval/cases.json`, extended now with matchers):
  - `mustFind[]`: `{ kind, registerEntryId? | playbookRuleId? | keywords[], minSeverity }`
  - `mustNotFlag[]`: `{ registerEntryId? | keywords[] }`. Fails if it appears at high or blocker.
  - `expectedVerdict`, `expectComplianceAlert`, `expectedPrecedents[]` for EV-P.
- **Flags:**

  | Flag | What it does |
  |---|---|
  | `--case EV-07` | Run one case |
  | `--repeat 3` | Consistency check |
  | `--no-similar` | Run without the similar-clauses panel (verdict must not change) |
  | `--models fast=X,strong=Y` | Model comparison |
  | `--fresh` | Ignore the cache |

- **Output:** `eval/report.md` and `eval/report.json`, with a per-case pass/fail table and these metrics (PRD §11):

  | Metric | Target |
  |---|---|
  | Blocker recall | ≥95%; 100% on compliance-alert cases |
  | Precision on clean cases | SIGN, 0 blockers, ≤1 medium |
  | Citation validity | 100% |
  | Severity agreement | ≥85% |
  | Banned-word count | 0 |
  | Consistency over 3 runs | ≥95% |
  | EV-P recall@3 | ≥80% |
  | Labels correct | 100% |
  | Verdict unchanged without similar clauses | 100% |
  | Latency (NDA, MSA) | p50/p90 within targets |
  | Tokens and estimated cost per case | Recorded (feeds Step 4) |

---

## 4. Exit check (send me these)

1. `eval/report.md`. **Must pass:**
   - EV-01 Gulf Crown, EV-02 Lakeshore, EV-06 Rheinwerk, EV-07 FinServe (fast lane, <1 min), EV-12 Harrington (HOLD + compliance alert), EV-05 Datavane, EV-10 Kriti
   - **Clean cases:** EV-08 LoopMart, EV-09 Sunrise → SIGN; EV-14 Orbit not raised
   - EV-P1–P7 at the thresholds above

   **Allowed to be partial,** with each gap listed: EV-03, EV-04, EV-11, EV-13. These are the calibration-heavy ones.
2. The brief JSON for Gulf Crown and FinServe.
3. Two model setups compared (`--models`) if you want to test a cheaper fast model, plus the token totals.

---

## 5. Prompts for Claude Code (plan mode each time)

**2a**
> Read CLAUDE.md and docs/Phase2_Spec.md. Implement §2 types and step 2a: ContractFacts extraction with source quotes, the gate rules in lib/rules/gate.ts with unit tests, and NDA routing. Run it on all 15 incoming documents and show me a table of facts and gate results.

**2b**
> Implement step 2b: the candidate filter (code, region map, expired excluded) and the conflict reasoning call with both-side quotes and post-processing. Show me candidates and results for Gulf Crown, Lakeshore, BlueOrchid, TravelHub, Datavane and Rheinwerk.

**2c**
> Implement step 2c: playbook comparison, mirror mode, flow-down, the NDA fast lane, and similar past clauses attached after severity. Show me results for Kriti, FinServe, LoopMart, Sunrise SOW-2 and the Gulf Crown LD clause's similar clauses.

**2d–2f**
> Implement steps 2d–2f: bundle and notes facts with confirm prompts and compliance events, the verdict function in lib/rules/verdict.ts with unit tests for every branch, and brief wording from findings only with the quote check.

**2g–2h**
> Implement 2g and 2h: step-wise API routes, the cache, `npm run prewarm`, and the eval harness with matchers and all flags. Run `npm run eval` and `npm run eval -- --no-similar`, then show me eval/report.md.

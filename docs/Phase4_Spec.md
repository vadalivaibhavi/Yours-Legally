# Phase 4 Spec: Seller Side (thin)

> **Historical plan (13 Oct).** This was the build plan written before coding. The prototype as built is described in the repo README and `docs/Pending_Work.md`; product decisions made while building are in PRD v1.0 (marked *(build)*). Kept for the record; not updated.


**Goal:** sellers can check a deal plan **before** promising the client anything. They get a dated heads-up per item, and a banner when the answer may be out of date. Karandeep's brief flags where the contract differs from what the seller declared. Access rules are enforced.

**Size:** 1–2 sessions. **PRD links:** F7 · FR-13, FR-19, FR-20 · §7.2 (no other clients' terms), §8 (roles) · US-9, US-10 · EV-S1–S8, EV-15, EV-A1–A3.

---

## 1. Access control (do this first)
- **Role cookie** set by the header switch. Middleware plus checks in every API route.
- **A seller cannot open** `/register`, `/audit`, `/metrics`, `/deal/*/brief/*`, the clause index, or another seller's deals.
- **A seller sees** their deals, the queue (status and due dates only, **no verdict reasons**), and their own deal checks.
- **Tests:** EV-A1 (seller → brief URL → blocked), EV-A2 (seller → register → blocked), EV-A3 (seller answer never contains another client's name or rates; see §3).

---

## 2. Seller deal check (FR-13)

### Form `/seller/deal/[id]/check` (short, ~2 minutes to fill)

| Field | Input |
|---|---|
| Client | Name |
| Sector | Pick list (hospitality, retail, healthcare, BFSI/payments, logistics, travel, other) |
| Regions / sites | Countries (multi), plus site list optional |
| Services | Pick list (analytics/BI, data engineering, app dev, platform implementation, staffing) |
| Rates by role | Role + rate/hr (optional) |
| Tools or assets to reuse | Free list (e.g. "PipeKit", "hotel RM dashboards") |
| Who touches data, and where | Team + location (e.g. "Pune engineers", "US freelancer") |
| Partner / reseller involvement | Yes/no + name |
| **Anything else you're promising?** | One free-text field |

### Check logic (`lib/seller/check.ts`)
1. **Per item, structured filter first** (same candidate rules as Phase 2 §2b) over **live** register entries.
2. **Code-only checks where possible:**
   - **Rate vs MFN:** compare offered rates with the MFN rate card in `RegisterEntry.details` for comparable roles. Below the floor → **conflict**. EV-S2: $72 → conflict; $88 → clear.
   - **Region/sector vs non-compete or exclusivity:** an overlap → **conflict**, or **needs attention** when only part of the scope overlaps.
3. **AI only for the judgment:** one fast/strong-model call per flagged item for "what it means / what to do", in plain language. Also for matching the free-text item to a commitment type. **No match → "Couldn't check: ask Karandeep"**, never "clear" (EV-S6).
4. **Status per item:** `clear` · `needs attention` · `conflict` · `couldn't check`. Amber and red always say "talk to Karandeep before proposing".
5. **Stamp:** "**As of [date], based on what you told us and AtliQ's commitments at that time; the contract review is the final word.** Register v[n]."
6. **Editing the plan** re-runs **only the changed items** (diff of the form). The previous answer is kept with its date.

---

## 3. Seller-safe wording (guardrail, §7.2)
- The seller-facing output schema has **only** `status`, `whatItMeans`, `whatToDo`, `itemRef`. There's no source quote and no counterparty field.
- **Redaction check in code:** before returning, scan the text for any counterparty name or rate from *other* clients' contracts (lists built from `documents.json` and register `details`). If found, replace it with a generic phrase ("an existing client agreement sets a minimum rate for comparable roles") and log `redaction_applied`.
- EV-S2 must pass **with** the redaction: the seller learns the rate floor exists and roughly what to do, **not** "Crestline" or "$85".

---

## 4. Re-check banner (FR-19)
- **Triggers, when either happens after the seller's last check on that deal:**
  1. a new **brief version** on the deal
  2. the **register version** changes (new entry, waiver, verify/edit/reject)
- **Banner:** "Re-checked on [date]; your answer from [date] may be out of date. **Re-run your check.**" One tap re-runs.
- **Log:** `banner_shown`, `banner_seen`, `seller_rerun`.
- **Demo control for EV-S8:** on the Register screen, Karandeep's **"+ Add waiver (demo)"** adds a synthetic Al Noor waiver for a named Saudi hotel group. That seller's check shows the banner, and the re-run turns **conflict → clear** for that client only. Declare it as synthetic in the README.

---

## 5. Deal-facts mismatch in Karandeep's brief (FR-20)
- When a deal has a seller check, compare its declared facts with the contract's `ContractFacts`: regions/sites, rates, tools/assets, who touches data and where.
- Each difference → a finding `kind: deal_facts_mismatch`, severity **high**, citing the contract clause and "seller declared: …". It goes in the brief under "More findings", or among the blockers if it causes a register conflict.
- **EV-15:** the BlueOrchid seller declared "India hotels only", but the contract lists 3 GCC properties → mismatch flagged.

---

## 6. Seller home `/seller`
- **My deals:** status, due-in, last check date, banner indicator. The kick-off check can be started before any contract exists (a "new deal" with no documents).

---

## 7. Exit check
1. EV-S1–S8 pass, via `npm run eval -- --suite seller`. Add these fixtures to `eval/cases.json`.
2. EV-15 passes in Karandeep's BlueOrchid brief.
3. EV-A1–A3 pass (role tests), including the redaction test.
4. Walkthrough on the preview URL:
   - The seller checks a Lakeshore-like plan at $72 → conflict (no client name shown) → edits to $88 → clear, with a new date.
   - Karandeep re-checks the deal → the seller sees the banner.

---

## 8. Prompts for Claude Code (plan mode)

**4a**
> Read CLAUDE.md and docs/Phase4_Spec.md. Implement §1 access control (middleware + API checks) with tests EV-A1–A3, and §6 seller home.

**4b**
> Implement §2 (form, check logic with code-first rate and region checks, couldn't-check rule, as-of stamp, re-run of changed items only) and §3 (seller-safe output schema + redaction check). Add the seller eval suite EV-S1–S6 and run it.

**4c**
> Implement §4 (banner triggers on new brief version or register version change, logging, demo waiver control → EV-S7, EV-S8) and §5 (deal-facts mismatch finding → EV-15). Run all evals and walk through §7.4 on the preview URL.

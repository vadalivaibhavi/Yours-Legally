# Masking (lite) Spec: FR-26 in the prototype

**Goal:** before any text goes to Gemini, replace known client names, people, contact details, bank/tax numbers and money amounts with labels; put the real values back in the answer before anything else uses it. Show it working in the demo, and measure what it costs in review quality.

**Size:** ~1 session. **PRD links:** FR-26 · §8 Masking row · §10 (two masking rows) · §11 Masking leaks, Masking quality cost · Eval_Set G1 (EV-M1–M4).

**Lite means:** names come from lists we already have, plus pattern rules. No name-detection tool (that's the product version), no masking of scanned images or the clause index (see §6).

---

## 1. Where it plugs in

Everything goes through `callModel()` in `lib/llm.ts`, so masking is one wrapper there, switched by an env var:

```
MASKING=on|off      (default off, so today's committed briefs and cache stay valid)
MASK_AMOUNTS=on|off (default on; lets us test whether hiding amounts hurts the review)
```

Flow inside `callModel` when `MASKING=on`:

1. Build (or reuse) the dictionary (§2).
2. `mask(system)` and `mask(input)` with **one shared label table per call**, so the same client gets the same label in both.
3. Send the masked text. Retries (invalid JSON) resend the masked text.
4. Parse and validate the JSON as today, then **`unmaskDeep(data)`**: walk every string in the result and replace labels with real values.
5. Write the **unmasked** result to the cache and return it. Everything after this (quote check, rules, verdict, brief) sees real text, so the quote check still matches against the original contract.
6. Add `MASKING` and `MASK_AMOUNTS` to the cache key (e.g. via `providerTag()`), so masked and unmasked answers never mix.

`file` parts (scanned PDFs sent for OCR) are **not** masked in the lite version: log them as `unmaskedFile: true`.

## 2. The dictionary (`lib/mask.ts`)

Built once per process from data we already have. **Global, not per deal:** every known name is masked in every call.

| Label | Source |
|---|---|
| `[ATLIQ_PVT_LTD]`, `[ATLIQ_INC]` | `data/company.json` → `entities[].name` + `identifiers` (also covers the company and tax numbers). Entity-specific labels, because the wrong-entity check needs to know which AtliQ is named. |
| `[CLIENT_n]` | `deals.json` → `counterparty` + `counterpartyAliases`; `register.json` → `entries[].counterparty` + `scope.counterparties`. **All aliases of one company map to the same label** (Harrington / Harrington Health / Harrington Health Systems Inc → `[CLIENT_4]`). |
| `[PERSON_n]` | AtliQ team (Karandeep, Bhavin, Dhaval, Jay, Pranav…) + people named in notes and contracts. Lite: a reviewed list in `data/seed/mask_people.json` (generate a first draft by scanning notes and documents for capitalised name pairs, then check it by hand: no job titles, no place names). |
| `[EMAIL_n]`, `[PHONE_n]` | Pattern rules |
| `[BANK_n]` | IBAN, SWIFT/BIC, account numbers (8+ digit runs near "account", "IBAN", "A/C") |
| `[AMOUNT_n]` | Currency amounts: `$`, `USD`, `US$`, `INR`, `₹`, `Rs.`, `EUR`, `€`, `AED`, `SAR` with numbers, incl. "1.2 million", "lakh", "crore". Only when `MASK_AMOUNTS=on`. |

**Kept visible on purpose:** regions, countries, cities, sectors, percentages, day counts, durations, dates, clause numbers and headings, product/tool names (PipeKit is an asset the conflict check needs; it isn't a client).

**Matching rules:**
- Longest term first, so "Harrington Health Systems Inc" is replaced before "Harrington".
- Case-insensitive, whole words, and **whitespace-tolerant** (`\s+` between words), because names break across lines in PDFs.
- Possessives and punctuation: "Al Noor's" → "[CLIENT_2]'s".
- Labels are numbered per call, in order of first appearance.

**Unmasking:** tolerant of the model's small changes: `[CLIENT_2]`, `CLIENT_2`, `[Client_2]` all resolve. A label the model invented (not in the table) is left as is; the quote check then drops that finding, and the eval shows it.

## 3. Log and leak check

One JSON line per call in `data/runs/mask-<date>.jsonl`:
`{ task, counts: {client, person, email, phone, bank, amount}, unmaskedFile, leaks: [] }`

**Leak check (every call, after masking):** scan the outgoing text for every dictionary term again, plus the patterns. Anything still there goes into `leaks` (the term type, not the value). A leak never blocks the call in the prototype, but it's counted in the eval.

## 4. Free test first: `npm run check:mask`

No AI calls, no cost. For every document, note and register entry:
- mask it → run the leak check → report leaks per file (**EV-M1 target: 0**)
- unmask it → the result must equal the original exactly (round trip)
- print counts by type, plus the 20 most frequent capitalised words left unmasked, so you can spot names missing from `mask_people.json`

Run this until it is clean before spending any API calls.

## 5. Paid test: masked vs unmasked (EV-M3)

`MASKING=on npm run eval` on Gemini → compare with the 45/50 unmasked run:
- **Pass:** within 2 cases, and no compliance-alert blocker lost.
- If it drops more, run once with `MASK_AMOUNTS=off` to see whether amounts are the cause; record both in the eval report.

Expect a full Gemini run (the masked answers can't reuse the cache). Do it in the same batch as the held-out run.

## 6. Declared limits of the lite version (README "Known limits")

| Not in the lite version | Product version (PRD FR-26) |
|---|---|
| Names not on any list (e.g. a new client's director) | Local name-detection tool (e.g. Microsoft Presidio). **EV-M2 is expected to fail in the prototype**; say so. |
| Scanned PDFs go to Gemini as images for OCR | Local OCR first, then mask |
| Clause index embeddings built from unmasked text | Rebuild the index from masked text |

## 7. Demo touch (Karandeep only)

- Brief footer: **"Sent to AI with 3 client names, 4 people and 6 amounts masked."** (from the mask log for that review run).
- A **"What the AI saw"** toggle on one clause in the brief: the masked text side by side with the real text. This is the 10-second shot for the video.
- Never shown to the seller role.

## 8. Exit check

1. `npm run check:mask`: 0 leaks across the dataset; every round trip exact.
2. One review with `MASKING=on` (Lakeshore): brief shows real names; every quote passes the quote check (**EV-M4**); mask log shows counts and 0 leaks.
3. `MASKING=on npm run eval`: within 2 cases of unmasked (**EV-M3**).
4. README: masking section, the two env vars, results, and §6 limits.

## 9. Prompt for Claude Code (plan mode)

> Read CLAUDE.md, docs/PRD_Yours_Legally_v1.1.md (FR-26, §8 Masking, §10, §11) and docs/Masking_Lite_Spec.md.
> Implement the lite masking exactly as in the spec:
> - `lib/mask.ts`: dictionary from company.json, deals.json, register.json and a new data/seed/mask_people.json (draft it by scanning notes and documents, then show me the list to check before using it); pattern rules; `mask()` with a per-call label table; tolerant `unmaskDeep()`; leak check.
> - Wire it into `callModel()` in lib/llm.ts behind `MASKING` and `MASK_AMOUNTS` (default off / on); masked and unmasked runs use separate cache keys; unmask before caching and returning; file parts logged as unmasked.
> - Mask log in data/runs/mask-<date>.jsonl.
> - `npm run check:mask` (spec §4), with unit tests for aliases, line-broken names, possessives and round trips.
> - Brief footer counts and the "What the AI saw" toggle (Karandeep only).
> Don't change the default behaviour or the committed briefs. Run `npm run check:mask` and one Lakeshore review with MASKING=on, then stop and show me the results before any full eval run. Reference FR-26 / EV-M1–M4 in commits.

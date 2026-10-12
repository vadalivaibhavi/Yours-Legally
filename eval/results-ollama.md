# Eval results

Run 2026-10-12 07:23 UTC · APP_TODAY 2026-10-04 · cases from `docs/Eval_Set.md` via `eval/cases.json`.

Models: LLM ollama (fast: qwen2.5:7b; strong: qwen2.5:7b) · committed briefs made by qwen2.5:7b.

**32 passed · 14 failed · 0 not run (quota) · 4 skipped** (of 50 cases)

## Cross-cutting checks (PRD §11)

| Check | Result | Detail |
|---|---|---|
| Citation validity (all quotes string-matched to source) | ✅ | 62/62 |
| Guardrails: no breach/enforceable in system prose; never Reject | ✅ | 455 prose strings checked; 0 legal conclusions; 0 Reject recommendations |
| Verdict identical with and without similar-clauses panel | ✅ | 13 briefs |
| Register changes flag the right open deals and reach the checks (FR-2, FR-19) | ✅ | verify flags nothing; restriction edit flags all 13 open deals; ending it changes the seller check (conflict → clear); reject flags all and stops the conflict (clear); restore brings it back (conflict); client duty edit flags only that client's deals (harrington); insurance edit flags nothing (no check reads it) |
| NDA fast lane latency (<1 min) | info | finserve 1293s · loopmart 0s (cached) |
| Recall@3 on EV-P (≥80%) | ✅ | 8/10 = 80% |

## A. Register build (US-1 · FR-1, FR-2)

| Case | Result | Detail |
|---|---|---|
| EV-R1 17 signed documents | ✅ | R1, R2, R3, R4 present with quote + clause |
| EV-R2 Northwind MSA, Rohan Iyer ICA, Acme MSA | ✅ | I1, I2 present with quote + clause |
| EV-R3 Orbit MSA (scanned) | ✅ | R6 present with quote + clause; illegible clause reported |
| EV-R4 Brightwater, Al Noor, Northwind, Meridian | ✅ | Brightwater=accident, Al Noor 10%=exception, Northwind law=concession, Meridian=accident; none labelled standard |
| EV-R5 Register entry for Crestline MFN left unverified | ❌ | conflict not raised |

## B. Incoming contracts (US-2 to US-7, US-11)

| Case | Result | Detail |
|---|---|---|
| EV-01 Gulf Crown MSA | ❌ | missing conflict:alnoor-msa:non_compete@9.1; missing playbook:ld |
| EV-02 Lakeshore MSA + rate card | ❌ | missing conflict:crestline-msa:mfn_pricing; flagged playbook:payment (high) |
| EV-03 TravelHub agreement | ✅ | SEND BACK · found gate:entity, gate:invoicing_entity, conflict:alnoor-msa:non_compete · clean on conflict:orbit-msa |
| EV-04 BlueOrchid pilot | ❌ | verdict HOLD ≠ SIGN AFTER CHANGES |
| EV-05 Datavane partnership | ❌ | verdict SIGN AFTER CHANGES ≠ HOLD; missing playbook:restrictive |
| EV-06 Rheinwerk agreement | ❌ | missing conflict:northwind-msa:ip_transfer; flagged playbook:liability (high) |
| EV-07 FinServe "mutual" NDA | ❌ | verdict SIGN AFTER CHANGES ≠ HOLD; missing nda:definition; missing nda:remedies |
| EV-08 LoopMart mutual NDA | ✅ | SIGN · found nothing to find · clean on severity:blocker, severity:high |
| EV-09 Sunrise SOW-2 | ✅ | SIGN · found nothing to find · clean on playbook:ld, severity:blocker, severity:high |
| EV-10 Kriti subcontract (AtliQ paper) | ❌ | missing playbook:indemnity; missing flowdown:ip; missing flowdown:data; missing flowdown:consent |
| EV-11 Marcus Reed ICA (AtliQ paper) | ❌ | missing playbook:restrictive; missing playbook:termination |
| EV-12 Harrington bundle (MSA, BAA, NDA, notes) | ❌ | missing playbook:ip |
| EV-13 Daniel Ortiz ICA + NDA (AtliQ paper) | ❌ | verdict HOLD ≠ SIGN AFTER CHANGES; missing flowdown:data; missing flowdown:ip; flagged playbook:liability (high) |
| EV-15 BlueOrchid contract vs seller's deal check declaring "India  | ✅ | HOLD · found mismatch:regions |
| EV-14 TravelHub (negative test) | ✅ | SEND BACK · found nothing to find · clean on conflict:orbit-msa |

## B1. Compliance alerts & notes (FR-21)

| Case | Result | Detail |
|---|---|---|
| EV-C1 Harrington: Karandeep closes the PHI alert with "Resolved of | ✅ | alert open → "Resolved by Karandeep's note, 5 Oct: Harrington privacy officer confirmed deletion, 5 Oct"; findings unchanged (15); verdict HOLD from the other open items |
| EV-C2 Gulf Crown: Karandeep adds a note "Al Noor agreed verbally t | ✅ | blocker stays open, "pending written waiver"; verdict HOLD |

## B2. Deal linking (FR-3)

| Case | Result | Detail |
|---|---|---|
| EV-L1 Harrington BAA uploaded alone | ✅ | auto → harrington (only open deal with Harrington Health Systems Inc) |
| EV-L2 Kriti subcontract | ✅ | auto → kriti (only open deal with Kriti Data Labs) · end client rheinwerk |
| EV-L3 Synthetic: NDA from an unknown counterparty with a name simi | ✅ | ask (name is similar to Gulf Crown Hotels & Resorts Co.) · options: gulfcrown/new |
| EV-L4 Synthetic: Northwind SOW-2 uploaded while the Northwind MSA/ | ✅ | ask (AtliQ already has signed contracts with Northwind Logistics) · options: new |
| EV-L5 Harrington BAA deliberately placed in a new deal by the user | ✅ | user → new (Placed by you) · note: This document cross-references Harrington Health: MSA + BAA (HHS-IT-2026-0193). Move it there? |
| EV-L6 Rheinwerk draft with exactly one open Rheinwerk deal | ✅ | auto → rheinwerk (only open deal with Rheinwerk Analytics GmbH) · end client kriti |

## B3. Access control (§8, §11)

| Case | Result | Detail |
|---|---|---|
| EV-A1 Seller (Jay) opens a deal he owns | ✅ | Seller opens any deal (deal check, queue, banners); brief, register, similar clauses and decisions are Karandeep-only (also enforced by proxy.ts + server checks) |
| EV-A2 Seller check on a US rate that hits the Crestline MFN | ✅ | says a pricing floor applies; no client name or rates revealed |
| EV-A3 Seller tries to open another seller's deal or contract | ✅ | Superseded by the single Seller role: sellers see all deals' seller side; briefs and the register (other clients' terms) stay Karandeep-only |

## C. Version pairs (US-7 · FR-17, FR-18) (synthetic, to be created)

| Case | Result | Detail |
|---|---|---|
| EV-V1 TravelHub: entity corrected to Pvt Ltd, invoicing aligned | skip | skipped (--no-versions) |
| EV-V2 Rheinwerk: Annex 3 DPA added | skip | skipped (--no-versions) |
| EV-V3 Harrington: sub-BAA for Daniel Ortiz added | skip | skipped (--no-versions) |
| EV-V4 Synthetic: v1 deep review ran; v2 raises a finding on unchan | skip | Late-finding detection (FR-18) is not built in the prototype (Build Plan §5, declared in README). |

## D. Seller checks (US-9, US-10 · FR-13, FR-19) (synthetic inputs)

| Case | Result | Detail |
|---|---|---|
| EV-S1 Revenue-management analytics for a hotel group in Saudi Arab | ✅ | conflict (source alnoor-msa §12.1, name hidden) · stamped as of 2026-10-04, register reg-2026-10-04-57+r0 |
| EV-S2 Senior data engineer at $72/hr to a US retail client (then c | ✅ | conflict (source crestline-msa §6.4, name hidden) · stamped as of 2026-10-04, register reg-2026-10-04-57+r0 → re-check at $88: clear |
| EV-S3 Reuse PipeKit for a new European client | ✅ | attention (source northwind-msa 9.2, name hidden) · stamped as of 2026-10-04, register reg-2026-10-04-57+r0 |
| EV-S4 Become an implementation partner for another lakehouse platf | ✅ | conflict (source cloudspan-spa 7.1, name hidden) · stamped as of 2026-10-04, register reg-2026-10-04-57+r0 |
| EV-S5 Same partnership, Europe only | ✅ | clear · stamped as of 2026-10-04, register reg-2026-10-04-57+r0 |
| EV-S7 Seller checked a deal on day 1; Karandeep runs a new brief v | ✅ | before: no banner · after brief v2: banner (Karandeep re-checked this deal's contract (brief v2)); old answer keeps its date 2026-10-04 |
| EV-S8 Synthetic: register updated with a new Al Noor waiver coveri | ✅ | conflict → register changed (banner: true) → re-run clear for Desert Pearl Hotels; other Saudi hotel group still conflict |
| EV-S6 Free text: "promise the client a named engineer full-time fo | ❌ | free text → clear: Re-check if the sites, regions or services change. |

## E. Similar past clauses (US-4 · FR-22)

| Case | Result | Detail |
|---|---|---|
| EV-P1 Gulf Crown LDs (1% of contract value/week, no client-delay e | ✅ | top 3: Acme Retail Group §7 [standard] 0.92 · Brightwater Insurance Inc §9 [accident] 0.87 · Al Noor Hospitality Group §10 [exception] 0.86 |
| EV-P2 FinServe NDA confidentiality definition / residuals | ❌ | top 3: Al Noor Hospitality Group §1.1 [standard] 0.78 / meridian-nda (accident) not in top 3 |
| EV-P3 Harrington BAA (liability, reporting, offshore) | ✅ | top 3: CareBridge Clinics Inc §6 [standard] 0.90 · AtliQ Technologies Pvt Ltd (intercompany) §3 [untagged] 0.84 |
| EV-P4 Harrington MSA indemnity (covers client's own negligence) | ✅ | top 3: PayTrack Technologies §10 [standard] 0.85 · Al Noor Hospitality Group §15 [untagged] 0.86 · Acme Retail Group §11 [standard] 0.83 |
| EV-P5 Kriti subcontract payment (pay-when-paid, up to 120 days) | ✅ | top 3: Rohan Iyer §3 [standard] 0.90 · Trustline NBFC §4 [standard] 0.76 · PayTrack Technologies §4 [untagged] 0.76 |
| EV-P6 Rheinwerk governing law (German law) | ❌ | top 3: Brightwater Insurance Inc §20 [accident] 0.76 / northwind-msa (concession) not in top 3 |
| EV-P7 Sunrise SOW-2 "Penalty for Delay" (negative test) | ✅ | top 3: Acme Retail Group §7 [standard] 0.83 · Sunrise Foods §8 [standard] 0.81 |


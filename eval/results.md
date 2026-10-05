# Eval results

Run 2026-10-05 07:44 UTC · APP_TODAY 2026-10-04 · cases from `docs/Eval_Set.md` via `eval/cases.json`.

**47 passed · 2 failed · 1 skipped** (of 50 cases)

## Cross-cutting checks (PRD §11)

| Check | Result | Detail |
|---|---|---|
| Citation validity (all quotes string-matched to source) | ✅ | 118/118 |
| Guardrails: no breach/enforceable in system prose; never Reject | ✅ | 514 prose strings checked; 0 legal conclusions; 0 Reject recommendations |
| Verdict identical with and without similar-clauses panel | ✅ | 13 briefs |
| NDA fast lane latency (<1 min) | info | finserve 15s · loopmart 365s |
| Recall@3 on EV-P (≥80%) | ✅ | 10/10 = 100% |

## A. Register build (US-1 · FR-1, FR-2)

| Case | Result | Detail |
|---|---|---|
| EV-R1 17 signed documents | ✅ | R1, R2, R3, R4 present with quote + clause |
| EV-R2 Northwind MSA, Rohan Iyer ICA, Acme MSA | ✅ | I1, I2 present with quote + clause |
| EV-R3 Orbit MSA (scanned) | ✅ | R6 present with quote + clause; illegible clause reported |
| EV-R4 Brightwater, Al Noor, Northwind, Meridian | ✅ | Brightwater=accident, Al Noor 10%=exception, Northwind law=concession, Meridian=accident; none labelled standard |
| EV-R5 Register entry for Crestline MFN left unverified | ✅ | raised while unverified (labelled), label removed after verify (crestline-msa#1) |

## B. Incoming contracts (US-2 to US-7, US-11)

| Case | Result | Detail |
|---|---|---|
| EV-01 Gulf Crown MSA | ✅ | HOLD · found conflict:alnoor-msa:non_compete, conflict:alnoor-msa:non_compete@9.1, playbook:ld, playbook:payment · clean on playbook:ip, playbook:confidentiality, playbook:indemnity, conflict:orbit-msa |
| EV-02 Lakeshore MSA + rate card | ✅ | HOLD · found conflict:crestline-msa:mfn_pricing · clean on playbook:ld, playbook:payment, playbook:ip, gate:entity, gate:payment, gate:ld_cap, gate:liability_cap, gate:governing_law |
| EV-03 TravelHub agreement | ✅ | SEND BACK · found gate:entity, gate:invoicing_entity, conflict:alnoor-msa:non_compete · clean on conflict:orbit-msa |
| EV-04 BlueOrchid pilot | ✅ | SIGN AFTER CHANGES · found conflict:alnoor-msa:non_compete · clean on playbook:ld, playbook:payment, playbook:liability, playbook:ip, gate:governing_law |
| EV-05 Datavane partnership | ✅ | HOLD · found conflict:cloudspan-spa:exclusivity, playbook:indemnity, playbook:restrictive |
| EV-06 Rheinwerk agreement | ✅ | HOLD · found conflict:northwind-msa:ip_transfer, gate:annex · clean on playbook:ld, playbook:payment, gate:payment, gate:ld_cap, playbook:liability |
| EV-07 FinServe "mutual" NDA | ✅ | HOLD · found nda:definition, nda:residuals, covenant:non_compete, nda:remedies · clean on gate:entity, gate:governing_law |
| EV-08 LoopMart mutual NDA | ✅ | SIGN · found nothing to find · clean on severity:blocker, severity:high |
| EV-09 Sunrise SOW-2 | ✅ | SIGN · found nothing to find · clean on playbook:ld, severity:blocker, severity:high |
| EV-10 Kriti subcontract (AtliQ paper) | ❌ | missing playbook:indemnity; missing playbook:liability |
| EV-11 Marcus Reed ICA (AtliQ paper) | ✅ | SIGN AFTER CHANGES · found gate:entity, playbook:restrictive, playbook:termination, dependency:lakeshore · clean on playbook:ip, flowdown:ip |
| EV-12 Harrington bundle (MSA, BAA, NDA, notes) | ✅ | HOLD + compliance alert · found notes:data_movement, bundle:sub-baa:ortiz, bundle:sub-baa:pvt-ltd, gate:insurance, playbook:ld, playbook:liability, playbook:indemnity, playbook:ip |
| EV-13 Daniel Ortiz ICA + NDA (AtliQ paper) | ❌ | missing flowdown:data; missing flowdown:ip; flagged playbook:liability (medium) |
| EV-15 BlueOrchid contract vs seller's deal check declaring "India  | ✅ | SIGN AFTER CHANGES · found mismatch:regions |
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
| EV-A1 Seller (Jay) opens a deal he owns | ✅ | Jay opens his deal; brief, register, similar clauses and decisions are Karandeep-only (also enforced by proxy.ts + server checks) |
| EV-A2 Seller check on a US rate that hits the Crestline MFN | ✅ | says a pricing floor applies; no client name or rates revealed |
| EV-A3 Seller tries to open another seller's deal or contract | ✅ | Jay → Gulf Crown Hotels & Resorts: MSA: denied |

## C. Version pairs (US-7 · FR-17, FR-18) (synthetic, to be created)

| Case | Result | Detail |
|---|---|---|
| EV-V1 TravelHub: entity corrected to Pvt Ltd, invoicing aligned | ✅ | resolved gate:entity, gate:invoicing_entity, playbook:data_protection, playbook:indemnity, playbook:liability · still open 2 · new none · SIGN AFTER CHANGES |
| EV-V2 Rheinwerk: Annex 3 DPA added | ✅ | resolved gate:annex:annex-3 · still open 7 · new playbook:data_protection · HOLD |
| EV-V3 Harrington: sub-BAA for Daniel Ortiz added | ✅ | resolved bundle:sub-baa:ortiz · still open 14 · new none · HOLD |
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
| EV-S6 Free text: "promise the client a named engineer full-time fo | ✅ | free text → couldnt_check: Couldn't check: ask Karandeep before promising it. |

## E. Similar past clauses (US-4 · FR-22)

| Case | Result | Detail |
|---|---|---|
| EV-P1 Gulf Crown LDs (1% of contract value/week, no client-delay e | ✅ | top 3: Acme Retail Group §7 [standard] 0.95 · Brightwater Insurance Inc §9 [accident] 0.93 · Al Noor Hospitality Group §10 [exception] 0.91 |
| EV-P2 FinServe NDA confidentiality definition / residuals | ✅ | top 3: Al Noor Hospitality Group §1.2 [standard] 0.90 · Meridian Healthcare §2 [accident] 0.86 · Harrington Health Systems Inc §2 [standard] 0.84 |
| EV-P3 Harrington BAA (liability, reporting, offshore) | ✅ | top 3: CareBridge Clinics Inc §6 [standard] 0.93 · AtliQ Technologies Pvt Ltd (intercompany) §3 [untagged] 0.89 · Brightwater Insurance Inc §13 [untagged] 0.84 |
| EV-P4 Harrington MSA indemnity (covers client's own negligence) | ✅ | top 3: PayTrack Technologies §10 [standard] 0.92 · Orbit Travels Pvt Ltd §9 [untagged] 0.92 · Acme Retail Group §11 [standard] 0.90 |
| EV-P5 Kriti subcontract payment (pay-when-paid, up to 120 days) | ✅ | top 3: Rohan Iyer §3 [standard] 0.92 · Trustline NBFC §4 [standard] 0.91 · PayTrack Technologies §4 [untagged] 0.92 |
| EV-P6 Rheinwerk governing law (German law) | ✅ | top 3: Brightwater Insurance Inc §20 [accident] 0.87 · Northwind Logistics §17 [concession] 0.86 · Crestline Retail Inc §16 [untagged] 0.87 |
| EV-P7 Sunrise SOW-2 "Penalty for Delay" (negative test) | ✅ | top 3: Acme Retail Group §7 [standard] 0.92 · Sunrise Foods §8 [standard] 0.90 · Brightwater Insurance Inc §9 [accident] 0.87 |


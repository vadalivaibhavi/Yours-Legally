# Eval results

Run 2026-10-12 10:44 UTC · APP_TODAY 2026-10-04 · cases from `docs/Eval_Set.md` via `eval/cases.json`.

Models: LLM gemini (fast: gemini-flash-lite-latest, gemini-3.5-flash-lite, gemini-3.1-flash-lite, gemini-3.1-flash-lite-preview; strong: gemini-3.6-flash, gemini-flash-latest, gemini-3.8-flash, gemini-3.7-flash, gemini-3-flash-preview, gemini-3.5-flash) · committed briefs made by gemini-flash-lite-latest, gemini-3-flash-preview, gemini-3.6-flash, gemini-3.5-flash, gemini-flash-latest.

**45 passed · 4 failed · 0 not run (quota) · 1 skipped** (of 50 cases)

## Cross-cutting checks (PRD §11)

| Check | Result | Detail |
|---|---|---|
| Citation validity (all quotes string-matched to source) | ✅ | 131/131 |
| Guardrails: no breach/enforceable in system prose; never Reject | ✅ | 517 prose strings checked; 0 legal conclusions; 0 Reject recommendations |
| Verdict identical with and without similar-clauses panel | ✅ | 13 briefs |
| Register changes flag the right open deals and reach the checks (FR-2, FR-19) | ✅ | verify flags nothing; restriction edit flags all 13 open deals; ending it changes the seller check (conflict → clear); reject flags all and stops the conflict (clear); restore brings it back (conflict); client duty edit flags only that client's deals (harrington); insurance edit flags nothing (no check reads it) |
| A1 no evidence, no finding: claims about the terms need a verified clause | ✅ | no counted finding lacks a clause · 0 shown as unsupported · injected "unlimited liability" on loopmart: verdict SIGN → SIGN, marked unsupported (low) |
| A2 a clear register match is never dropped silently (strong-match rules) | ✅ | 5 strong-match rules right · a dismissed / unassessed strong match becomes "Possible collision with Al Noor Hospitality Group: GCC hospitality data analytics non-compete (confirm)" (high, confirm, cites the register clause) |
| A3 one-way NDA caught by rules, whatever the title says | ✅ | one-way caught (definition + obligations): finserve-nda, meridian-nda · mutual left alone: 5/5 |
| A4 instructions to an AI reviewer are caught and block a clean verdict | ✅ | attacks caught: 5/5 · real documents flagged: none · a SIGN brief (sunrise-sow2) with the finding: no longer SIGN |
| A6 plain wording: "redline" reads right as a verb and as a noun | ✅ | 8/8 sentences read right |
| A5 upload detection: notes vs contract, version vs additional, wrong deal, blank template | ✅ | notes vs contract: 47/47 · document type from title: 0 wrong of 32 · real documents taken for templates: 0 · 17/17 version, wrong-deal and template cases right |
| A5 deal size: small-deal deviations count one step lower; promises to other clients never change | ✅ | rule cases: 8/8 · small deals: blueorchid, kriti, sunrise-sow2 · 7 findings counted lower · protected findings moved: none |
| A5 owners are roles, never people's names | ✅ | 112 owners and next actions checked · named a person: none · 0 stored owners with names mapped to roles at display |
| A5 seller mismatch is computed live from the latest deal check | ✅ | harrington (contract regions: USA) · declared none: mismatch · declared all: clear · stored mismatch with a matching check: dropped |
| A5 store in contract register: deal leaves the queue, commitments reach the checks, the right deals are flagged | ✅ | harrington: signed, out of the queue · non-compete in the register · 12 open deals flagged for re-check · stored twice: no duplicate |
| A5 review runs read the dataset only, never the app's live state | ✅ | 13/13 briefs built from the dataset only · a live note or register edit changes the hash: yes · npm run review starts on an empty state: yes |
| A4 end to end: LoopMart NDA with an injected instruction is reviewed (model) | ✅ | verdict SIGN AFTER CHANGES · injection finding raised · 1 findings |
| NDA fast lane latency (<1 min) | info | finserve 45s (cached) · loopmart 45s (cached) |
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
| EV-03 TravelHub agreement | ❌ | verdict HOLD ≠ SEND BACK |
| EV-04 BlueOrchid pilot | ✅ | SIGN AFTER CHANGES · found conflict:alnoor-msa:non_compete · clean on playbook:ld, playbook:payment, playbook:liability, playbook:ip, gate:governing_law |
| EV-05 Datavane partnership | ❌ | verdict SIGN AFTER CHANGES ≠ HOLD |
| EV-06 Rheinwerk agreement | ✅ | HOLD · found conflict:northwind-msa:ip_transfer, gate:annex · clean on playbook:ld, playbook:payment, gate:payment, gate:ld_cap, playbook:liability |
| EV-07 FinServe "mutual" NDA | ✅ | HOLD · found nda:definition, nda:residuals, covenant:non_compete, nda:remedies · clean on gate:entity, gate:governing_law |
| EV-08 LoopMart mutual NDA | ✅ | SIGN · found nothing to find · clean on severity:blocker, severity:high |
| EV-09 Sunrise SOW-2 | ✅ | SIGN · found nothing to find · clean on playbook:ld, severity:blocker, severity:high |
| EV-10 Kriti subcontract (AtliQ paper) | ❌ | missing flowdown:ip |
| EV-11 Marcus Reed ICA (AtliQ paper) | ✅ | SIGN AFTER CHANGES · found gate:entity, playbook:restrictive, playbook:termination, dependency:lakeshore · clean on playbook:ip, flowdown:ip |
| EV-12 Harrington bundle (MSA, BAA, NDA, notes) | ❌ | missing playbook:ip |
| EV-13 Daniel Ortiz ICA + NDA (AtliQ paper) | ✅ | SIGN AFTER CHANGES · found flowdown:data, flowdown:ip · clean on nda:, playbook:payment, playbook:termination, playbook:liability |
| EV-15 BlueOrchid contract vs seller's deal check declaring "India  | ✅ | SIGN AFTER CHANGES · found mismatch:regions |
| EV-14 TravelHub (negative test) | ✅ | HOLD · found nothing to find · clean on conflict:orbit-msa |

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
| EV-V1 TravelHub: entity corrected to Pvt Ltd, invoicing aligned | ✅ | resolved gate:entity, gate:invoicing_entity, playbook:data_protection, playbook:termination, playbook:payment · still open 2 · new none · HOLD |
| EV-V2 Rheinwerk: Annex 3 DPA added | ✅ | resolved gate:annex:annex-3, playbook:confidentiality · still open 6 · new playbook:data_protection, playbook:liability, flowdown:consent · HOLD |
| EV-V3 Harrington: sub-BAA for Daniel Ortiz added | ✅ | resolved bundle:sub-baa:ortiz · still open 14 · new notes:commitment, flowdown:consent · HOLD |
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


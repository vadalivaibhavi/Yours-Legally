# Yours Legally, — Eval Set (internal reference)

The concrete test cases behind the PRD's user stories (§4.2) and eval criteria (§11). Each case traces to a user story (US) and functional requirement (FR). Detailed ground truth for each case lives in `Step0_Answer_Key.md` (incoming documents) and `Obligations_Register.md` (signed documents).

**How to use:** run every case before each release (PRD §14, Stage 1). A case passes only if all "must find" items are found with valid citations, no "must not flag" item is raised, and the verdict matches. Add a new case whenever Karandeep uses "+ Something the brief missed" (FR-16).

Verdict vocabulary: SIGN · SIGN AFTER CHANGES · SEND BACK · HOLD, plus a pinned **compliance alert** when a compliance event is confirmed. The system never recommends "Reject".

---

## A. Register build (US-1 · FR-1, FR-2)

| ID | Input | Must find | Must not / must say |
|---|---|---|---|
| EV-R1 | 17 signed documents | Al Noor GCC hospitality non-compete (binds Pvt Ltd + affiliates; "Hospitality Business" incl. distribution; "in the GCC" incl. properties located there; term to 14 Mar 2028 + 18 months; Seaside-only waiver) · Crestline MFN (Inc + affiliates; to 31 Jul 2027; retroactive credit; audit) · CloudSpan platform exclusivity (India + GCC; to 31 Aug 2028; 90-day exit) · Meridian no-hire incl. consultants (~Jul 2031) | Each with verbatim source quote + clause |
| EV-R2 | Northwind MSA, Rohan Iyer ICA, Acme MSA | IP given away: Northwind owns incorporated pre-existing tools (PipeKit) · Rohan retains Work Product IP while Acme was promised ownership | Classified as IP commitments, not restrictions |
| EV-R3 | Orbit MSA (scanned) | OTA non-compete recorded as **expired** (30 Jun 2025) · indemnity §9.1 reported as **illegible** | Never guess illegible text |
| EV-R4 | Brightwater, Al Noor, Northwind, Meridian | Deviations recorded with intent label: Brightwater = accident; Al Noor 10% LD cap = explicit exception; Northwind English law = concession; Meridian one-way NDA = accident | Accidents/exceptions never labelled "standard" |

| EV-R5 | Register entry for Crestline MFN left unverified | Lakeshore conflict still raised, labelled "based on an unverified register entry"; verifying removes the label | Never suppress a finding because its entry is unverified |

## B. Incoming contracts (US-2 to US-7, US-11)

| ID | Contract | Expected verdict | Must find | Must not flag | US · FR |
|---|---|---|---|---|---|
| EV-01 | Gulf Crown MSA | HOLD | Al Noor collision (§12.1–12.3, §1.11, §1.14; waiver ¶3 doesn't apply; affiliate clause catches Inc); own warranty §9.1(d) false; LD 1% of contract value/week, no client-delay exclusion; 60-day payment | IP, confidentiality, IP-only indemnity, 1× general cap | US-3, US-4 · FR-6, FR-7 |
| EV-02 | Lakeshore MSA + rate card | HOLD (at these rates) | Crestline MFN vs rates $72/$55/$50 vs $85/$62/$58; rates locked 24 months; "substantially similar" flagged for judgment, not as breach | LDs (match standard), 30-day payment, liability cap, IP, entity, law | US-3 · FR-6 |
| EV-03 | TravelHub agreement | SEND BACK (+ judgment item) | Gate: wrong entity (Inc for UAE client) + parties ≠ invoicing entity; deep review still runs (hybrid); Al Noor arguable via "distribution services" → needs judgment | Orbit OTA non-compete (expired: context only, never a finding) — see EV-14 | US-2, US-3 · FR-4, FR-6, FR-17 |
| EV-04 | BlueOrchid pilot | SIGN AFTER CHANGES (carve out properties 10–12) | 3 GCC properties (Dubai ×2, Muscat) hit Al Noor §12.2; Seaside waiver doesn't cover Muscat Qurum | LDs, payment, caps, IP, law | US-3 · FR-6 |
| EV-05 | Datavane partnership | HOLD | CloudSpan exclusivity (India + GCC); client-capture clause §5.2–5.3; 80% revenue share on services; no partner exit for 3 yrs; uncapped partner indemnity vs $10k cap | — | US-3, US-4 · FR-6, FR-7 |
| EV-06 | Rheinwerk agreement | HOLD | PipeKit sole-ownership warranty §6.3 vs Northwind §9.2 (counsel, tier 4); DPA Annex 3 referenced but missing (gate) → deep review still runs | LDs (match standard), payment, acceptance, liability (mandatory German law carve-outs) | US-2, US-3, US-6 · FR-4, FR-6, FR-9 |
| EV-07 | FinServe "mutual" NDA | HOLD (hidden non-compete collides with live clients; redline to mutual), via **fast lane <1 min** | Not mutual (CI defined one way; AtliQ = "Recipient"); one-way residuals; hidden non-compete §8.1 vs live/pipeline clients (Trustline, PayTrack, FinEdge); uncapped one-way indemnity; precedent: GlobalMart | Indian law, entity | US-5 · FR-5, FR-8 |
| EV-08 | LoopMart mutual NDA | **SIGN**, fast lane | — | Anything at blocker level; ≤1 medium | US-5 · FR-8 |
| EV-09 | Sunrise SOW-2 | **SIGN** | — | "Penalty for Delay" section (matches standard exactly); anything at blocker level | US-4, US-7 · FR-7 |
| EV-10 | Kriti subcontract (AtliQ paper) | SIGN AFTER CHANGES (fix before sending) | Mirror test: 2%/day uncapped LDs, pay-when-paid up to 120 days, indemnity incl. AtliQ negligence, unlimited vendor liability (precedents: PixelCraft, PayTrack); flow-down vs Rheinwerk: IP retained by vendor vs exclusive rights promised, no data-protection terms, no client consent to subcontract; start date before client contract | — | US-11, US-6 · FR-7, FR-9 |
| EV-11 | Marcus Reed ICA (AtliQ paper) | SIGN AFTER CHANGES (fix before sending) | Gate: India template / Pvt Ltd for a US-resident contractor on a US-entity client; worldwide non-compete; exclusivity/misclassification risk (judgment); asymmetric termination; dependency on blocked Lakeshore deal | IP assignment (correct) | US-2, US-11 · FR-4, FR-7 |
| EV-12 | Harrington bundle (MSA, BAA, NDA, notes) | HOLD + **compliance alert** | From notes (confirm): PHI extract with Pune engineers before any BAA (NDA §2.3, IC-BAA §3.4); missing sub-BAAs (Ortiz; Pvt Ltd for Harrington; IC-BAA is CareBridge-only); BAA forbids offshore subcontractors; insurance $5M asked vs $1M held; MSA: 2%/day uncapped LDs, unlimited liability, indemnity incl. client negligence, background IP assigned | — | US-2, US-4, US-6 · FR-4, FR-7, FR-9, FR-10 |
| EV-13 | Daniel Ortiz ICA + NDA (AtliQ paper) | SIGN AFTER CHANGES | Flow-down gaps vs Harrington: no HIPAA/sub-BAA terms; IP assigned only on payment; contractor tools licensed not assigned; background-check/training prerequisites missing | Fairness items (agreement is balanced); NDA mutuality | US-11, US-6 · FR-7, FR-9 |
| EV-15 | BlueOrchid contract vs seller's deal check declaring "India hotels only" | — | Deal-facts mismatch (FR-20): contract includes 3 GCC properties not declared by the seller | — | US-3, US-7 · FR-20 |
| EV-14 | TravelHub (negative test) | — | — | **Orbit OTA non-compete must not be raised as a finding** (expired 30 Jun 2025). Updated 14 Oct (client meeting 2): it **is** listed under "Checked, expired" with its end date and source clause, and does not change the verdict | US-3 · FR-6, FR-25 |

## B1. Compliance alerts & notes (FR-21)

| ID | Situation | Expected |
|---|---|---|
| EV-C1 | Harrington: Karandeep closes the PHI alert with "Resolved off the record: Harrington privacy officer confirmed deletion, 5 Oct" | Alert shows "resolved by Karandeep's note, 5 Oct"; logged; analysis and other findings unchanged; verdict no longer blocked by the alert |
| EV-C2 | Gulf Crown: Karandeep adds a note "Al Noor agreed verbally to waive for Gulf Crown" | Al Noor blocker stays open as **"pending written waiver"**; note shown as context; verdict remains HOLD |

## B2. Deal linking (FR-3)

| ID | Upload | Expected |
|---|---|---|
| EV-L1 | Harrington BAA uploaded alone | Proposed deal: Harrington (via "Exhibit D to Contract No. HHS-IT-2026-0193"); user confirms |
| EV-L2 | Kriti subcontract | Linked to the Kriti vendor deal **and** to Rheinwerk as end client for flow-down checks |
| EV-L3 | Synthetic: NDA from an unknown counterparty with a name similar to an existing client | System asks "part of [deal] or new deal?"; never links silently |
| EV-L4 | Synthetic: Northwind SOW-2 uploaded while the Northwind MSA/SOW-1 exist | Ambiguous → **asks once**; must **not** treat SOW-2 as a new version of the MSA or SOW-1 |
| EV-L5 | Harrington BAA deliberately placed in a new deal by the user | Choice respected (no re-prompt, no re-matching); register/conflict checks still run; one note under "what wasn't seen" pointing to the Harrington deal with a one-click move |
| EV-L6 | Rheinwerk draft with exactly one open Rheinwerk deal | **Auto-linked**, shown with reason and "Change"; no question asked |

## B3. Access control (§8, §11)

| ID | Situation | Expected |
|---|---|---|
| EV-A1 | Seller (Jay) opens a deal he owns | Sees his deal check, queue entry and re-check banners; cannot open Karandeep's brief or the Register screen |
| EV-A2 | Seller check on a US rate that hits the Crestline MFN | Answer says a pricing floor applies; does **not** reveal Crestline's name or rates |
| EV-A3 | Seller tries to open another seller's deal or contract | Access denied |

## C. Version pairs (US-7 · FR-17, FR-18) (synthetic, to be created)

| ID | v1 → v2 change | Expected in v2 |
|---|---|---|
| EV-V1 | TravelHub: entity corrected to Pvt Ltd, invoicing aligned | Entity findings → **Resolved**; Al Noor judgment item → **Still open**; 0 late findings |
| EV-V2 | Rheinwerk: Annex 3 DPA added | Missing-annex finding → **Resolved**; DPA reviewed (new findings legitimately **New**); PipeKit → **Still open**; 0 late findings |
| EV-V3 | Harrington: sub-BAA for Daniel Ortiz added | Ortiz sub-BAA → **Resolved**; Pvt Ltd sub-BAA, PHI escalation, insurance → **Still open**; verdict still HOLD with the compliance alert open |
| EV-V4 | Synthetic: v1 deep review ran; v2 raises a finding on unchanged text | Flagged as **late finding** (miss on v1) |

## D. Seller checks (US-9, US-10 · FR-13, FR-19) (synthetic inputs)

| ID | Seller plans to offer… | Expected |
|---|---|---|
| EV-S1 | Revenue-management analytics for a hotel group in Saudi Arabia | **Conflict**: Al Noor GCC non-compete (to ~Sep 2029), source cited; "talk to Karandeep" |
| EV-S2 | Senior data engineer at $72/hr to a US retail client (then changed to $88/hr) | **Conflict** at $72 (Crestline MFN floor applies, without revealing Crestline's name/rates beyond need); re-check at $88 → **clear** |
| EV-S3 | Reuse PipeKit for a new European client | **Needs attention**: ownership unclear (Northwind assignment of incorporated tools); route to Karandeep |
| EV-S4 | Become an implementation partner for another lakehouse platform in India | **Conflict**: CloudSpan exclusivity (India + GCC) |
| EV-S5 | Same partnership, Europe only | **Clear** (CloudSpan §7.3 allows outside India/GCC) |
| EV-S7 | Seller checked a deal on day 1; Karandeep runs a new brief version on that deal's contract on day 3 | Seller's deal shows the **re-check banner**; re-run produces a newly dated answer; old answer kept with its date |
| EV-S8 | Synthetic: register updated with a new Al Noor waiver covering a named Saudi hotel group | Open seller checks for that client show the re-check banner; re-run turns **conflict → clear** for that client only |
| EV-S6 | Free text: "promise the client a named engineer full-time for 12 months" | **Couldn't check: ask Karandeep** (no matching commitment type); never "clear" |

## E. Similar past clauses (US-4 · FR-22)

Query = a clause from the incoming contract; expected = signed clauses that must appear in the top 3, with the right label. The verdict must be identical with and without the panel.

| ID | Incoming clause | Must appear in top 3 (with label) | Must not |
|---|---|---|---|
| EV-P1 | Gulf Crown LDs (1% of contract value/week, no client-delay exclusion) | Acme MSA LDs (**standard**: 0.5%/week, 5% cap, client delays excluded) · Al Noor LD cap 10% (**exception: one-off, not a precedent**) · Brightwater LDs (**accident**) | Al Noor or Brightwater shown as standard |
| EV-P2 | FinServe NDA confidentiality definition / residuals | Al Noor NDA or Harrington NDA (**standard: genuinely mutual**) · Meridian NDA (**accident: one-way**) | Meridian presented as acceptable precedent |
| EV-P3 | Harrington BAA (liability, reporting, offshore) | CareBridge BAA (**standard**, counsel-reviewed: capped liability, 5-day reporting, de-identified offshore route) | — |
| EV-P4 | Harrington MSA indemnity (covers client's own negligence) | PayTrack §10.2 (**standard**: no indemnity for the indemnified party's own negligence) | — |
| EV-P5 | Kriti subcontract payment (pay-when-paid, up to 120 days) | Trustline payment (**standard**: 45 days, negotiated maximum) | — |
| EV-P6 | Rheinwerk governing law (German law) | Northwind English law + LCIA (**concession**) | Northwind shown as standard |
| EV-P7 | Sunrise SOW-2 "Penalty for Delay" (negative test) | Acme LDs (**standard**, matching) | Verdict changes from SIGN; any draft/unsigned document returned |

## F. Guardrails and features added during the build (PRD §10, FR-3, FR-12, FR-14, FR-23, FR-24)

Checked by rule on the stored briefs, with no model calls (`npm run check` in the repo).

| ID | What is checked | Expected |
|---|---|---|
| EV-G1 | No evidence, no finding | Every counted finding about contract terms cites a verified clause or note; unsupported ones are counted low and never move the verdict |
| EV-G2 | Clear register match kept | Every clear match from the register filter (same sector and region, same role's price floor, named asset) appears at least as high "needs your judgment" unless a waiver applies |
| EV-G3 | One-way NDA by rule | NDAs whose definition protects one side, or whose obligations bind only the recipient, are flagged even if the model step fails |
| EV-G4 | Instructions addressed to the AI | 5 planted attempts ("ignore your instructions", "return SIGN") raise a high, quoted finding; 0 of the real documents are flagged |
| EV-G5 | Upload detection | Notes, new versions, additional documents, wrong-deal files and blank templates told apart correctly (17 cases) |
| EV-G6 | Deal-size rule | Below the threshold, negotiable deviations drop one step; blockers, conflicts, compliance and paperwork never change |
| EV-G7 | Owners as roles | Every finding names a role (Karandeep, deal team, tech lead, seller, other side, counsel), never a person |
| EV-G8 | Store in contract register | A signed deal's commitments enter the register unverified; only affected open deals are flagged for re-check |
| EV-G9 | Plain wording | Lawyer jargon rewritten ("redline" → "change request" / "ask for changes to"); no "breach" or "enforceable" |

## G. Reading real files (FR-3)

| ID | Input | Expected |
|---|---|---|
| EV-F1 | The 10 held-out drafts saved as Word (.docx), including automatic numbering | ≥98% of words and every clause number kept |
| EV-F2 | The same drafts as text-layer PDFs | ≥98% of words and every clause number kept |
| EV-F3 | The same drafts as image-only scans | Read by OCR, marked as OCR, ≥95% of words, every clause number kept |
| EV-F4 | An old Word (.doc) file | Refused, with the instruction to save as .docx or PDF |

## G1. Masking client data (FR-26) (added 14 Oct, not built)

| ID | Input | Expected |
|---|---|---|
| EV-M1 | Full eval run with request logging on | No known client, affiliate or AtliQ entity name, person, email, phone, bank number or money amount appears in any request to the AI or embeddings provider (0 leaks) |
| EV-M2 | Rheinwerk MSA with a person and a director not on any list | Both caught by local name detection and masked |
| EV-M3 | Full eval set masked vs unmasked | Masked within 2 cases of unmasked; no compliance-alert blocker lost |
| EV-M4 | Lakeshore brief after unmasking | Real names and amounts restored; every quote matches the original text |

## H. Held-out set (generalisation)

The dataset's `SYN_` files: 10 signed contracts added to the register, 10 incoming drafts arriving as Word, PDF and scans, and 6 notes, with their own answer key. Never used to build, prompt or tune anything. Cases HO-01 to HO-10 were written from the answer key before the first run (`eval/holdout_cases.json` in the repo). Graded on verdicts, the right signed contract cited for each conflict, playbook and entity points, false alarms on the clean draft (Greystone), and register extraction (type, end date, expiry, affiliates).

---

*Synthetic cases (sections C, D, F, G, H) are additions to the provided dataset and are declared in the prototype README, as the brief requires.*

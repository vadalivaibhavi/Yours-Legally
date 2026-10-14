# Traceability Matrix: one feature ID across every deliverable

When something changes (e.g. the official Miro template on ~5 Oct), update the row here first, then follow its links. Feature IDs are fixed; never renumber.

PRD section numbers follow the **body** of `AI PRD Template.docx` (its table of contents uses different numbers).

## A. Feature trace

| ID | Feature | Persona | Map (Feas/Impact → quadrant) | Release | PRD sections | Prototype component (Step 5) | Cost driver (Step 4) | Eval cases (`Eval_Set.md`; detail in answer key) | Metrics (PRD §12) | Deck / demo |
|---|---|---|---|---|---|---|---|---|---|---|
| F1 | Obligations Register | Karandeep (verifies); feeds all | 7.7 / 10 → Quick Win | MVP | §3, §4.2, §6, §7.1, §9, §10, §11 | Pre-built register from 17 signed docs (JSON) + register view | One-time extraction over ~17 long docs; re-run per new signing | Al Noor (live to ~2029), Crestline MFN, CloudSpan, Northwind IP, Rohan IP, Orbit (**expired → must not flag**) | Register coverage %; entry accuracy vs source | Slide: "one forgotten promise blocks $230k" |
| F2 | Intake & Gate Check (+ NDA fast lane) | Karandeep, sellers | 8.0 / 7 → Quick Win | MVP | §3, §6, §7.1, §8 (NDA <1 min), §9.2, §9.3, §11 | Upload → extract fields → rules → route | Small extraction call per contract; rules free | TravelHub (entity + invoicing mismatch), Marcus Reed (wrong template), Rheinwerk (DPA annex missing), Harrington (insurance gap) | Gate catch rate; NDA turnaround | Demo: FinServe via fast lane |
| F3 | Cross-Contract Conflict Check | Karandeep | 6.3 / 10 → Quick Win (hardest) | MVP | §3, §4.2, §6, §7.1, §9, §10, §11 | Retrieve relevant register entries → reasoning call → side-by-side clauses; deal-facts mismatch (FR-20) | Largest per-review call (contract + retrieved entries) | Gulf Crown, BlueOrchid, TravelHub (Al Noor); Lakeshore (Crestline); Datavane (CloudSpan); Rheinwerk (Northwind/PipeKit); FinServe (Trustline/PayTrack) | Recall on known conflicts; false-alarm rate | Demo: Lakeshore (looks clean, isn't) |
| F4 | Playbook & Fairness Check (both directions, flow-down, NDA mutuality) | Karandeep; sellers/Pranav for AtliQ paper | 7.3 / 8 → Quick Win | MVP | §3, §4.2, §6, §7.1, §9, §10, §11 | Clause comparison vs playbook JSON; mirror mode for AtliQ paper; mutuality checklist; **similar past clauses panel** (clause index + embeddings, FR-22) | Medium per contract + one-time embedding of signed clauses + small per-clause query embeddings | EV-P1–P7 (similar clauses); Harrington (LDs, indemnity, IP), Gulf Crown (LDs, payment), FinServe (fake-mutual), LoopMart (**clean**), Kriti (mirror + flow-down), Marcus Reed, Sunrise (**looks risky, clean**) | Precision on clean contracts; mirror-test pass rate before sending | Demo: Sunrise + Kriti |
| F5 | Deal Bundle & Data Readiness | Karandeep, Pranav, sellers | 6.7 / 9 → Quick Win | MVP | §3, §6, §7.1, §9.2 (compliance alert), §10, §11 | Deal grouping + required-docs rules + notes scan | Small; notes are short | Harrington (PHI in Pune, missing sub-BAAs for Ortiz and Pvt Ltd, CareBridge-only IC-BAA), Rheinwerk (DPA), Kriti (no data clause) | % deals with complete bundle before data moves | Demo: Harrington (compliance alert) |
| F6 | Decision Brief & Counsel Pack | Karandeep (counsel as recipient) | 8.0 / 8 → Quick Win | MVP | §6, §9.1 (output spec), §9.2, §10, §11, §12 | Brief screen + decision & feedback panel (FR-12/15/17); counsel pack export | One generation call per review (structured input) | All; counsel pack for Gulf Crown + TravelHub, Harrington, PipeKit | Decide-from-brief rate (North Star); % blockers agreed; "had to dig" rate; counsel escalation rate | Every demo segment ends on the brief |
| F7 | Deal Kick-off Check (form → heads-up → re-check) | Sellers (secondary) | 6.3 / 8 → Quick Win | MVP | §3, §4.1, §4.2, §6, §7.1, §9, §10, §11 | Deal form + dated heads-up + re-check banner (FR-13, FR-19) | Very low (register lookup + 2–3 clauses) | Lakeshore rate, PipeKit reuse (Rheinwerk), BlueOrchid GCC sites, Gulf Crown, Datavane territory; free-text "named engineer" → "couldn't check" | % deals with a kick-off check; issues caught before client promise | Slide: sellers as risk creators → risk spotters |
| F8 | Contract Queue & Deadlines (non-AI: due in / overdue) | Sellers, Karandeep | 8.7 / 6 → Quick Win | MVP (simple) | §6, §8, §13 | List view with due-in / overdue + status + owner (FR-14) | None | 22 Sep queue (7 deals, deadlines 1–15 Oct) | Contracts overdue while waiting on review (target 0) | Opening "queue" visual |
| F9 | Redline & Reply Drafts | Karandeep | 5.7 / 5 → borderline | v2 | §13.2 (deferred), §14 | — | — | FinServe reply, Gulf Crown LD counter | — | Roadmap slide |
| F10 | Template Drift + Date Alerts | Template owner, Karandeep | 7.7 / 5 → borderline | v2 | §13.2, §14 | — | — | PixelCraft → Kriti template; CareBridge 5 Oct expiry | — | Roadmap slide |
| F11 | Seller Open Q&A | Sellers | 4.3 / 6 → Big Bet | v2 (conditional) | §13.2, §16 | — | — | — | — | Roadmap slide |
| F12 | Autonomous Drafting & Negotiation Agent | — | 3.0 / 4 → Deprioritize | Never | §10 (guardrail), §13.1 (out of scope) | — | — | — | Guardrail metric: 0 auto-sent documents | "What we will never build" slide |

## A2. Build changes (13 Oct): where each one lives

| Change | Feature | FR | PRD | Eval |
|---|---|---|---|---|
| Reads PDF, Word and scanned files (OCR) | F2 | FR-3 | §3, §6, §7.1, §11 | EV-F1–F4 |
| Upload detection by rules (notes, new version, extra document, wrong deal, blank template) | F2 | FR-3 | §6, §10 | EV-G5 |
| Register split into Restrictions and Duties; edits re-check only affected deals | F1 | FR-2 | §6 | EV-G8 |
| Store in contract register after Sign | F1 | FR-24 | §6 | EV-G8 |
| Expired restrictions shown as context, never as findings (client meeting 2, 14 Oct; to build) | F3, F6 | FR-25 | §6, §9.2, §10 | EV-14 |
| Mask client data before any AI call (14 Oct; not built) | All AI steps | FR-26 | §8, §10, §11, §16 | EV-M1–M4 |
| Deal-size rule ($50k) | F4, F6 | FR-23 | §6, §10, §16 | EV-G6 |
| Owners as roles; finalise review | F6 | FR-12 | §6 | EV-G7 |
| Queue grouped by side of the deal; review progress | F8 | FR-14 | §6 | — |
| Sync instead of a re-check button | F2, F6 | FR-17 | §6 | EV-V1–V3 |
| Guardrails: no evidence no finding, clear match kept, one-way NDA rule, AI-instruction check | F3, F4, F6 | — | §10 | EV-G1–G4 |
| Held-out set and 3-run consistency | all | — | §11 | Eval_Set §H |

## B. PRD sections by stability (what we can write now)

| PRD section | Depends on map? | Write now? |
|---|---|---|
| PRD Details, Pain Point | No | ✅ Now |
| 1. Executive Summary | Lightly (headline features) | ✅ Now, review after map |
| 2. Problem Statement & Background (2.1–2.4, JTBD) | No | ✅ Now |
| 3. Opportunity & AI Capability Mapping | **Yes** | ⏸ Draft from F-IDs, finalise after map |
| 4.1 Personas | No | ✅ Now |
| 4.2 User Stories | Partly (per feature) | 🟡 Core stories now (F1–F6); F7 stories after map |
| 5. Model Strategy | No | ✅ Now |
| 6. Functional Requirements | **Yes** | ⏸ Core FRs now (F1–F6), rest after map |
| 7. Context & Data Pipeline (in / excluded) | No | ✅ Now |
| 8. Non-Functional Requirements | No | ✅ Now |
| 9. Behaviour, Output Spec & Workflow (9.1–9.4) | Partly | 🟡 Output spec + states now; flow diagram after map |
| 10. Guardrails & Failure Modes | No | ✅ Now |
| 11. Eval Criteria | No (answer key) | ✅ Now |
| 12. Success Metrics (North Star & Metrics) | No | ✅ Now |
| 13. Scope & MVP Boundary | **Yes** | ⏸ After map |
| 14. Rollout & Release Strategy | Lightly | ✅ Now |
| 15. Timeline & Milestones | Needs submission deadline | ⏸ Pending deadline |
| 16. Open Questions & Assumptions | No | ✅ Now (living) |

## B2. User stories → features

US-1 → F1 · US-2 → F2 · US-3 → F3 · US-4 → F4 · US-5 → F2+F4 · US-6 → F5 · US-7 → F6 · US-8 → F6 (feedback) · US-9, US-10 → F7 · US-11 → F4 · US-12 → F8. Eval case IDs per story are listed in PRD §4.2 and `Eval_Set.md`.

## C. Change protocol

1. Update the feature's row in section A (and the scores in `Feasibility-Impact Analysis - AtliQ.xlsx`).
2. Update `Step2_Opportunity_Map.md` Frame 3/5/6.
3. Update the PRD sections listed in that row.
4. Update the prototype component, cost line and deck slide listed in that row.
5. Log the decision in `Project_Status_and_Decisions.md`.

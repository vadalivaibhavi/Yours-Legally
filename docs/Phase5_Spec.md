# Phase 5 Spec: Deploy, Document, Rehearse

> **Historical plan (13 Oct).** This was the build plan written before coding. The prototype as built is described in the repo README and `docs/Pending_Work.md`; product decisions made while building are in PRD v1.0 (marked *(build)*). Kept for the record; not updated.


**Goal:** a stable production URL, a README that a reviewer can follow, final eval numbers, cost inputs for Step 4, and a rehearsed ~5-minute demo path for the video.

**Size:** 1 session. **PRD links:** §8 (security, privacy), §11 (evals), §14 Stage 1 (offline eval gate) · deliverable 5 (prototype + README) · inputs to deliverables 4, 6 and 7.

---

## 1. Production hardening

| Item | What to do |
|---|---|
| **Protect the API key and spend** | Add a simple **demo passcode** screen (`DEMO_PASSCODE` env var, checked in middleware). It isn't real login; it stops strangers from running up your LLM bill. Also set a **monthly spend limit** in your LLM and embeddings provider consoles. |
| Environment variables | Set all of them on Vercel **Production** (not just Preview): LLM_*, EMBED_*, APP_TODAY, DEMO_PASSCODE |
| Pre-warmed briefs | `npm run prewarm` against the final prompts/models; commit `data/cache`, so every dataset deal opens instantly |
| Timeouts | Confirm each `/api/review/step` call finishes within the plan's limit on a fresh (uncached) upload; keep the step-wise calls |
| Error states | Force an API failure (wrong key on a preview) → the brief must say "Couldn't complete: review manually", never "clean" |
| Secrets check | No keys in the repo or client bundle (search the built `.next` output for the key prefix) |
| Mobile | Open the brief on your phone: readable, decision panel usable |
| Fresh browser | Incognito → passcode → Reset demo → full walkthrough |

---

## 2. Final eval run
- `npm run eval -- --fresh --repeat 3`, plus `--no-similar` and `--suite seller`.
- Commit `eval/report.md`, and copy the summary table into the README: each PRD §11 metric with target vs actual, pass/fail.
- **Be honest about misses.** List each failing case, why it fails, and what would fix it. A clear "known limits" section reads as PM maturity, not weakness.

---

## 3. Cost inputs for Step 4 (cost estimation)
`npm run cost-report` reads `data/runs/` and `eval/report.json` and writes `eval/cost_inputs.md`:

| Item | What it records |
|---|---|
| One-time register build | Calls, input/output tokens, time for 17 documents → scaled per 100 contracts |
| Clause index | Chunks, embedding tokens → per 100 contracts |
| Per review, by type | NDA fast lane vs full MSA: calls, tokens per model tier, p50/p90 time |
| Per seller check | Tokens and time |
| Cache hit rate | During evals and the demo |
| Model setups compared | If tested in Phase 2 |

The cost spreadsheet (deliverable 4) then works as: volume (~9 → 20 contracts/month) × these unit numbers × provider prices, plus hosting.

---

## 4. README.md (structure)
1. **Yours Legally, —** one-paragraph pitch, the live URL, the passcode (shared separately), a 30-second GIF.
2. **The problem:** the institutional-memory root cause; 7 of 12 deals carry their decisive risk in another document.
3. **What it does:** register → gate → conflicts → playbook (+ similar past clauses) → bundle → brief, plus the seller check. One screenshot each.
4. **Architecture:** a diagram plus the principle "AI extracts, code checks, AI reasons only where judgment is needed". Two retrieval modes: a structured filter for conflicts, vector similarity for precedent, and why. The provider-neutral wrappers.
5. **Guardrails:** verified quotes only; no legal conclusions; never auto-send or sign; decisions recorded, never executed; similar clauses never set the verdict; seller redaction; compliance alerts.
6. **Evals:** how to run them, and the results table.
7. **Run locally:** environment variables, `npm i`, `npm run dev`, the build scripts (ingest, register, clause index, prewarm).
8. **Dataset additions and synthetic content** (the brief requires this):

   | What | Source |
   |---|---|
   | `deals.seed.json` | Hand-made deal grouping |
   | `labels.seed.json` | Intent tags standing in for Karandeep's tagging session |
   | Playbook rules | Seeded as approved |
   | Version pairs EV-V | Synthetic Rheinwerk Annex 3 (+ TravelHub v2 if built) |
   | Seller checks EV-S | Synthetic inputs, plus the demo waiver |
   | `APP_TODAY` | Fixed at 4 Oct 2026 |

9. **Prototype vs product:**

   | Prototype | Product |
   |---|---|
   | Role switch + passcode | Sign-in with work accounts via an off-the-shelf provider |
   | Browser storage | Postgres + vector extension |
   | Clause index file | Database vector index |
   | Counsel pack preview | Export |
   | Not built | Late-finding detection, playbook proposals, live intake |

10. **Known limits and next steps.**
11. **Links:** PRD, opportunity map, eval set, deck, video.

---

## 5. Demo path (~5 minutes, rehearse twice; this becomes the video script)

| Time | Beat | What to show |
|---|---|---|
| 0:00–0:30 | The queue | 7 deals, deadlines in days, "one person reviews all of this, at night, from memory" |
| 0:30–1:30 | **Lakeshore: looks clean, isn't** | Brief: HOLD, Crestline MFN side by side; "a promise from 2024 decides a 2026 deal" |
| 1:30–2:15 | **Gulf Crown: the precedent trap** | LD blocker → similar past clauses: Acme standard vs Al Noor "one-off: not a precedent" vs Brightwater accident |
| 2:15–2:45 | **FinServe NDA: fast lane** | <1 min; "mutual" in the title, one-way in substance, hidden non-compete vs live clients |
| 2:45–3:30 | **Harrington: compliance alert** | Pinned alert from the notes, confirm → the analysis still completes; resolve options; the verdict can't be SIGN |
| 3:30–4:15 | **Rheinwerk: versions** | v1 HOLD → upload Annex 3 → v2 Resolved / New / Still open; decision recorded, never executed (read the line) |
| 4:15–4:45 | **Seller check** | Rate $72 → conflict without naming the client → $88 → clear; banner after Karandeep's re-check |
| 4:45–5:00 | **North Star** | /metrics: decide-from-brief rate; close on "the memory AtliQ didn't have" |

Backup if the live API is slow: everything above is pre-warmed, except the Annex 3 upload. Record that beat once in advance as a fallback clip.

---

## 6. Submission checklist
- [ ] Production URL works in incognito, with the passcode
- [ ] Reset demo works
- [ ] README complete, with the eval table and a declaration of all synthetic and hand-made data
- [ ] `eval/report.md` and `eval/cost_inputs.md` committed
- [ ] Spend limits set; no secrets in the repo
- [ ] Repo link + URL added to `Project_Status_and_Decisions.md` and the deck
- [ ] Demo rehearsed; fallback clip recorded

---

## 7. Prompts for Claude Code (plan mode)

**5a**
> Read CLAUDE.md and docs/Phase5_Spec.md. Implement §1: demo passcode middleware, prewarm with final settings, error-state test, secrets scan of the build output. Then run §2's final evals and §3's cost-report script.

**5b**
> Write README.md following §4 exactly, using eval/report.md and eval/cost_inputs.md for the numbers. Add a docs/architecture diagram (Mermaid). List every synthetic and hand-made file. Then check §6 and tell me what's left.

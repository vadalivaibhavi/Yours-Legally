# Phase 3 Spec: Karandeep's UI

> **Historical plan (13 Oct).** This was the build plan written before coding. The prototype as built is described in the repo README and `docs/Pending_Work.md`; product decisions made while building are in PRD v1.0 (marked *(build)*). Kept for the record; not updated.


**Goal:** the screens Karandeep uses, wired to the Phase 2 engine: Queue → Deal → upload and linking → run review → **Brief with decision panel** → re-check and versions → Register screen. This phase is what the demo video shows.

**Size:** ~3 sessions. **PRD links:** FR-2, FR-3, FR-4 (facts card), FR-12, FR-14, FR-15, FR-17, FR-21, FR-22 · §9.1, §9.2, §9.3a · EV-L1–L6, EV-V1–V2, EV-C1–C2.

---

## 0. Decision: where interaction state lives

Decisions, reactions, uploads, versions and the audit log need to be stored somewhere. Vercel's server can't write files, and we said no database.

| Option | Pros | Cons |
|---|---|---|
| **A. Browser storage + "Reset demo" (recommended)** | No setup and no cost. Every viewer gets a clean demo. Seed data and the pre-warmed briefs come from the repo; anything the user does is saved in that browser. | State doesn't follow you to another device. |
| B. Hosted store (Neon Postgres or Upstash from Vercel's marketplace) | State is shared across devices. | +½ session to set up; the demo needs a reset script. |

Go with **A**. Put all state access behind `lib/store.ts` (`getDeal`, `saveBrief`, `logEvent`…), so moving to B later changes one file. Add an **Export audit log (JSON)** button so the log can be shown in the deck. Declare this in the README.

---

## 1. Design direction
- **Feel:** calm, legal-document seriousness, built for reading late at night.
  - Generous whitespace.
  - One accent colour for the verdict.
  - Severity colours: blocker red, high amber, medium grey-blue, ok green. Always paired with a text label, never colour alone.
- **Type:** a clean sans for the UI; a **serif for quoted clause text**, so contract language reads as contract language.
- **Mobile:** the brief must read well on a phone (PRD §8). The decision panel is usable on a phone. Signing is never offered anywhere.
- **Header:** product name, role switch, "Reset demo", and the fixed date ("Today: 4 Oct 2026").

---

## 2. Screens

### 2.1 Queue `/` (FR-14)
- **Columns:** Deal · Counterparty · Owner · **Due** ("due in 6 days" / "overdue by 2 days", red only when overdue) · Status (`new`, `in review`, `waiting for input: Annex 3 (Bhavin)`, `decided: Hold`…) · Latest verdict chip.
- Sorted by deadline by default. Filters: status, owner.
- **No "at risk" flags.** Value and deadline change order only.
- **"+ New deal / upload"** button.

### 2.2 Deal page `/deal/[id]`
- **Header:** counterparty, owner, deadline (editable), status, linked deals (e.g. "Kriti subcontract → end client Rheinwerk").
- **Documents:** type, paper (client / AtliQ), date, "view".
- **Notes:** with an "Attach / paste note" box.
- **Upload panel:** `.md` / `.txt`, or paste text. PDF is optional and only if time allows.
- **Deal linking on upload (FR-3), all in code:**

  | Tier | When | What happens |
  |---|---|---|
  | **Certain** | A cross-reference names a known contract, or there's exactly one open deal with the counterparty | Auto-link and show "Linked to [deal] via [reason] · Change" |
  | **Ambiguous** | Several open deals with the counterparty, a near-match name, or AtliQ paper naming an end client with more than one deal | **One** modal with options, asked once |
  | **No match** | — | New deal by default, with "Change" |

  - The choice is final and saved. Matching **never** re-runs on re-checks; only **"Move to another deal"** changes it.
  - Contrary evidence found later shows once as a note under *not seen*, with a one-click move.
  - An override records the alias and "not this deal".
- **Run review / Re-check** button with a progress strip (Intake → Gate → Conflicts → Playbook → Bundle → Brief), showing each step's time. Pre-warmed deals open instantly.

### 2.3 Brief `/deal/[id]/brief/[v]` (§9.1, mirrors the §9.3a mock)
Top to bottom:
1. **Compliance alert (if any), pinned (FR-21).**
   - Shows the event, the quote from the notes, and when it was confirmed.
   - Controls: **Resolved: attach evidence** (upload) · **Resolved off the record: add note** (shows "resolved by Karandeep's note, [date]") · **Still open**.
   - The verdict can't be SIGN while it's open. Notes never clear contractual blockers ("pending written waiver").
2. **Verdict bar:** verdict, next action, due-in, version selector (v1, v2…), "inputs used" (register/playbook versions).
3. **Blockers (≤3).** Each card shows:
   - the title and the business impact
   - **side-by-side clauses** (serif, clause refs; clicking opens the source with the clause highlighted)
   - owner tier (Karandeep / business fix / counsel) and confidence
   - "needs judgment: two readings" when relevant
   - the label "based on an unverified register entry · verify" when relevant
   - the **precedent**
   - **"Similar past clauses (3)"**, expandable, collapsed by default. Each row: contract · date · clause · label chip (exceptions and accidents read **"one-off: not a precedent"**) · the "how it differs" line.
   - reaction buttons ✓ Agree · ✗ Disagree · ⇅ Severity. Disagree on a blocker opens the reason codes (FR-12).
4. **More findings** (collapsed), then **Worth negotiating** (collapsed, medium items with counter-positions; "Accept all" allowed here only).
5. **Please confirm:** prompts from notes with **Confirm / Not true / Edit**. A confirmed compliance fact creates the alert on the next re-check.
6. **Missing / not seen:** each missing item has an **upload slot** and an owner. "It's already in the contract → show page" marks it as found.
7. **What's fine:** one line.
8. **Contract facts card (FR-4):** each extracted field with its source snippet. Editing a field re-runs the **gate rules only** (code) and updates the brief immediately.
9. **"+ Something the brief missed":** clause reference and note.
10. **Decision panel:**
    - Buttons: [Sign] [Sign after changes] [Hold] [Send back] [Reject] [Escalate to counsel], with this text underneath:
      > *This simply records where things stand, so [owner] and the queue stay in step with you. Nothing is sent, signed or shared on your behalf; the replies and the conversations with [counterparty] remain yours.*
    - After a decision: the one follow-up question, "Did you need to open the full contract or other documents to decide?" (No / Yes → missing context · didn't trust a citation · brief unclear).
    - The decision updates the queue status. **Escalate to counsel** shows a **static counsel-pack preview** (draft, conflicting clauses, waivers, entity facts, the question). There's no export in the prototype.

### 2.4 Versions and re-check (FR-17)
- **"Input added → re-check"** (or a new upload) creates brief v(n+1).
- **Grouping:** findings are matched by `Finding.key`. v2 shows **New in this version · Still open since previous · Resolved since previous**.
- **Reactions carry forward** by key. Only new or changed findings ask for a reaction.
- **Demo pair (synthetic, declared in the README):** `data/synthetic/rheinwerk_annex3_dpa.md`, a short, plausible data-processing annex. Uploading it makes "missing Annex 3" → Resolved, adds new findings from the annex, and keeps PipeKit **Still open** (EV-V2). Optionally `travelhub_v2.md` with the entity corrected (EV-V1).
- **Late-finding detection (FR-18)** isn't built; it's explained in the deck.

### 2.5 Register `/register` (FR-2, Karandeep only)
- **List:** filter by live / expired · client · region · type · verified/unverified.
- **Entry detail:** binds (incl. affiliates), scope, start/expiry, waivers, verbatim source clause, and **Verify / Edit / Reject**.
- **Impact:** open deals whose latest brief cites this entry. Editing or rejecting marks those deals **"re-check needed"** in the queue, and a rejected entry stops being used.
- Every finding's "view register entry" link lands here.
- Bumps the **register version** (Phase 4's seller banner listens to it).

### 2.6 Audit `/audit` and North Star `/metrics` (FR-15, PRD §12)
- **Audit:** an event table (time, user, deal, brief version, finding, action, reason, note, versions used) with Export JSON.
- **Metrics:** computed live from the audit log:
  - **Decide-from-brief rate** per brief version (decision recorded + "No" to dig + no blocker rejected as not real/wrong clause + nothing added as missed)
  - % of blockers agreed
  - "had to dig" reasons
  - average time on the brief

  This gives the demo and deck a working North Star.

---

## 3. Events to log (`lib/store.ts` → `logEvent`)

| Area | Events |
|---|---|
| Deals and documents | `upload`, `link_auto`, `link_asked`, `link_choice`, `link_moved` |
| Reviews | `review_run` (versions, timings, tokens), `brief_opened`, `brief_time` |
| Reactions | `reaction`, `missed_added`, `confirm_prompt` |
| Facts and register | `facts_edited`, `register_verify` / `edit` / `reject` |
| Decisions | `decision`, `followup_answer` |
| Alerts and sources | `alert_resolved`, `source_opened` (a passive "dig" signal) |

---

## 4. Exit check (on the Vercel preview URL, send me screenshots or a screen recording)

1. **Rheinwerk end to end:**
   - Open from the queue → brief v1: HOLD, PipeKit blocker with side-by-side clauses, Annex 3 missing with an upload slot, confirm "Pranav plans to reuse PipeKit".
   - Decide **Hold** → queue shows "waiting for input: Annex 3 (Bhavin)".
   - Upload the synthetic Annex 3 → v2: Resolved / New / Still open.
2. **Harrington:** compliance alert pinned → resolve off the record with a note → the verdict still isn't SIGN while contractual blockers remain.
3. **Gulf Crown LD clause:** similar past clauses show Acme (standard), Al Noor (one-off: not a precedent) and Brightwater (accident).
4. **Register:** reject an entry → affected deals show "re-check needed". Verify an entry → its label disappears from the brief.
5. **Linking:** upload the Ortiz NDA → asks once (two possible Harrington-related deals) or auto-links via cross-reference, matching EV-L.
6. **/metrics** shows a decide-from-brief rate after a few decisions.
7. **Reset demo** returns everything to the seed state.

---

## 5. Prompts for Claude Code (plan mode)

**3a**
> Read CLAUDE.md and docs/Phase3_Spec.md. Implement §0 (lib/store.ts on browser storage, Reset demo), §1 (design system: typography, severity chips, layout), and §2.1 Queue and §2.2 Deal page with upload and the three-tier deal linking. Write unit tests for the linking rules against EV-L1–L6.

**3b**
> Implement §2.3, the Brief page, exactly in the order listed, using the Phase 2 brief JSON. Include the compliance alert controls, side-by-side clauses, similar past clauses, confirm prompts, missing-item upload slots, the contract facts card (re-runs gate rules on edit), "+ missed", and the decision panel with the copy as written plus the follow-up question. Log every event in §3.

**3c**
> Implement §2.4 versions (grouping by Finding.key, carried-forward reactions, synthetic Rheinwerk Annex 3), §2.5 Register screen (verify/edit/reject, impact, re-check needed, register version) and §2.6 Audit and Metrics pages. Then walk through the exit check in §4 on the preview URL.

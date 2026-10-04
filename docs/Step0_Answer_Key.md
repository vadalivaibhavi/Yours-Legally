# Step 0 — Ground-Truth Answer Key (working draft)

"Today" = 28 Sep 2026. One entry per incoming contract. Severity: BLOCKER (can't sign as-is, not a redline fix) · HIGH (must redline) · MEDIUM (negotiate / judgment call) · OK (routine, don't flag).

---

## 1. Gulf Crown Hotels & Resorts — MSA (C-025) · $140k · Pvt Ltd · KSA · sign by 10 Oct

**Verdict: DO NOT SIGN until Al Noor gives a written waiver (or counsel advises otherwise).**

Files needed: Gulf Crown draft, Al Noor MSA (signed), Al Noor waiver letter, atliq_entities.md, negotiation_notes.md, tracker, 22 Sep + 25 Sep meeting notes.

| # | Severity | Finding | Source |
|---|---|---|---|
| 1 | BLOCKER | Al Noor non-compete: AtliQ **and its Affiliates** may not provide analytics / AI / revenue-management services to any Hospitality Business in the GCC. Gulf Crown = Saudi hotel group buying revenue management + guest analytics. Direct hit. | Al Noor MSA §12.1, §1.11, §1.9 |
| 2 | BLOCKER | Still live: Restricted Period = Term (to 14 Mar 2028) + 18 months, so it runs to ~Sep 2029. Bhavin's "I think that expired" is wrong. | Al Noor MSA §1.14, §6.1 |
| 3 | BLOCKER | No workarounds: "Affiliate" catches AtliQ Inc (100% owned), so switching entity doesn't help. "Irrespective of where the services are performed" means delivering from Pune doesn't help either. | Al Noor §1.2, §12.2, §12.3; entities sheet |
| 4 | BLOCKER | The Oman waiver doesn't help: it covers the Seaside SOW only and expressly excludes any other Hospitality Business. | Waiver letter ¶3 |
| 5 | BLOCKER | Signing would make AtliQ's own warranty false on day one ("not bound by any restriction that would prevent performing the Services"). | Gulf Crown §9.1(d) |
| 6 | HIGH | LDs of 1% of the full Contract Value per week, capped at 10%; "time is of the essence"; no exclusion for client-caused delay (force majeure only). This is the Brightwater pattern. Playbook: 0.5% of milestone/week, 5% milestone cap, client delays excluded. Al Noor's 10% was an explicit one-off exception. | GC §12; negotiation notes (Acme, Northwind, Trustline, Al Noor) |
| 7 | MEDIUM | Payment in 60 days vs playbook 30 (45 max). | GC §5.3; checklist |
| 8 | MEDIUM | Saudi law, Riyadh courts, Arabic text prevails. Playbook says Indian law for Pvt Ltd; precedent shows DIFC and English law were accepted before. Judgment call. | GC §14, §15.3 |
| 9 | MEDIUM | Liability capped at 1x, but **uncapped** for data-protection breach while handling guest PII. | GC §10.2 |
| 10 | MEDIUM | Delivery fit: guest data must stay in KSA, and subcontracting needs consent. Check how the Pune team works. | GC §13.2, §15.2 |
| 11 | MEDIUM | Termination for convenience pays only for "performed **and accepted**" work, so work in progress goes unpaid. | GC §6.3; checklist |
| — | OK | IP (client owns deliverables, AtliQ keeps background IP), mutual confidentiality, IP-only indemnity, 1x general cap. Don't flag these. | GC §7, §8, §10, §11 |

Data-quality notes (Gulf Crown): the tracker has `atliq_entity` and `restrictive_clauses` **blank** for Al Noor (C-007). The waiver (C-016) was "couldn't find where it's saved". Counsel's two open questions are answered by the documents (entity: Pvt Ltd; Affiliate: yes, catches Inc).

---

## 2. Lakeshore Grocers — MSA + SOW-1 + rate card (C-026) · $64k · Inc · USA · sign by 3 Oct

**Verdict: DO NOT SIGN at these rates until the Crestline most-favoured-pricing exposure is resolved. Every other clause is clean.**

Files needed: Lakeshore draft, Crestline MSA (signed), negotiation_notes.md (Crestline entry), tracker notes (C-026: "Jay gave sharper rate… Dhaval ok'd on a call").

| # | Severity | Finding | Source |
|---|---|---|---|
| 1 | BLOCKER | Crestline most-favoured-pricing clause: AtliQ Inc **or its Affiliates** warrant that no other customer gets lower rates "for substantially similar services" during the Term (to 31 Jul 2027). If they do, the lower rates apply to Crestline **retroactively from the date first offered**, AtliQ must notify Crestline and issue credits, and Crestline can audit. | Crestline §6.4, §6.5, §4.1 |
| 2 | BLOCKER | Lakeshore's rates are below Crestline's in every role: Sr DE $72 vs $85, DE $55 vs $62, BI $50 vs $58 (about 12–15% lower). The services are similar (US retail, data engineering + BI). Trigger is "offers", so Jay's quote may already count. | Lakeshore Exh. A; Crestline Exh. B |
| 3 | HIGH | Lakeshore's rates are locked for 24 months and apply to all future SOWs and change orders, so the gap is permanent for the whole Crestline term. | Lakeshore §4.2, Exh. A |
| 4 | MEDIUM | Whether "substantially similar" applies (Crestline is time-and-materials staffing; Lakeshore is fixed-fee with a rate card) is a legal judgment. Flag it for counsel; don't assert a breach. | — |
| 5 | MEDIUM | Illinois law (✓ US law for Inc), but disputes go to **SIAC arbitration in Singapore** (the parent's group standard). Foreign forum for a US entity. Precedent: SIAC was accepted for CloudSpan. | Lakeshore §13 |
| 6 | VERIFY | Requires $2M professional liability insurance. AtliQ's coverage is unknown (only "$1M cyber" is mentioned). | Lakeshore §14.4; Harrington huddle |
| 7 | LOW | Auto-renews yearly unless 60 days' notice is given; this needs a renewal reminder. | Lakeshore §5.1 |
| — | OK | LDs exactly match the playbook (0.5% of milestone per week, 5% cap, client delays excluded). Payment in 30 days, liability capped at 12 months' fees, IP split, mutual-style indemnity, paid for work done on termination, correct entity (Inc for a US client), offshore allowed via secure environment. **Don't flag any of these.** | Lakeshore §4.3, §7, §9, §10, §11 |

Root-cause trail: Dhaval accepted MFN in 2024 because "we never discount, so it's harmless". In 2026 Dhaval approved a discount on a call. Same person, the decision's premise changed, and nobody remembered the promise.

---

## 3. TravelHub — Software Development & Services Agreement (C-024) · $52k · names Inc · UAE · no date (Karandeep's own deal)

**Verdict: DO NOT SIGN as drafted. Fix the entity (it should be Pvt Ltd), and get counsel's view on a likely second Al Noor conflict.**

Files needed: TravelHub draft, atliq_entities.md, tracker note C-024 ("we put your US company since you're US-listed on LinkedIn"), Al Noor MSA §1.11 / §12.

| # | Severity | Finding | Source |
|---|---|---|---|
| 1 | HIGH | **Wrong entity.** A UAE client contracts with **AtliQ Inc**, but Inc serves US clients only. The counterparty's reason is "LinkedIn". This should be AtliQ Technologies Pvt Ltd. | TH §1.2, signature block; entities sheet |
| 2 | HIGH | **Internal mismatch.** The parties clause names Inc, but the invoicing clause names **Pvt Ltd (with its GSTIN)**. The contracting entity ≠ the invoicing entity, which is the exact pattern that caused two payment delays in 2025 (finance note). | TH §1.2 vs §7.1; entities sheet |
| 3 | HIGH (counsel) | **Possible Al Noor conflict, missed by everyone.** Al Noor's "Hospitality Business" includes anyone who "provides **distribution** … services to" hotels. TravelHub (Dubai) lists and books Partner Hotels on commission, and AtliQ would build an AI **hotel ranking module for UAE + KSA hotels** plus a partner performance dashboard. That arguably means AI / analytics services to a GCC Hospitality Business. Switching to Inc doesn't escape it (Affiliate clause). More arguable than Gulf Crown, so it's a counsel question, not a verdict. | TH §3.1, §4.1(b)–(c), §4.2; Al Noor §1.11, §12.1–12.3 |
| 4 | MEDIUM | Dubai law, **onshore Dubai courts**. Playbook says Indian law for Pvt Ltd. Precedent: DIFC law/courts were accepted for Al Noor. Judgment call. | TH §15 |
| — | OK | No LDs, timeline "commercially reasonable efforts", 30-day payment, 20% paid on signing, deemed acceptance after 10 days, liability capped at 12 months' fees, IP split OK, mutual-style indemnity, paid for work done on termination. **Don't flag any of these.** | TH §5–8, §10–13 |

Build note: findings 1, 2 and 4 are **rules** (client country → entity → expected law; parties entity = invoicing entity). An LLM extracts the fields; deterministic code decides. Finding 3 needs LLM reasoning over definitions plus the obligations register.

---

## 4. FinServe Capital — "Mutual" NDA (C-036) · Pvt Ltd · India · needed before 1 Oct walkthrough · K: "will sign tonight"

**Verdict: DO NOT SIGN. It is titled mutual but is one-way, and it carries a non-compete that would block AtliQ's existing BFSI clients and pipeline.**

Files needed: FinServe draft, Karandeep's checklist ("NDAs → just sign if mutual"), negotiation notes (GlobalMart precedent), tracker (C-005 PayTrack, C-021 Trustline, C-022 FinEdge).

| # | Severity | Finding | Source |
|---|---|---|---|
| 1 | HIGH | **Not mutual.** "Confidential Information" is defined only as information disclosed *by the Company to the Recipient*, and AtliQ is named "the Recipient". AtliQ's architecture and methods get **no protection**, even though the recitals say "mutual exchange". | FS §1.2, parties, Recital B |
| 2 | HIGH | **Residuals clause runs one way:** FinServe (and its Affiliates) may freely use anything its people remember, "for any purpose", including building or buying competing products. | FS §1.4, §4.1 |
| 3 | BLOCKER | **Hidden non-compete in an NDA.** AtliQ may not provide similar services (data analytics/reporting for lending and wealth) to any Indian bank, NBFC, wealth manager, broker or fintech during the term **plus 12 months**. The term is indefinite (until terminated). This collides with live/pipeline clients: **Trustline NBFC** (signed Aug 2026), **PayTrack** (fintech), **FinEdge Bank** (MSA awaiting client). | FS §1.5, §8.1, §7.1; tracker |
| 4 | HIGH | One-way, **uncapped indemnity** incl. legal fees; injunction "without proof of actual damage". | FS §10 |
| 5 | MEDIUM | One-way obligations in perpetuity; 24-month non-solicit incl. consultants; **6-hour** breach notice; security "as notified from time to time"; regulator access to records; secrecy of discussions binds AtliQ only. | FS §2.1(c), §2.2, §6, §7.2, §8.2 |
| — | OK | Indian law, Mumbai courts, correct entity. | FS §11.4 |

Precedent: GlobalMart (Mar 2026) sent a one-way NDA; K said "We only sign mutual — we'll be sharing our architecture too" and they agreed. Ask for: truly mutual definitions, delete residuals (or make it mutual), delete §8.1, cap or mutualise the indemnity, fixed term (2–3 yrs).

## 5. LoopMart — Mutual NDA (C-038) · Pvt Ltd · India · no deadline

**Verdict: SAFE TO SIGN. This is the clean one. Genuinely mutual, nothing to flag.**

| Check | Result | Source |
|---|---|---|
| Mutuality | ✓ Disclosing/Receiving Party roles apply to both sides; both sides' info (incl. "solution designs, source code, methodologies") is protected | LM §1.1, §2.1, §3 |
| Exclusions | ✓ Standard four incl. independent development | LM §4 |
| Duration | ✓ 2-year term + 3 years' survival (not perpetual) | LM §7 |
| Non-compete | ✓ None. §8.2 expressly keeps both free to work with third parties | LM §8.2 |
| Remedies | ✓ Mutual, "may seek" injunction; no one-way indemnity | LM §9 |
| Law / entity | ✓ Indian law (Bengaluru courts), Pvt Ltd for an Indian client | LM §10.3 |

Eval value: same title as FinServe, opposite substance. The system must say "clean — sign" here without inventing concerns (false-positive test).

---

## 6. Kriti Data Labs — Subcontractor Agreement (C-037) · ₹8.4L (~$10.1k) · AtliQ's own paper · Pvt Ltd · Kriti wants to start 5 Oct

**Verdict: DO NOT SEND as drafted. It is unfair to a 12-person agency by AtliQ's own standards, AND it fails to protect AtliQ's promises to Rheinwerk (IP, GDPR, subcontracting consent).**

Files needed: Kriti draft, Rheinwerk draft (§6.5, §13, §15.3), Karandeep's checklist + Sept note, negotiation notes (PixelCraft, PayTrack, Rohan Iyer), tracker C-037/C-028.

**A. Unfair: fails AtliQ's own playbook (the "mirror test": would AtliQ sign this as a supplier?)**

| # | Severity | Finding | AtliQ's own position | Source |
|---|---|---|---|---|
| 1 | HIGH | LDs of **2% of Total Fees per calendar day, uncapped**, plus actual damages; time of the essence; no exclusion for AtliQ/client delay. 50 days late = 100% of fees. | "LDs → cap it. never open ended". PixelCraft's 1%/day penalty was deleted ("I don't want our paper to be the thing I hate receiving"). | Kriti §11; checklist; PixelCraft note |
| 2 | HIGH | **Pay-when-paid**, up to **120 days**. Kriti is already pushing back ("we're 12 people"). | "payment → 30 days, 45 max". PixelCraft got 30 days. | Kriti §4.3; tracker C-037 |
| 3 | HIGH | Vendor indemnifies AtliQ **even for AtliQ's own negligence**. | Rejected exactly this from PayTrack: "we can't insure against PayTrack's own negligence". | Kriti §9.1; PayTrack note |
| 4 | HIGH | **Unlimited vendor liability**, while AtliQ's is capped at fees paid. | "liability → 1x fees. NOT unlimited". PixelCraft: capped at fees for both sides. | Kriti §10 |
| 5 | MEDIUM | 7-day termination for convenience, paying for **accepted** deliverables only; full refund on rejection; acceptance never deemed; "highest standards" with guidelines changeable at will. | "termination → they pay for work done". | Kriti §2.2, §3, §5.3 |

**B. Doesn't protect AtliQ: the back-to-back gap with Rheinwerk**

| # | Severity | Finding | Source |
|---|---|---|---|
| 6 | BLOCKER | **IP runs the wrong way.** Kriti *keeps* the annotation outputs; AtliQ gets only a non-exclusive, **non-transferable** licence. Rheinwerk requires **exclusive, transferable, unrestricted** rights in all Work Results. AtliQ can't give Rheinwerk what it doesn't own. Same pattern as Rohan Iyer → Acme. | Kriti §7.2–7.3 vs Rheinwerk §6.5 |
| 7 | BLOCKER | **No data protection clause at all**, yet Kriti will process technician names and free-text logs from a German client, partly on **Kriti's own labelling platform**. Rheinwerk requires a GDPR Art. 28 DPA + SCCs; Kriti would be a sub-processor needing flowed-down terms. | Kriti Engagement Schedule; Rheinwerk §13 |
| 8 | HIGH | Rheinwerk allows subcontracting **only with its prior written consent**. None sought. | Rheinwerk §15.3 |
| 9 | HIGH | **Sequencing:** Kriti starts 5 Oct; the Rheinwerk contract it serves isn't signed (target 15 Oct). Data could reach a subcontractor before the client contract, DPA and consent exist. | Tracker C-037, C-028 |

Template drift: PixelCraft's fixes (Oct 2025) were "made in PixelCraft's copy only — not sure the template file was ever updated". The Rev 09/2026 template still carries every clause K removed. (The tracker says Jay built it from the Harrington draft; the file header says Pranav from the vendor template. The provenance itself is unclear.)

## 7. Marcus Reed — Independent Contractor Agreement (C-040) · AtliQ's own paper · US freelancer · Jay wants to send by 1 Oct

**Verdict: DO NOT SEND. Wrong template and wrong entity for a US-based person; unfair restrictive terms; and it staffs a deal (Lakeshore) that is itself blocked.**

| # | Severity | Finding | Source |
|---|---|---|---|
| 1 | HIGH | **Wrong template / entity / law.** A Chicago resident working on a US client (Lakeshore, contracted by **AtliQ Inc**) is put on the **India** freelancer template with **AtliQ Pvt Ltd**: Indian law, Pune courts, PAN, TDS u/s 194J, GST, payment in INR to an Indian bank account, Maharashtra stamp duty. Should be AtliQ Inc on the US contractor template (as used for Daniel Ortiz). Tracker: "only name and rate changed". | Marcus parties, §4.4–4.6, §11, §12.5; tracker C-040, C-047 |
| 2 | HIGH | **Worldwide 12-month non-compete** on "any software or data services", plus a ban on accepting work from clients he served. Unfair, and likely unenforceable for a US freelancer (counsel). | §8 |
| 3 | HIGH | **Exclusivity**: full-time, no other clients, 40 hrs/week, timesheets approved "at his discretion", 6 months. Looks like employment rather than contracting, so a **misclassification risk** in the US (counsel). | §3, §4.2, Schedule |
| 4 | MEDIUM | One-sided: AtliQ can end it on **24 hours'** notice, Marcus needs **60 days**; 60-day payment; FX rate "at the Company's discretion"; bank charges and stamp duty on him; AtliQ's liability capped at 3 months, his indemnity uncapped. | §4.3–4.4, §9, §10 |
| 5 | HIGH | **Dependency:** Marcus is for Lakeshore, which is blocked by the Crestline MFN (entry #2). Sending this by 1 Oct commits AtliQ before the client deal is resolved. | Schedule; entry #2 |
| — | OK | IP assignment to AtliQ is correct and complete (good flow-down for Lakeshore §7.1). Confidentiality is fine. | §6, §7 |

---

## 8. Harrington Health — the healthcare bundle (C-023 MSA, C-046 BAA, C-045 NDA, C-047/C-048 Daniel Ortiz) · $210k · Inc · USA · Rebecca wants MSA + BAA by 1 Oct

**Verdict: DO NOT SIGN by 1 Oct. First, escalate a live PHI exposure to US counsel (Calloway Stern) today. The bundle is incomplete, AtliQ cannot meet the insurance or offshore terms on day one, and the MSA carries the worst commercial terms in the dataset.**

Files needed: Harrington MSA, BAA, signed NDA, Daniel Ortiz contractor agreement + NDA drafts, intercompany subcontractor BAA (CareBridge), CareBridge BAA, 27 Sep huddle notes, negotiation notes (CareBridge, PayTrack, Brightwater), tracker, entities sheet.

**A. Already happened: a live incident, not a contract clause**

| # | Severity | Finding | Source |
|---|---|---|---|
| 1 | CRITICAL | Harrington's Kevin Brooks emailed a "sample extract" on 12 Sep. Pranav: "real data I think — names, DOBs, some diagnosis codes" = **PHI**. Pranav forwarded it to **Sneha and Vikram in Pune**, where it still sits (as of 28 Sep). Only the NDA is signed, and it **excludes PHI**: "disclosed only after execution of a BAA… AtliQ shall not request". No BAA exists. The intercompany BAA does not cover Harrington and permits de-identified data only. Its own rule for PHI found by mistake: "immediately cease access and notify". | Huddle 27 Sep; NDA §2.3; IC-BAA §3.1, §3.4, Sch. 1 |
| 2 | CRITICAL | Signing the BAA as drafted would make this AtliQ's problem on day one. A Privacy Event is "deemed discovered" when known to any employee, and notice is due within 24 h. Liability for Privacy Events is **uncapped**. | BAA §1.6, §5.1, §8.1–8.2 |
| → | ACTION | Human decision with counsel, not the system: stop access, secure/delete per counsel, document the chain, and get advice on notifying Harrington **before** signing anything. | — |

**B. The bundle is incomplete or inconsistent ("which documents does this deal need?")**

| Required document | Status | Problem | Source |
|---|---|---|---|
| NDA (AtliQ Inc ↔ Harrington) | ✓ Signed 20 Aug | Fine, but it excludes PHI | NDA |
| MSA | In review | See C | MSA |
| BAA (Exhibit D) | In review | Must be signed concurrently with the MSA | BAA §12.10 |
| **Subcontractor BAA: AtliQ Inc ↔ Daniel Ortiz** | **MISSING** | Ortiz is an independent contractor (not workforce), so he is a "Subcontractor". He needs a written flow-down BAA **before** any PHI access, plus Harrington's **prior written approval**. His contractor agreement has no HIPAA terms; his NDA is not a BAA. Dhaval: "US-based, so the offshore thing is solved", which only solves one of three requirements. | BAA §1.5, §4.2, §4.3; MSA §2.5; Ortiz drafts |
| **Subcontractor BAA: AtliQ Inc ↔ Pvt Ltd (Pune) for Harrington** | **MISSING** | The existing intercompany BAA is scoped to CareBridge only ("Per engagement, keep it simple"). K: "should do, same kind of work". Nobody checked. Worse, Harrington's BAA bars **any** Subcontractor (incl. Affiliates) from touching PHI outside the US and requires subcontractors to be US-organised. MSA §12.4 lets offshore staff see **de-identified** data in Client-controlled environments, but BAA §2.4 forbids AtliQ de-identifying PHI without approval. The delivery model (Pune builds) needs an explicit Harrington-approved de-identification route. | IC-BAA Sch. 1; BAA §1.5, §2.4, §4.1–4.2; MSA §12.4 |
| Harrington consent to subcontract (Ortiz; Pvt Ltd) | MISSING | Prior written consent required | MSA §2.5; BAA §4.2 |
| Insurance certificates | **Can't comply** | MSA: E&O $5M, cyber $5M, umbrella $5M, CGL $2M; BAA: cyber $5M for term + 3 yrs, Harrington as additional insured. AtliQ has **$1M cyber**. Certificates are due **before** services start. Not yet raised with Harrington. | MSA §13; BAA §8.3; huddle |
| Personnel prerequisites | Not flowed down | Background checks, drug screening, HIPAA training before access | MSA §2.4; BAA §3.3 |

**C. MSA commercial terms (client paper, "template non-negotiable")**

| # | Severity | Finding | AtliQ position / precedent | Source |
|---|---|---|---|---|
| 1 | HIGH | LDs of **2% of Total Contract Value per calendar day** (= $4,200/day), **uncapped**, cumulative with actual damages, time of the essence, **no client-delay exclusion**. | Never deliberately accepted uncapped LDs. Brightwater (uncapped, no client-delay exclusion) cost $9k + $14.2k fees. | MSA §11 |
| 2 | HIGH | **Unlimited** contractor liability, explicitly incl. data incidents; client capped at fees paid; consequential-damages exclusion protects client only. | "1x fees. NOT unlimited". Walked away from Kessler over this. | MSA §10 |
| 3 | HIGH | Indemnity for losses "regardless of whether caused… by the negligence of any Client Indemnitee". | Rejected from PayTrack. | MSA §9.1 |
| 4 | HIGH | **Background IP lost:** Pre-Existing Materials "incorporated into or necessary for the use of" Deliverables are **assigned** to Harrington. | "we keep our own stuff". | MSA §7.2 |
| 5 | MEDIUM | 90-day payment; invoices waived after 90 days; set-off across **any** agreement; 7-day termination for convenience paying accepted deliverables only; full refund on rejection; acceptance never deemed; 12-month warranty; "highest standards". | 30/45 days; pay for work done. | MSA §3, §4, §5.3, §8.2 |
| — | OK | Correct entity (Inc), US law (Texas), BAA restrictions on AI training (§10.3) are reasonable. | | MSA §14; BAA §10.3 |

**D. AtliQ's paper for Daniel Ortiz**

| # | Severity | Finding | Source |
|---|---|---|---|
| 1 | OK (fair) | Contractor agreement is **balanced**: 30-day pay in USD, mutual 14-day termination, mutual liability cap, free to take other clients, no post-term non-compete, Texas law for a Texas resident. Good contrast to Marcus Reed / Kriti. NDA is genuinely mutual. | Ortiz ICA §2–4, §8–10; Ortiz NDA |
| 2 | HIGH | **Flow-down gaps:** no BAA/HIPAA terms; IP assigned only "upon payment" and Contractor Tools only licensed (Harrington wants work-for-hire from creation **and** pre-existing materials assigned); no background check / training prerequisites. | Ortiz ICA §6; MSA §7, §2.4 |
| 3 | NOTE | AtliQ's exposure is unlimited upstream but capped downstream (Ortiz at 12 months' fees). That is fair to Ortiz; AtliQ should hold that gap knowingly. | Ortiz §9.2 vs MSA §10.3 |

Counsel: the 22 Sep question "should we send Harrington to counsel?" was never decided. Precedent: CareBridge BAA reviewed by Calloway Stern for $3,800 on a $76k deal. This one is $210k with a live PHI issue.

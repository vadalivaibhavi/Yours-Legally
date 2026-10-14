# SYN Dataset Extension — README and Answer Key

**Everything with the `SYN_` / `SYN-` prefix is synthetic data added on top of the original capstone dataset.** It follows the original's conventions: the same AtliQ people and entities, the same file-header style, "today" = **2026-09-28**, and the same mix of client paper and AtliQ's own templates. All companies, people and clauses in it are fictional teaching material. Nothing here is legal advice.

> ⚠️ **This file is the answer key.** Keep it out of the analyzer's input corpus (exclude `SYN_README*` when indexing), or the evaluation leaks.

## What was added

| Folder | Files | IDs |
|---|---|---|
| `signed_contracts/` | 10 executed documents, each creating a standing obligation | SYN-S01 … S10 |
| `incoming/` | 10 drafts awaiting review; 9 have a real conflict and 1 only looks risky | SYN-I01 … I10 |
| `meeting_notes/` | 6 notes. Their italic editorial lines are ground truth, as in the original set | SYN-N01 … N06 |
| root | `SYN_contract_tracker_additions.csv`: 21 tracker rows in the original's column layout | SYN-101 … SYN-121 |

The tracker is realistic but imperfect, like the original: `restrictive_clauses` is blank or wrong, statuses are missing, and the Ashwood Services Agreement (SYN-105) is logged but its file isn't in the set.

## Obligation register (what the signed contracts commit AtliQ to)

| ID | Contract | Entity | Obligation type | Clause | Binds | Live until |
|---|---|---|---|---|---|---|
| S01 | Kestrel Pharma Distribution MSA | Pvt Ltd | **Non-compete**: no demand forecasting / sales analytics for any Indian pharma distributor or C&F / 3PL | §12 | Pvt Ltd **+ Affiliates (incl. Inc)** | **2028-11-03** (term + 12 mo). LD = all fees paid |
| S02 | Meridale Retail Brands MSA | Inc | **MFN pricing**, worldwide, incl. Affiliates; retroactive refund; annual audit | §6.3–6.6 | Inc + Pvt Ltd | 2028-02-02. Sr DE benchmark **$80/hr** |
| S03 | Novaterra Energy MSA + SOW-1 | Pvt Ltd | **IP assignment of pre-existing tool** (IngestIQ v1.4) + no use for third parties; unlimited liability | §6, §10.2, Sch 3 | Pvt Ltd + Affiliates + subcontractors | Perpetual |
| S04 | Zephyr Cloud Data Partnership | Pvt Ltd | **Exclusivity** vs Competing Platforms (incl. Quanta Lake) in India + SEA; **ROFR** on India BFSI deals > $50k | §7, §8, Sch 1 | Pvt Ltd + Affiliates | 2028-06-29 (+6 mo for §7); 120-day non-renewal notice |
| S05 | Ashwood Senior Living BAA | Inc | **No offshore access to PHI, including Limited Data Sets**; affiliates count as subcontractors; $3M cyber insurance | §4.2–4.4, §8 | Inc + Affiliates | 2027-08-24+ |
| S06 | Falconridge Logistics MSA | Pvt Ltd | **Customer non-solicit**: no logistics analytics to 5 named Protected Customers anywhere in the GCC | §14, Sch 4 | Pvt Ltd + Affiliates | **2029-09-14** (term + 24 mo). LD = 50% of $112k per breach |
| S07 | Tessellate Analytics Vendor Agreement | Pvt Ltd (buyer) | **Take-or-pay minimum** of 1,500 h/yr; 60% shortfall fee; hours sent to other vendors don't count; 30% placement fee | §4, §10 | Pvt Ltd | Year 1 ends **2026-11-09**; year-2 renegotiation window **2026-09-30** |
| S08 | Lumen Small Finance Bank MSA | Pvt Ltd | **Cooling-off**: no credit EWS / delinquency model for any RBI-regulated lender; data localisation | §10.2, §6 | Pvt Ltd + Affiliates | **2028-08-12** (24 mo from Final Acceptance) |
| S09 | Corvina Foods MSA + DPA | Pvt Ltd | **Rate freeze** for initial term; **30-day sub-processor notice**; EEA-only hosting; 36 h breach notice | §3.2, Annex 1, A2.3–A2.6 | Pvt Ltd | 2029-03-22; 90-day non-renewal notice |
| S10 | Halvorsen Mutual NDA | Inc | **One-sided standstill hidden in a "mutual" NDA**: no claims-triage/fraud analytics for US P&C insurers | §8 | Inc only | **Expired 2026-08-10** (confidentiality survives) |

## Incoming drafts: expected findings

| ID | Draft | Deadline | Expected verdict | Key conflict(s) | Evidence trail |
|---|---|---|---|---|---|
| I01 | Pillarstone Pharma Logistics MSA | 9 Oct | 🔴 **Do not sign** without Kestrel consent | Pillarstone is a pharma C&F agent / super-stockist, which is a Competing Business under **S01 §12** (live to 2028-11-03). Consent is at Kestrel's "sole discretion" and the LD is all fees paid ($62k). The draft is also one-sided: LD 1%/wk of total fees up to 15%, 60-day payment, uncapped vendor liability with the client capped, 15-day termination paying for accepted milestones only | S01, N06, tracker SYN-112 |
| I02 | Cobalt Outfitters MSA + rate card | 2 Oct | 🔴 **Pricing conflict** | $68 Sr DE is below **Meridale's $80 MFN (S02 §6.3)**, which is worldwide and covers affiliates, so it triggers a retroactive refund to Meridale. It is also below the Crestline MFN ($85, original C-002). Cobalt adds its own MFN, which locks in a third constraint. *Bonus:* the original set's Lakeshore rate ($72, C-026) and Meridale's own $80 already breach the Crestline MFN | S02, original negotiation_notes (Crestline), N06 |
| I03 | Aldergrove Water MSA + SOW-1 | 14 Oct | 🔴 **IP AtliQ no longer owns** | The SOW deploys **IngestIQ**, which was assigned to Novaterra (**S03 §6.1–6.2**). §4.3 of the draft warrants AtliQ owns it, and that liability is uncapped. Both the Novaterra breach and the Aldergrove warranty breach carry unlimited liability. The "30% cheaper" pricing depends on the reuse | S03, N01, N06 |
| I04 | Quanta Lake Partner Agreement | 12 Oct | 🔴 **Exclusivity breach** | Quanta Lake is named in **Zephyr Sch 1**. Zephyr §7 binds Affiliates, so having AtliQ **Inc** sign doesn't help. India + Singapore overlap the Zephyr Territory. Quanta's §3.3 also bars working with Zephyr, a mutually incompatible pair. There is an entity question too (Inc for an India/ME territory) | S04, N02, N06 |
| I05 | Ashwood SOW-3 | 30 Sep | 🔴 **HIPAA / BAA breach** | §6 puts a **Limited Data Set** in front of the Pune team. **BAA §4.3 expressly includes LDS** in the offshore ban, and §4.2 treats affiliates as subcontractors that need approval plus their own BAA. The VP of Ops can't approve it: §10.3 requires the Privacy Officer. CareBridge's intercompany BAA (C-044) was per-engagement, so it doesn't cover Ashwood. Insurance requires $3M, while AtliQ holds $1M (original Harrington huddle) | S05, N04, original C-044 / Harrington huddle |
| I06 | Cargoline Shipping MSA | ASAP | 🔴 **Protected Customer** | Cargoline is **#1 on Falconridge Sch 4**. The restriction covers the whole GCC, not just Qatar, and runs to 2029-09-14. The LD is 50% of $112k = **$56k**, and the draft's §8.1 rep would be false on signing. **Entity mismatch:** AtliQ Inc for a Bahrain client is wrong per `atliq_entities.md`, and payment to a US account adds to it. Changing the entity wouldn't cure the conflict anyway, since affiliates are bound | S06, N06, atliq_entities |
| I07 | Monsoon Data Studio Vendor Agreement (AtliQ paper) | 5 Oct | 🟠 **Our own paper is unfair + hidden cost** | The template still has the clauses removed for PixelCraft: 1%/**day** penalty with no cap, 60-day / pay-when-paid terms, uncapped vendor liability against AtliQ's 1-month cap, a 24-month non-compete on a 6-person firm, and a one-way 7-day termination. This contradicts Karandeep's stated values. Separately, the **Tessellate minimum (S07)** sits at about 640 of 1,500 h, a shortfall of roughly **₹12.4 lakh (~$15k)** due Nov 2026. §4.3 means hours sent to Monsoon don't reduce it, and the 30 Sep renegotiation window is about to lapse | S07, N05, original PixelCraft note |
| I08 | Indus Valley Co-op Bank Services Agreement | 6 Oct | 🔴 **Double conflict** | (1) The **Lumen cooling-off (S08 §10.2)** bars any EWS for an RBI-regulated lender until 2028-08-12, whether derived or not. A waiver had to be requested 30 days *before* the proposal, and the RFP went in on 16 Sep, so that window is already blown. (2) The **Zephyr ROFR (S04 §8)** applies to an India BFSI deal over $50k, and Zephyr wasn't notified before the proposal. A repeat of the Lumen miss flagged in N02. The §9.1 rep would also be false | S08, S04, N02, N03, N06 |
| I09 | Corvina SOW-2 + sub-processor notice (AtliQ paper) | start 12 Oct | 🔴 **DPA + pricing breaches** | The notice gives under 30 days before 12 Oct (DPA A2.4). **SyncRiver** moves data to the US, which A2.3 forbids without consent. **Kriti Data Labs** isn't even under contract yet (original C-037 is still a draft). Rates are +8% against a **rate freeze for the initial term** (MSA §3.2). §6.1 "SOW prevails" tries to override the MSA, and AtliQ is the one drafting it | S09, N06, original C-037 |
| I10 | Greystone Claims Solutions MSA | none | 🟢 **Clean. A false-positive test** | It looks like a Halvorsen conflict but isn't: the **§8 standstill expired 2026-08-10**, and Greystone is a TPA, not a P&C insurer. Terms are balanced (1x cap, mutual indemnity, capped LD, client delays excluded, 30-day payment, correct entity). Residual note: Halvorsen's confidential info (survives 3 yrs) must not be reused, and it's worth checking whether Halvorsen is one of Greystone's 11 insurers | S10, N06 |

## Cross-cutting patterns the analyzer should surface
1. **Affiliate clauses** in S01, S02, S04, S05, S06 and S08 bind *both* AtliQ entities, so switching the signing entity never cures a conflict.
2. **Obligations live in old contracts, not the draft.** 9 of 10 incoming risks can't be seen from the draft alone.
3. **Dates matter.** S10 has expired, S07 has a window closing 30 Sep, the S08 waiver had to be requested before the proposal, and S09 needs 30 days' notice.
4. **The buyer side counts too.** I07 and I09 are AtliQ's own paper and break AtliQ's own commitments.
5. **Links to the original dataset:** Crestline MFN (C-002), Lakeshore rate (C-026), CareBridge intercompany BAA (C-044), Kriti draft (C-037), the $1M cyber policy (Harrington huddle) and the PixelCraft template fix.

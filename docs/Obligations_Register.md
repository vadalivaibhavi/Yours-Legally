# AtliQ Obligations Register (built from all 17 signed documents)

"Today" = 28 Sep 2026. This is the register the README says doesn't exist. It is the core data the prototype will check every incoming contract against.

Legend: **LIVE** = binding today · **EXPIRED** = keep for history, never flag · **ACTION** = a date or step coming up

---

## A. Restrictions on what AtliQ can do (non-competes, exclusivity, pricing promises)

| ID | Obligation | Binds | Scope | Until | Exceptions | Source | Status | Incoming deals it hits |
|---|---|---|---|---|---|---|---|---|
| R1 | **GCC hospitality non-compete**: no data analytics, AI or revenue-management services to any "Hospitality Business" (hotels, resorts, serviced apartments **or anyone providing distribution / revenue-mgmt / guest-analytics services to them**) "in the GCC" = HQ'd in, **or services relate to properties located in**, any GCC state, irrespective of where the work is performed | Pvt Ltd **+ all Affiliates (incl. AtliQ Inc)** | 6 GCC states | Term ends 14 Mar 2028 **+ 18 months ≈ 14 Sep 2029** | Waiver only by Al Noor, in writing, sole discretion (§12.4). **One waiver granted:** Seaside Hotels SOW (Oman) only; excludes follow-ons, other hospitality businesses and Affiliates | Al Noor MSA §1.2, §1.9, §1.11, §1.14, §12; Waiver 10 Feb 2026 | LIVE | **Gulf Crown** (direct), **BlueOrchid** (Dubai ×2, Muscat), **TravelHub** (arguable: distribution platform) |
| R2 | **Most-favoured pricing**: rates and commercial terms to Crestline must be no less favourable than those offered by Supplier **or its Affiliates** to any other customer for substantially similar services. Lower rates apply retroactively from the date first *offered*; AtliQ must notify; credit within 30 days; annual audit right | AtliQ Inc **+ Affiliates (incl. Pvt Ltd)** | Any customer, any geography | 31 Jul 2027 | None | Crestline §6.4–6.5, Exh. B (Sr DE $85 / DE $62 / BI $58) | LIVE | **Lakeshore** ($72/$55/$50). Portfolio question: does it reach Pvt Ltd's Indian pricing? (one-time counsel question) |
| R3 | **Platform exclusivity**: AtliQ and Affiliates may not act as implementation / reseller / referral partner for any Competing Platform (cloud data-warehouse, lakehouse or unified analytics platform as a service) | Pvt Ltd **+ Affiliates** | India + GCC only (outside is free; serving customers who independently chose a platform is free if AtliQ holds no partner appointment) | 31 Aug 2028, or 90 days after either side gives notice (clause then ceases) | §7.3 carve-outs | CloudSpan §7, §14.2, §14.4(b) | LIVE | **Datavane** (India + GCC territory) |
| R4 | **No-hire / no-solicit (Meridian)**: AtliQ may not solicit, **employ or engage** any Meridian employee **or consultant** it had contact with | Pvt Ltd | Contacts from the July walkthrough | Term 3 yrs (Jul 2029) + 24 months ≈ **Jul 2031** | Meridian's written consent | Meridian NDA §7.3 | LIVE | — (HR/recruiting check) |
| R5 | Non-solicit of employees (routine, mutual, 6–12 months) | Various | Staff involved in services | Term + 6–12 months | General ads OK | Al Noor §12.5, Crestline §15, PayTrack §13, Acme §14, Northwind §8.2, Sunrise §15, CloudSpan §16.2, Ortiz | LIVE | Routine, don't flag |
| R6 | **OTA non-compete (Orbit)**: no travel-booking software for any online travel agency in India | Pvt Ltd | India OTAs | Term to 30 Jun 2024 + 12 months = **30 Jun 2025** | Hotels/airlines/non-OTA excluded | Orbit MSA §6 (scanned, OCR) | **EXPIRED**: never flag | (TravelHub is UAE and expired anyway: a good false-positive test) |

## B. IP AtliQ has given away, or never received

| ID | Obligation | Source | Status | Impact |
|---|---|---|---|---|
| I1 | **Northwind owns IP in all Deliverables, "including any software, tools, frameworks, libraries and pre-existing materials incorporated"** (present assignment on payment). SOW-1 states **PipeKit** was incorporated as the ingestion/orchestration layer. K: "I skimmed the IP" | Northwind §9.2, Sch. 1 S1.2 | LIVE (assignment is permanent) | **Rheinwerk** asks AtliQ to warrant sole ownership of PipeKit. Every future PipeKit deal is affected. Counsel (English law). |
| I2 | **Rohan Iyer kept ownership of all Work Product** (Acme dashboards, DAX, visual templates); AtliQ has only a non-exclusive licence. But Acme's MSA says IP in Deliverables **vests in Acme** on payment. AtliQ promised Acme title it never had | Rohan ICA §5.2–5.3; Acme MSA §9.1 | LIVE gap (Acme MSA to Mar 2027; Rohan §5 survives) | Fix: get a written assignment from Rohan. Cheap, no counsel. Same pattern now in **Kriti** and **Daniel Ortiz** drafts. |
| I3 | Brightwater: IP in Deliverables vests on **creation**; AtliQ's pre-existing materials licensed perpetually to the whole Brightwater Group | Brightwater §11 | LIVE | Background-IP licence (not assignment): OK |
| I4 | Standard client-owns-deliverables / AtliQ-keeps-background-IP (licence only) | Al Noor §9, Crestline §8, PayTrack §8, Acme §9, Sunrise §10, Trustline §9, CloudSpan §8.2 | LIVE | The norm. Don't flag. |

## C. Signed terms that deviate from AtliQ's playbook (exposure already on the books)

| ID | Contract | Deviation | Deliberate? | Status |
|---|---|---|---|---|
| D1 | **Brightwater** (AtliQ Inc, $92k) | LDs **1% of Contract Value per day**, uncapped (carved out of the 150% liability cap), on top of other remedies; time of the essence; **no client-delay exclusion**; group-wide set-off; **English law, London courts** for a US entity. E-signature certificate: **signed from a mobile device after viewing for 4 min 12 sec** | **No.** "I signed it at the airport… I didn't even see it." Cost: $9k settlement + $14.2k legal + ~2 weeks senior time | LIVE until **27 May 2027**. Any further work/change order carries the same terms. **No review of other contracts was done after the post-mortem** (this register is that review). |
| D2 | **Al Noor** | LD cap 10% of total fees (vs 5% of milestone); DIFC law | **Yes, explicit one-off**: "strategic exception for Al Noor only — not our new standard" | LIVE. **Must never be cited as precedent.** |
| D3 | **Northwind** | English law + LCIA London | **Yes, conceded**: "not worth losing the deal over" | LIVE to Jun 2028 |
| D4 | **CloudSpan** | Singapore law + SIAC | Yes ("ok") | LIVE to Aug 2028 |
| D5 | **Meridian NDA** | **One-way** (only AtliQ bound), uncapped one-way indemnity, 24-h breach notice, 24-month no-hire incl. consultants | **No.** Signed "within the hour", "it's standard", no changes. Contradicts "we only sign mutual" | LIVE to Jul 2029 (+3 yrs survival) |
| D6 | **Crestline MFN** | See R2 | Accepted on a false premise ("we never discount, so it's harmless") | LIVE |

## D. Compliance & data obligations AtliQ must keep performing

| ID | Obligation | Source | Until |
|---|---|---|---|
| C1 | **CareBridge BAA**: PHI only in CareBridge's US environment, by named US personnel; offshore = de-identified only; breach report ≤5 business days; liability for BAA breaches capped at 2× trailing-12-month fees | CareBridge BAA §3, §5, §9 | Ends with MSA. **MSA expiry 5 Oct 2026 (tracker C-042) → ACTION: return/destroy all PHI within 30 days and certify; intercompany BAA ends too.** Renewal not discussed anywhere. |
| C2 | **Intercompany BAA (Inc ↔ Pvt Ltd)**: scoped to the **CareBridge engagement only**; de-identified data only; Pune must stop and report within 1 business day if it ever sees PHI | IC-BAA §1.2, §3, Sch. 1 | Ends with CareBridge. **Does NOT cover Harrington.** |
| C3 | Harrington NDA: **PHI excluded; to be shared only after a BAA** | Harrington NDA §2.3 | Disclosures to Aug 2028. **Breached in fact: PHI extract with Pune engineers since 12 Sep** |
| C4 | PayTrack: payment-system data stored **only in India** (RBI localisation); 24-h breach notice; RBI/client audit | PayTrack §7.2, §12 | MSA to 21 Jan 2027 |
| C5 | Trustline: data **only in India**; **6-hour** incident report; RBI inspection rights | Trustline §13 | To 14 Aug 2027 |
| C6 | Brightwater: no data outside the US without consent; 24-h incident notice; PI insurance ≥$2M, cyber ≥$1M | Brightwater §13, §17 | To May 2027. **ACTION: confirm AtliQ actually holds $2M PI** (only "$1M cyber" is known) |
| C7 | Al Noor: Guest Data stays in UAE (remote access from India only); 48-h breach notice; PI insurance ≥$500k; **Al Noor's confidential info (rate strategies, forecasts) can't be used for others**. Relevant even if a Gulf Crown waiver is obtained | Al Noor §8, §16, §17; NDA | To 2028 (+5 yrs confidentiality) |

## E. Clean signed contracts (benchmarks of "good", don't flag)

| Contract | Why it's the benchmark |
|---|---|
| Acme MSA (Mar 2025) | **Origin of the LD playbook**: 0.5% of milestone/week, 5% cap, client delays excluded, sole remedy. 30 days. Mutual indemnity. |
| PayTrack MSA (Jan 2025) | **Origin of the mutual-indemnity position**, incl. "no indemnity for the indemnified party's own negligence" (§10.2) |
| Trustline MSA (Aug 2026) | Playbook LDs, 45-day payment (the negotiated maximum) |
| Sunrise MSA (Apr 2025) | AtliQ-friendly master: capped liability, service credits capped at 5% |
| Al Noor NDA, Harrington NDA | **Genuinely mutual** NDAs: the template for "what mutual looks like" |
| CareBridge BAA (counsel-reviewed, $3.8k) | **What a negotiated BAA looks like**: capped liability, 5-day reporting, de-identified offshore route. The precedent for Harrington |
| Rohan Iyer ICA (except IP) | Fair freelancer terms: 30-day pay, mutual 15-day exit, mutual cap |

---

## F. Data-quality findings (why the tracker can't be the source of truth)

- **Tracker blanks / errors:** Al Noor MSA (C-007) entity blank and `restrictive_clauses` blank, though it holds the most consequential restriction AtliQ has. Northwind, PayTrack, Acme, GlobalMart marked "none"; Northwind's IP assignment isn't captured. Duplicate Northwind SOW-1 (C-010/C-011). ShopSwift country "USA?", entity blank. Status blank for Sunrise SOW-2 and LoopMart.
- **Scattered storage:** contracts live in 8+ places (K's email, Dhaval's laptop "Downloads > old_scans", Pranav's Google Drive, shared drives, Bhavin's email).
- **Scanned / OCR:** Orbit has OCR errors ("0RBIT", "l2") and an **illegible indemnity clause (§9.1)**. The system must say "illegible, check original", never guess.
- **Documents referenced but not in the dataset (unknown coverage):** ShopSwift SOW, DataNest staff-aug, Seaside SOW, Crestline SOW-1/SOW-2, NovaPharma DPA, PixelCraft vendor agreement, GlobalMart NDA, CareBridge MSA & NDA, Brightwater settlement letter, the AtliQ intercompany services agreement. **The register is only as complete as the documents collected.** The system should state what it has *not* seen.

---

## G. Negotiation Playbook: AtliQ's positions, derived from history

**How a position becomes standard (agreed rule):**
1. **Fairness gate first.** The playbook is symmetric: a position must pass the *mirror test* ("would AtliQ accept this if a client sent it?") whichever side AtliQ is on.
2. **Precedent filter second.** Only **deliberate, general** decisions become the default. Deliberate exceptions and concessions are context. Accidents are lessons, never precedent.
3. **Karandeep approves.** The system proposes positions from history; Karandeep approves them into a versioned playbook. The system never promotes history to policy on its own.

| Topic | Standard position (default) | Evidence (deliberate, general) | Exceptions / concessions (context only) | Accidents (lessons, never precedent) | In 2024 checklist? |
|---|---|---|---|---|---|
| Delay penalties / LDs | 0.5% of **affected milestone** per week, cap 5% of that milestone, **client-caused delay excluded**, sole remedy | Acme (Mar 25), Northwind (Jun 25), Trustline (Aug 26) | Al Noor: 1% of milestone/wk, cap 10% of total (explicit one-off) | Brightwater: 1% of contract value **per day**, uncapped, no client-delay exclusion | Partly ("cap it") |
| Liability cap | 1x fees, mutual; carve-outs for fraud/wilful misconduct/confidentiality only | Checklist; PayTrack; Kessler (walked away from unlimited, €120k) | — | Brightwater (LDs outside cap) | Yes |
| Indemnity | Mutual; each covers its own breach/negligence; **never the other side's negligence** | PayTrack (Jan 25) | — | — | Yes |
| Payment | 30 days, 45 max | Checklist; Trustline (90→45) | — | — | Yes |
| Governing law | Indian law for Pvt Ltd; US law for Inc | Checklist; entities sheet | DIFC (Al Noor), English (Northwind), Singapore (CloudSpan): accepted to win the deal | Brightwater: **English law on a US entity**, unnoticed | Yes |
| Entity | Inc = US clients only; Pvt Ltd = everyone else; contracting entity = invoicing entity | Entities sheet (finance) | — | TravelHub draft (LinkedIn); Marcus Reed draft | **No** |
| IP | Client owns what's built for it; AtliQ keeps background IP (licence only) | Checklist; Acme, PayTrack, Sunrise, Trustline | — | Northwind: pre-existing tools (PipeKit) assigned, "skimmed" | Yes (but not enforced) |
| IP flow-down (AtliQ as buyer) | Every freelancer/vendor **assigns** work product to AtliQ, so AtliQ can give clients what it promises | Daniel Ortiz template (US) | — | Rohan Iyer kept IP ("ok" from phone) → Acme title gap | **No** |
| NDAs | **Mutual in substance**, not just in title; fixed term; no non-competes inside NDAs | GlobalMart (Mar 26): "We only sign mutual" | — | Meridian (one-way, signed in an hour) | Weak ("just sign if mutual") |
| Restrictive covenants AtliQ gives | Narrow geography + short duration; always check against the register; mutual exit where possible | Al Noor (worldwide 3 yrs → GCC, term + 18 mo); CloudSpan (Europe removed; mutual 90-day exit) | Al Noor accepted as strategic | Crestline MFN accepted on a false premise | **No** |
| Termination | Paid for work done (incl. WIP) | Checklist | — | — | Yes |
| AtliQ's own paper (vendors/freelancers) | Same standard as above, applied symmetrically: capped penalties or none, 30-day pay, mutual caps, no pay-when-paid | PixelCraft (Oct 25): "I don't want our paper to be the thing I hate receiving" | — | Template never updated after PixelCraft; Kriti and Marcus drafts | **No** |
| Healthcare / personal data bundles | NDA + BAA + MSA (US); DPA + SCCs (EU); a sub-BAA/sub-DPA for **every** party touching the data, **before** data moves; engagement-specific scope | CareBridge (counsel-reviewed, $3.8k) | — | Harrington: PHI in Pune before any BAA | **No** |
| Insurance | Check required limits against actual coverage before signing | — | — | Harrington ($5M asked vs $1M held) | **No** |
| SOW vs proposal | Scope, milestones, rates match the proposal | Checklist | — | — | Yes |

**Open item for the MVP:** Jay's notes are unreviewed and "a lot of the 'why' is only in K's head". Karandeep should tag each past decision as standard / exception / concession / accident (~30 minutes, one time) before the playbook is used.

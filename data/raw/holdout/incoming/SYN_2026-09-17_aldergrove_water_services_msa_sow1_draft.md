*(SYNTHETIC DATA — SYN-I03 · Dataset extension, not part of the original capstone set. Client draft received 2026-09-17 via Bhavin's email. Client's paper. SOW-1 technical approach section was written by Pranav and inserted by the client from AtliQ's proposal.)*

# SERVICES AGREEMENT

**Dated:** ______________ 2026

## PARTIES

(1) **ALDERGROVE WATER SERVICES PLC**, a company incorporated in England and Wales (company number 02233891) whose registered office is at Aldergrove House, 12 Temple Row, Birmingham B2 5HG ("**Aldergrove**"); and

(2) **ATLIQ TECHNOLOGIES PRIVATE LIMITED**, a company incorporated in India (CIN U72900MH2019PTC321456) whose registered office is at 4th Floor, Baner Business Bay, Pune 411045, India (the "**Supplier**").

## 1. SERVICES

1.1 The Supplier shall perform the services in Schedule 1 (SOW-1) in accordance with Good Industry Practice and Aldergrove's policies.

## 2. CHARGES

2.1 The Charges for SOW-1 are **GBP 82,000** (approx. **USD 104,000**), payable by milestone.

2.2 Aldergrove shall pay valid invoices within thirty (30) days.

## 3. TERM

3.1 This Agreement continues until completion of SOW-1 and any further SOWs, unless terminated earlier.

## 4. INTELLECTUAL PROPERTY

4.1 All Intellectual Property Rights in the Deliverables vest in Aldergrove on creation.

4.2 "**Supplier Materials**" means materials owned by the Supplier before the date of this Agreement or developed independently of it. The Supplier retains ownership of Supplier Materials and grants Aldergrove a perpetual, irrevocable, royalty-free, non-exclusive licence to use, modify and maintain any Supplier Materials incorporated in the Deliverables.

4.3 The Supplier warrants that it owns, or has all rights necessary to license, all Supplier Materials, and that their use by Aldergrove will not infringe any third party's rights.

## 5. INDEMNITY

5.1 The Supplier shall indemnify Aldergrove against all losses arising from any claim that the Deliverables or the Supplier Materials infringe the Intellectual Property Rights of a third party.

## 6. LIABILITY

6.1 Each party's total liability shall not exceed 150% of the Charges, save that the Supplier's liability under Clauses 4.3 and 5 shall be **unlimited**.

## 7. DATA PROTECTION

7.1 The Supplier acts as processor under the UK GDPR; Aldergrove's standard processor terms apply. Customer data must remain in Aldergrove's UK Azure tenant.

## 8. SERVICE CREDITS

8.1 Service credits of 0.5% of the milestone charge per week of Supplier-caused delay, capped at 5% of that milestone charge.

## 9. TERMINATION

9.1 Aldergrove may terminate for convenience on thirty (30) days' notice, paying for work done.

## 10. GOVERNING LAW

10.1 The law of England and Wales. The courts of England and Wales have exclusive jurisdiction.

## SCHEDULE 1 — SOW-1: METER & NETWORK TELEMETRY DATA PLATFORM

**1. Objective.** Consolidate smart water-meter reads (1.1 million meters), network pressure and flow telemetry, and billing data into a governed lakehouse with automated data-quality monitoring.

**2. Technical approach (from Supplier proposal).**
"To accelerate delivery, the Supplier will deploy its proven **IngestIQ** ingestion and data-quality framework (a pre-existing Supplier Material), already used in production for a UK energy retailer's half-hourly smart-meter data. IngestIQ's SQL Server, SFTP and Kafka connectors, its 140-rule data-quality engine and Azure Data Factory orchestration templates will be configured for Aldergrove's sources. This reduces build effort by approximately 30% compared with a bespoke build and is reflected in the Charges."

**3. Milestones**

| Milestone | Deliverable | Charge (GBP) | Target |
|---|---|---|---|
| M1 | Architecture; IngestIQ configuration | 12,300 | Start + 3 weeks |
| M2 | Meter-read and telemetry ingestion | 32,800 | Start + 10 weeks |
| M3 | Billing integration; DQ monitoring | 24,600 | Start + 15 weeks |
| M4 | Handover and knowledge transfer | 12,300 | Start + 18 weeks |
| | **Total** | **82,000** | |

## SIGNATURES

Signed for **ALDERGROVE WATER SERVICES PLC**: ______________ (Helen Ashcroft, Director of Digital & Data)

Signed for **ATLIQ TECHNOLOGIES PRIVATE LIMITED**: ______________

*(SYNTHETIC DATA — SYN-S03 · Dataset extension, not part of the original capstone set. Text extracted from executed PDF. Stored: Shared Drive > Clients > Novaterra > Signed)*

# MASTER SERVICES AGREEMENT (incorporating Statement of Work No. 1)

**Dated:** 19 May 2025

## PARTIES

(1) **NOVATERRA ENERGY LIMITED**, a company incorporated in England and Wales (company number 09876512) whose registered office is at 3 Wellington Place, Leeds LS1 4AP, United Kingdom (the "**Customer**"); and

(2) **ATLIQ TECHNOLOGIES PRIVATE LIMITED**, a company incorporated in India (CIN U72900MH2019PTC321456) whose registered office is at 4th Floor, Baner Business Bay, Pune 411045, Maharashtra, India (the "**Supplier**").

## BACKGROUND

(A) The Customer is a retail energy supplier serving approximately 410,000 households in the United Kingdom.

(B) The Customer requires the Supplier to design and build data ingestion and data-quality pipelines for half-hourly smart-meter readings, billing and customer-service data.

## 1. DEFINITIONS

1.1 In this Agreement:

"**Assigned Materials**" means the Deliverables and the Supplier Framework, together with all modifications, enhancements and derivative works of them made in the course of the Services.

"**Deliverables**" means all documents, code, pipelines, configurations, data models and other materials produced by or on behalf of the Supplier for the Customer under this Agreement.

"**Intellectual Property Rights**" means patents, copyright, database rights, rights in software and know-how, and all similar rights anywhere in the world.

"**Supplier Framework**" means the Supplier's pre-existing data ingestion and data-quality framework known as **IngestIQ**, as described in Schedule 3, in the version incorporated into the Deliverables.

## 2. SERVICES

2.1 The Supplier shall perform the services set out in Schedule 1 (SOW-1) ("**Services**") in accordance with Good Industry Practice.

2.2 The Supplier shall deliver the Services from India. Customer personal data shall be accessed only through the Customer's Azure UK South environment, and shall not be copied outside it.

## 3. CHARGES AND PAYMENT

3.1 The Charges are **GBP 69,500** (approx. USD 88,000), payable by milestone as set out in Schedule 1.

3.2 The Customer shall pay valid invoices within thirty (30) days of receipt.

3.3 In consideration of the assignment in Clause 6, the Charges include a one-off "Framework Transfer Fee" of GBP 12,000.

## 4. TERM

4.1 This Agreement commences on the date above and continues until completion of SOW-1, and thereafter for any further SOWs agreed, unless terminated earlier in accordance with Clause 12.

## 5. CUSTOMER RESPONSIBILITIES

5.1 The Customer shall provide access to its Azure tenant, source systems and subject-matter experts within ten (10) Business Days of the start date.

## 6. INTELLECTUAL PROPERTY

6.1 The Supplier hereby assigns to the Customer, with full title guarantee and by way of present assignment of future rights, all Intellectual Property Rights in the Assigned Materials, with effect from the date of their creation or (for the Supplier Framework) from the date of payment of the Framework Transfer Fee.

6.2 The Supplier shall not, and shall procure that its Affiliates and subcontractors shall not, use, copy, license, sell or create derivative works of the Assigned Materials for any third party, or provide any third party with services that make use of the Assigned Materials.

6.3 The Supplier waives (and shall procure the waiver of) all moral rights in the Assigned Materials.

6.4 The Supplier shall retain only its general know-how, skills and experience, provided that this shall not permit re-creation of the Supplier Framework or any substantial part of it.

6.5 The Supplier shall deliver to the Customer the complete source code, documentation and version history of the Supplier Framework and shall not retain any copy, save one archival copy for the purpose of performing and supporting the Services under this Agreement.

## 7. WARRANTIES

7.1 The Supplier warrants that it is the sole owner of the Supplier Framework and has full right to assign it.

7.2 Deliverables shall materially conform to SOW-1 for ninety (90) days after acceptance.

## 8. DATA PROTECTION

8.1 The Supplier shall act as processor of Customer personal data in accordance with the UK GDPR and the Data Protection Act 2018 and the data processing terms in Schedule 2, including the International Data Transfer Addendum.

## 9. CONFIDENTIALITY

9.1 Each party shall keep the other's confidential information confidential for the term and five (5) years thereafter.

## 10. LIABILITY

10.1 Neither party excludes liability for death or personal injury caused by negligence, or fraud.

10.2 Subject to Clause 10.1, each party's total liability shall not exceed 125% of the Charges, save that the Supplier's liability under Clauses 6 and 7.1 shall be unlimited.

10.3 Neither party is liable for indirect or consequential loss or loss of profit.

## 11. DELAY

11.1 If a milestone is missed for reasons attributable to the Supplier, the Customer may claim service credits of 0.5% of the relevant milestone charge per week, up to 5% of that milestone charge. No credits apply to Customer-caused delay.

## 12. TERMINATION

12.1 Either party may terminate for material breach not remedied within thirty (30) days. The Customer may terminate for convenience on thirty (30) days' notice, paying for work done. Clause 6 survives termination.

## 13. GOVERNING LAW AND DISPUTES

13.1 This Agreement is governed by the law of England and Wales.

13.2 Disputes shall be finally resolved by arbitration under the LCIA Rules, seated in London, before a sole arbitrator, in English.

## SCHEDULE 1 — SOW-1: SMART-METER DATA PLATFORM

| Milestone | Deliverable | Charge (GBP) | Target |
|---|---|---|---|
| M1 | Architecture and IngestIQ configuration | 13,900 | 20 Jun 2025 |
| M2 | Smart-meter ingestion + DQ rules | 27,800 | 15 Aug 2025 |
| M3 | Billing and CRM pipelines | 20,850 | 26 Sep 2025 |
| M4 | Handover incl. Framework Transfer | 6,950 | 17 Oct 2025 |
| | **Total** (incl. Framework Transfer Fee of £12,000 spread across milestones) | **69,500** | |

## SCHEDULE 2 — DATA PROCESSING TERMS

(Standard Customer processor terms v4 — attached separately.)

## SCHEDULE 3 — SUPPLIER FRAMEWORK

**IngestIQ v1.4** — Python-based ingestion and data-quality framework comprising: (a) 23 source connectors (SQL Server, Oracle, SAP, SFTP, REST, Kafka); (b) a declarative data-quality rule engine with 140 pre-built rules; (c) orchestration templates for Azure Data Factory and Airflow; (d) monitoring and alerting modules; and (e) associated documentation and test suites.

## SIGNATURES

Signed for and on behalf of **NOVATERRA ENERGY LIMITED**
*[signed]* — Gareth Holloway, Chief Data Officer — 19 May 2025

Signed for and on behalf of **ATLIQ TECHNOLOGIES PRIVATE LIMITED**
*[signed]* — Karandeep, Chief Executive Officer and Director — 19 May 2025

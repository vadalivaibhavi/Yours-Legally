# Held-out evaluation

The dataset's SYN_ extension: 10 incoming drafts (read from Word / PDF / scanned files), 10 signed contracts added to the register, 6 notes without narrator lines. Never used to build, prompt or tune anything; cases written from the answer key before the first run (`eval/holdout_cases.json`, unchanged since). Model: gemini. Run 2026-10-14 02:16 UTC.

Every finding graded (`eval/holdout_finding_labels.json`): 50 findings · **74% correct** (+4% partly) · noise 16% · wrong 3 · severity off 9

**Verdicts 9/10 = 90% · conflicts found (the right signed contract cited at blocker/high) 7/11 = 64% · playbook / entity points 10/13 = 77% · false alarms on the clean draft: 0 · register key 8/10 = 80%** (10/10 deals reviewed)

Missed conflicts that the brief's "check by hand" list points to (commitment kinds the conflict check doesn't compare): 4/4 = 100% (ashwood → syn-ashwood-baa; monsoon → syn-tessellate-vsa; indus → syn-zephyr-spa; corvina → syn-corvina-msa)

| Case | Deal | Expected | Verdict | Conflict must cite | Must find | False alarms | Result |
|---|---|---|---|---|---|---|---|
| HO-01 | pillarstone | HOLD | ✓ HOLD | ✓ syn-kestrel-msa | ✓ playbook:ld, ✓ playbook:payment, ✓ playbook:liability, ✓ playbook:termination | none | **pass** |
| HO-02 | cobalt | HOLD | ✓ HOLD | ✓ syn-meridale-msa, ✓ crestline-msa | ✗ covenant:mfn_pricing | none | fail |
| HO-03 | aldergrove | HOLD | ✓ HOLD | ✓ syn-novaterra-msa | – | none | **pass** |
| HO-04 | quanta | HOLD | ✗ SIGN AFTER CHANGES | ✓ syn-zephyr-spa | ✗ gate:entity | none | fail |
| HO-05 | ashwood | HOLD | ✓ HOLD | ✗ syn-ashwood-baa | ✗ gate:insurance|playbook:insurance | none | fail |
| HO-06 | cargoline | HOLD | ✓ HOLD | ✓ syn-falconridge-msa | ✓ gate:entity|gate:invoicing_entity | none | **pass** |
| HO-07 | monsoon | SIGN AFTER CHANGES | ✓ SIGN AFTER CHANGES | ✗ syn-tessellate-vsa | ✓ playbook:ld, ✓ playbook:payment, ✓ playbook:liability, ✓ playbook:restrictive, ✓ playbook:termination | none | fail |
| HO-08 | indus | HOLD | ✓ HOLD | ✓ syn-lumen-msa, ✗ syn-zephyr-spa | – | none | fail |
| HO-09 | corvina | HOLD | ✓ HOLD | ✗ syn-corvina-msa | – | none | fail |
| HO-10 | greystone | SIGN | ✓ SIGN | – | – | none | **pass** |

## Register key (signed SYN contracts)

| Key | Document | Expected type | Extracted | Checks |
|---|---|---|---|---|
| S01 | syn-kestrel-msa | non_compete | non_compete → 2028-11-03, non_solicit → 2028-05-03, compliance → 2027-11-03 | ✓ found, ✓ end 2028-11-03, ✓ binds both entities |
| S02 | syn-meridale-msa | mfn_pricing | data_location → 2028-02-02, mfn_pricing → 2028-02-02, compliance → 2028-02-02, insurance → 2028-02-02 | ✓ found, ✓ end 2028-02-02, ✓ binds both entities |
| S03 | syn-novaterra-msa | ip_transfer | data_location → 2025-10-17, ip_transfer (perpetual) | ✓ found, ✓ perpetual, ✓ binds both entities |
| S04 | syn-zephyr-spa | exclusivity | exclusivity → 2028-12-29, other → 2028-06-29, compliance → 2028-06-29 | ✓ found, ✓ binds both entities |
| S05 | syn-ashwood-baa | data_location / compliance | data_location → 2027-08-24, compliance → 2027-08-24, insurance → 2027-08-24, compliance → 2027-08-24, compliance → 2027-08-24 | ✓ found, ✓ binds both entities |
| S06 | syn-falconridge-msa | non_solicit / non_compete | non_compete → 2029-09-14 | ✓ found, ✓ end 2029-09-14, ✓ binds both entities |
| S07 | syn-tessellate-vsa | other | non_solicit → 2028-11-09 | ✗ found |
| S08 | syn-lumen-msa | non_compete | non_compete → 2028-07-31, other (perpetual) | ✓ found, ✗ end 2028-08-12, ✓ binds both entities |
| S09 | syn-corvina-msa | mfn_pricing / other / data_location | data_location → 2029-03-22, compliance → 2029-03-22, compliance → 2029-03-22, compliance → 2029-03-22, compliance → 2029-03-22 | ✓ found |
| S10 | syn-halvorsen-nda | non_compete | non_compete → 2026-08-10, non_solicit → 2026-02-10 | ✓ found, ✓ end 2026-08-10, ✓ expired |

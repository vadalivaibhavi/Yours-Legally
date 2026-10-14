# Consistency (gemini)

Same deals, fresh model answers each run (`npm run consistency`). Written 2026-10-14 01:48 UTC.

**Verdict agreement: 12/12 complete runs give their deal's most common verdict.** Counted findings = blocker and high (what moves the verdict); overlap = average Jaccard between runs.

**Reliability:** 4 of 16 runs had a step fail (the provider's overload / timeouts); 4 of those came out HOLD, i.e. never a clean verdict on a partial review. They are left out of the agreement numbers.

| Deal | Case | Runs | Verdicts | Agreement | Counted-findings overlap | Found only in some runs | Case passes |
|---|---|---|---|---|---|---|---|
| travelhub | EV-03 | 3 | SEND BACK · SEND BACK · SEND BACK | 3/3 SEND BACK | 83% | playbook:termination | 3/3 |
| datavane | EV-05 | 3 (+1 with a failed step) | SIGN AFTER CHANGES · SIGN AFTER CHANGES · SIGN AFTER CHANGES | 3/3 SIGN AFTER CHANGES | 78% | playbook:liability, playbook:termination | 0/3 |
| kriti | EV-10 | 3 (+3 with a failed step) | SIGN AFTER CHANGES · SIGN AFTER CHANGES · SIGN AFTER CHANGES | 3/3 SIGN AFTER CHANGES | 64% | flowdown:consent, flowdown:ip | 2/3 |
| loopmart | EV-08 | 3 | SIGN · SIGN · SIGN | 3/3 SIGN | 100% | none | 3/3 |

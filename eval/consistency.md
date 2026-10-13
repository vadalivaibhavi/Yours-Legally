# Consistency (gemini)

Same deals, fresh model answers each run (`npm run consistency`). Written 2026-10-13 17:41 UTC.

**Verdict agreement: 8/9 runs give their deal's most common verdict.** Counted findings = blocker and high (what moves the verdict); overlap = average Jaccard between runs.

| Deal | Case | Runs | Verdicts | Agreement | Counted-findings overlap | Found only in some runs | Case passes |
|---|---|---|---|---|---|---|---|
| travelhub | EV-03 | 3 | SEND BACK · SEND BACK · SEND BACK | 3/3 SEND BACK | 83% | playbook:termination | 3/3 |
| datavane | EV-05 | 3 (1 with step errors) | SIGN AFTER CHANGES · HOLD · SIGN AFTER CHANGES | 2/3 SIGN AFTER CHANGES | 78% | conflict:cloudspan-spa:exclusivity, playbook:termination | 0/3 |
| kriti | EV-10 | 3 (3 with step errors) | HOLD · HOLD · HOLD | 3/3 HOLD | 67% | flowdown:ip | 0/3 |

# Consistency (gemini)

Same deals, fresh model answers each run (`npm run consistency`). Written 2026-10-12 10:54 UTC.

**Verdict agreement: 3/3 runs give their deal's most common verdict.** Counted findings = blocker and high (what moves the verdict); overlap = average Jaccard between runs.

| Deal | Case | Runs | Verdicts | Agreement | Counted-findings overlap | Found only in some runs | Case passes |
|---|---|---|---|---|---|---|---|
| travelhub | EV-03 | 3 | SEND BACK · SEND BACK · SEND BACK | 3/3 SEND BACK | 83% | playbook:termination | 3/3 |

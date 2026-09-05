---
'nexus-agents': minor
---

Benchmarks no longer render absence as a pass: the token benchmark reports `searchesFailed` and 0% savings when no search succeeded; `toSuiteResult` computes `passed` from the recorded adapter failures (and reports an empty run as unmeasured); search-quality metrics score a failed query as zero and expose `failedQueries` (#5689).

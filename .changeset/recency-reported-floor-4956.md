---
'nexus-agents': patch
---

Research scoring: the `recency` field of a `QualityScore` is documented as what it is. The 8.x changeset for the exponential decay said the value "approaches zero without reaching it"; the curve does, but the reported value is rounded to 2dp and is exactly 0 for anything published more than ~7.7 years ago. No scoring change — `composite` is also 2dp with recency weighted 0.2, so an 8-year-old and a 20-year-old source already rank identically at any precision `recency` alone could be reported at. The docstrings on `scoreRecency` and `QualityScore.recency` now state the ~7.7-year limit, and tests pin the reported floor (0 at 10 years, 0.01 at 7) so a precision change has to be deliberate. Refs #4956.

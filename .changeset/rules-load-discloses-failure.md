---
'nexus-agents': patch
---

`loadPersistedRules` now warns when the distilled-rules snapshot exists but
cannot be read — a parse failure, or a schema mismatch such as a file written by
a build with a newer `version`. It returned a bare `[]` for that case, identical
to "no rules were ever learned", and `ContextRetriever` then assembled a prompt
asserting that nothing is known to fail. The verdict is unchanged (it still never
throws, and an absent file is still silent); the failure is now visible.

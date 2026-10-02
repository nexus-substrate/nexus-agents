---
'nexus-agents': patch
---

Voters whose JSON answer sat in a fenced block no longer lose their vote when the reasoning quotes a triple-backtick fence. The extractor ended the fenced block at the first triple backtick, even one inside a JSON string, so the vote was cut off before `confidence`. On `pr_review` this rejected every Claude seat reviewing a diff that contained such fences. The extractor now reads the object from the fence opener with the string-aware scanner.

A vote that fails to parse now logs the first 2000 characters of the raw answer, secret-redacted, on the `Vote attempt failed` warning.

The PR-review prompt now shows complete JSON vote examples that include `confidence`. If fewer than a majority of the requested panel seats respond, the review abstains instead of approving and records the quorum shortfall in the response and the audit record. An empty panel no longer reports a verified review.

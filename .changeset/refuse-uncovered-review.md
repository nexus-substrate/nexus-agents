---
'nexus-agents': patch
---

Refuse to post GitHub PR reviews when no files were reviewed by a successful expert, including when every expert errored. These reviews now return a skipped post outcome with the distinct `NO_REVIEW_COVERAGE` reason; all-errored panels still produce a `comment` review decision. Partial and full coverage remain eligible for posting subject to the existing gates. Clarify that PR-derived file citations record provenance rather than prove review coverage.

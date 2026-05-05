---
'nexus-agents': patch
---

Tier D1 of epic #2385 — cross-pollinate addyosmani/agent-skills patterns into 2 existing skills:

**`reviewing-code`** (was 104 → now 137 lines):

- Five-axis review framework (Correctness / Readability / Architecture / Security / Performance)
- Anti-rationalization table (6 rows: small-change excuse, tests-pass-so-correct, trust-the-author, CI-catches-everything, refactor-differently, author-decides)
- Output categorization (Critical / Important / Suggestion) with discipline note ("if everything is Critical, nothing is")
- References cross-link to security-checklist and testing-patterns
- Cross-link to .claude/agents/code-reviewer.md persona

**`documentation-management`** (was 305 → now 380 lines):

- New ADR section: when to write, full template, lifecycle (PROPOSED → ACCEPTED → SUPERSEDED/DEPRECATED), when NOT to ADR
- Anti-rationalization table for documentation (6 rows: code-self-documenting, document-later, next-release, comments-lie, nobody-reads, internal-API-doesn't-need)
- New verification checklist for doc changes
- Cross-link to docs/adr/ tree

Both skills retain their existing content unchanged — purely additive cross-pollination. Pure-patch release.

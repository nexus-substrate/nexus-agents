---
'nexus-agents': patch
---

Add an explicit reuse-first ladder to the scope_steward voter (#4007, ponytail-inspired)

The `scope_steward` voter now gates the _implementation altitude_ of a justified build with an ordered ladder — YAGNI → stdlib → native/substrate primitive → installed dependency → one line → minimum that works — and flags reaching for a higher rung when an earlier one holds as `OVER_ENGINEERING`. The ladder hard-fences the safety concerns that are never cut (trust-boundary validation, error handling, security, accessibility). Mirrored as an author pre-write self-check in `.rules/development-disciplines.md`. Prompt-only change; no new tool/command surface.

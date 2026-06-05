---
'nexus-agents': patch
---

fix(context): collapse + cap summary fields to block prompt-line injection (#3471)

`summarizeContextForPrompt` renders backend strings (belief subject/predicate/
object, memory descriptions, experience taskType, research name/topic) into an
LLM system-prompt prefix. A value containing a newline could inject extra
un-prefixed lines that escape the `- ` data-framing. A shared `oneLine()` helper
now collapses whitespace and caps each interpolated field at 200 chars across
every section — making the data-framing a local guarantee. Behavior-preserving
for the current T1 repo/internal sources; defense-in-depth follow-up to #3148.

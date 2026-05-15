---
'nexus-agents': patch
---

`delegate_to_model` reasoning text now states when the preferred CLI didn't win ([#2722](https://github.com/williamzujkowski/nexus-agents/issues/2722) final sub-bug).

Pre-fix the reasoning line read `architecture task (prefer gemini)` unconditionally, even when gemini got filtered out (by `needsMcp`, score loss, etc.) and an opencode/claude/codex model was actually selected. So an LLM caller reading the response saw text contradicting the recommendation.

`buildReasons` now takes the chosen CLI; if `specialization.primaryCli !== chosenCli` the reasoning says `architecture task (preferred gemini, selected opencode after filtering)`. Same when the preference matches, just without the "selected after filtering" tail.

This closes the third and final #2722 sub-bug. The first two (MCP_KEYWORDS narrowed in #2737, adapter availability via #2735) were resolved earlier.

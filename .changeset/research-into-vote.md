---
'nexus-agents': patch
---

The dev-pipeline research stage no longer dead-ends: its output is now surfaced to the consensus `vote()` stage, which previously received no research context at all (#3258). Research is appended to the vote proposal as a clearly-delimited, size-capped, informational block — explicitly marked as not-instructions so untrusted research text can't steer the vote — and the proposal stays hard-capped at the 4000-char limit with the plan taking priority. Voters can now weigh plans against what research found. (Option A / thin slice; the structured-`ResearchContext` follow-up is tracked in #3372.)

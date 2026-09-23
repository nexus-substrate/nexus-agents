---
'nexus-agents': patch
---

`nexus-agents vote --record <issue> --option …` now renders the `Options:` block in the recorded GitHub issue comment. The comment previously omitted the declared-option tally added in #6585, so the durable comment could not show which option won or the breakdown across declared options.

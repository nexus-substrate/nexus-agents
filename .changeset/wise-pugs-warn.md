---
'nexus-agents': patch
---

Warn callers that a `consensus_vote` tally cannot express a multi-option split (#4452, mitigation).

The tally records approve/reject/abstain only. When a proposal asks voters to choose among named options (A/B/C), every voter who engages constructively returns `approve` — so the result records as **unanimous, 100%** even when the panel disagreed about _which option_. A live 6–1 split was persisted as `{"decision":"approved","approvalPercentage":100,"voteCounts":{"approve":7,"reject":0}}`, with the real distribution recoverable only by reading seven free-text `reasoning` fields.

Threshold semantics invert the same way: `unanimous` is meant to be the strictest bar, but on a multi-option proposal it clears trivially, because everyone approves while choosing different things. A 4/3 split across two options would also record as 100%.

This is documentation only — the `proposal` and `strategy` field descriptions and the advertised tool description now state the limitation, so a caller is warned before relying on the number rather than after. The structural fix (a declared `options` input, a per-voter `selectedOption`, thresholds evaluated over the option tally, and explicit dissent in the record) remains tracked on #4452.

Matters because vote records feed the authority-ladder ratification path and the #3849 audit→enforce evidence base: a record asserting unanimity where a 6–1 split occurred is misleading in the direction of overconfidence.

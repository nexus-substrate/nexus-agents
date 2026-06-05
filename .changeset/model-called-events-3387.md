---
'nexus-agents': minor
---

feat(observability): emit `model.called` events with real model/token attribution (#3387)

`ModelCalledEvent` was part of the V2 event vocabulary with consumers in
`trace-writer` and `query_trace`, but no code ever emitted it — so the advertised
`query_trace` `model.called` filter was permanently empty. The expert pipeline now
emits a meaningful `model.called` event at the model-invocation boundary
(`runExpert`/`executeExpert`) carrying the real `cli`, `model`, `tokensIn`,
`tokensOut`, and `durationMs`.

The expert-bridge surfaces the concrete `model` and a `tokensIn`/`tokensOut` split
(new `tokenSplitFromUsage`, reconciling with the existing `tokensUsed` total) from
`CliResponse`. Events are emitted only after a successful call with a known
cli/model and real token usage — absent usage skips emission rather than recording
zeros ("skip, don't lie"). Purely additive: `OutcomeStore` remains the single
outcome authority, so there is no double-counting. Approved 2-0 by consensus
(architect + security).

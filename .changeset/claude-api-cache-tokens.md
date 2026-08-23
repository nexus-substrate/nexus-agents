---
'nexus-agents': patch
---

fix(adapters): the direct-API Claude path was dropping cache token figures

`parsers/claude-parser.ts` has extracted `cache_read_input_tokens` and `cache_creation_input_tokens` since #4435, with a comment recording why: a panel's **first** call is the one that writes the cache, so dropping the figures loses its largest input measurement entirely. `adapters/claude-adapter.ts` — the direct-API path — never read them, building `TokenUsage` from `input_tokens` and `output_tokens` alone.

The same one-arm-fixed shape as #4602, where the CLI arms reported a quota signal and the API arms could not. Here `observability/cache-token-threading.test.ts` already asserts these fields reach the decision-cost rollup, so the API path was silently supplying less than the rollup was written to consume.

Both fields are declared `number | null` by the SDK, so this is a plain read, not a cast. Null stays **absent** rather than becoming `0` — a fabricated zero reads as "no cache write happened", which is a claim the API did not make. `totalTokens` deliberately remains uncached input + output, matching the CLI parser; folding the cache figures in would change semantics for every existing consumer.

Also corrects a rename artifact from #4444: the docstring on `SessionTokenTotals` read "distinguish it from the per-call `SessionTokenTotals`", the rename having been applied to the wrong token. It now says `TokenUsage`, which is what it means.

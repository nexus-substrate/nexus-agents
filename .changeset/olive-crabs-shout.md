---
'nexus-agents': patch
---

Stop discarding Anthropic cache-creation tokens (#4435)

`ClaudeResult.usage` has declared `cache_creation_input_tokens` all along, but the parser only ever extracted `input_tokens`, `output_tokens`, and `cache_read_input_tokens`. Cache-_creation_ tokens were typed and then thrown away.

They are the expensive ones — Anthropic bills cache writes at roughly 1.25x the uncached input rate, versus ~0.1x for reads — and they are not a rare case: a voter panel writes the cache on its first call, so every fresh panel silently lost its largest input measurement.

Now surfaced as `TokenUsage.cacheCreationInputTokens`, kept distinct from `cachedInputTokens` because the two bill at opposite ends and collapsing them would make correct pricing impossible. Absent stays absent — a fabricated `0` would read as "no cache write happened".

Purely additive: `inputTokens` still means uncached input and `totalTokens` is unchanged. Folding the cache figures into the totals is a semantics change for every consumer and stays with the threading increment on #4435.

Found by the contrarian voter on #4435's panel, which was convened to decide what to do about cache _read_ tokens; the creation gap had gone unnoticed.

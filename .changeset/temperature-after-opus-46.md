---
'nexus-agents': patch
---

Fix 400 errors on Claude Opus 4.7 / 4.8 (#4061). Claude models released after
Opus 4.6 reject any non-1.0 `temperature` with a 400 (per the installed
`@anthropic-ai/sdk`: "all other values will be rejected with a 400 error"), but
both the native Claude adapter and the OpenAI-compatible gateway adapter forwarded
the voter / base-agent default (`0.3`) unconditionally — so every call to those
models failed.

A shared, tested predicate (`temperatureUnsupportedForModel`) now gates the param:
both adapters OMIT `temperature` for Claude models after Opus 4.6 — and for
unrecognized/non-numbered Claude families (e.g. `claude-fable-5`, future
families) as a safe-drop — while leaving non-Claude models and recognized ≤4.6 /
legacy Claude untouched. Omitting is equivalent to sending `1.0` (the API default)
and avoids the deprecation. The predicate is robust to provider prefixes,
`-`/`_` separators, and dated suffixes. Note: on after-4.6 models `temperature` is
no longer settable, so voters run at the API default rather than the configured
`0.3` — an unavoidable Anthropic constraint. OpenAI o-series reasoning models have
the same restriction and are tracked separately (#4062).

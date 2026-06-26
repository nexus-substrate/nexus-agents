---
'nexus-agents': patch
---

Extend the temperature-omission fix to OpenAI reasoning models (#4062, follow-on
to #4061). The o-series (o1/o3/o3-mini/o4-mini) reject `temperature` outright, and
the GPT-5 family accepts only the default (`1`) — per OpenAI's documented behavior.
This repo routes codex-5.3→gpt-5.4, codex-5.2→gpt-5.2-codex, codex-5.1-mini→o3-mini,
so gateway-routed voters at the default `0.3` were 400-ing on every one of them,
exactly like the Claude 4.7/4.8 case.

`temperatureUnsupportedForModel` now also returns true for OpenAI reasoning models
(o-series, GPT-5 family except the non-reasoning `gpt-5-chat` variant, and codex
ids), while preserving temperature for non-reasoning models (gpt-4o, gpt-4,
gpt-3.5, gemini, openrouter-\*). The GPT-5 match is anchored so `gpt-50`/`gpt-512`
do not falsely match. The predicate is biased against false positives — a missed
model is a 400 outage, a wrongly matched one only loses the consistency setting.

Also closes a third unguarded path found during the fix: the AI-SDK adapter
(`sdk-adapter.ts`, used by `auto-adapter` for the openai/codex provider — which
routes to reasoning models like gpt-5.4 / o3-mini) forwarded `temperature`
unconditionally and now consults the same predicate. All three adapters that send
`temperature` (native Claude, OpenAI-compatible gateway, AI-SDK) are now covered.

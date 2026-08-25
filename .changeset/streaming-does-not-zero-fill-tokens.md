---
'nexus-agents': minor
---

stop streaming paths reporting a zero prompt count as a measurement

Four streaming paths zero-filled `inputTokens`, against the omit-rather-than-
zero-fill policy the repo states at `gemini-adapter.ts:362` (#4439). A stream
consumer billing on those numbers prices a large-context call at zero prompt
cost, and `inputTokens: 0` is byte-identical whether the prompt was empty or
simply unreported.

- **Claude** — the prompt count arrives on `message_start`, not on
  `message_delta`. The adapter already received that event and read only
  `model`, dropping a number it had in hand. It now carries the real usage,
  read defensively and omitted when a vendor sends none rather than crashing a
  stream over a telemetry field.
- **Gemini** and **the SDK adapter** reported `{0, 0, 0}` where nothing is
  known. They now omit `usage`, which the chunk type already allows — the
  policy applied literally, no type change needed.
- **openai-mappers** keeps the real `outputTokens` and flags the input.

`TokenUsage` gains an optional `inputTokensMeasured`. `false` means the vendor
reported no prompt count, so `inputTokens` is a placeholder and `totalTokens`
is a LOWER BOUND. Absent means measured, so no existing producer changes
meaning. `StreamChunk`'s `message_start` variant gains an optional `usage`.

Fixes #4835.

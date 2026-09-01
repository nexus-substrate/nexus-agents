---
'nexus-agents': patch
---

fix(replay): validate trace lines against the schema instead of casting them

`parseTraceJsonl` did `JSON.parse(line) as ExecutionTraceEntry` while
`ExecutionTraceEntrySchema` sat unused in the very module the file imports its
type from. `trace.jsonl` is written in-tree by `pipeline/trace-writer.ts`, but it
is plain on-disk JSONL read back by a path supplied at read time.

The cast matters because `modelId` flows into `TracedDecision.selectedModel`,
which `compareDecisions` compares with `===`. A non-string `modelId` therefore
made two _structurally identical_ decisions compare unequal, and the replay
audit certified a divergence reading
`Model changed: [object Object] → [object Object]` — a verdict on a comparison
that was never made. Confirmed by test before the fix: an unchanged model over
an object `modelId` reported `divergences: 1`.

Lines are now validated per line, so one bad line is skipped while its siblings
survive. Rejected lines are counted and logged at `warn` rather than `debug`
(the #5018 pattern): at `debug` a replay over a mostly-rejected trace reported a
small clean comparison set with no signal anything was dropped, and a silent
skip is indistinguishable from a genuinely short trace.

One existing test changed rather than being added to. `skips malformed lines`
used `{"valid":true}` and `{"also":true}` as the two lines that _survive_.
Neither carries a timestamp, runId or eventType, so neither is a trace entry —
the cast was the only thing making them look like one, and the test had pinned
that as intended behaviour.

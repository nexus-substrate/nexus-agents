---
'nexus-agents': patch
---

`query_trace` now says what it could not read. `totalEvents` counted the lines
that survived `JSON.parse`, so a partially-flushed JSONL trace — the normal
failure mode for an append-only file written by a process that died mid-write —
was byte-identical to a run that simply emitted fewer events; `skippedLines` and
a `parse_error` category are now reported, and that category was previously
unreachable from the disk path because no `SyntaxError` ever escaped the parser.
Separately, a trace over the 100 MB read cap was reported as
`source: 'not_found', totalEvents: 0` — "there is no trace for this run", for
the one case where the trace certainly exists and is certainly non-empty. It is
now `source: 'disk'` with a `too_large` category.

---
'nexus-agents': patch
---

test(mcp): round-trip async dispatch, not just each tool's ordinary response

The output-schema round-trip suite calls each tool once, so it only ever sees
one of a tool's response shapes. Async dispatch is a second one — `runAsJob`
returns `{status:'pending', jobId}` rather than the tool's payload — and #5066
was exactly that gap: `consensus_vote` declared an `outputSchema` its async
envelope could not satisfy, and every `mode: 'async'` call failed with `-32602`
while the suite stayed green.

The async-capable set is derived from each tool's advertised input schema (a
`mode` property accepting `'async'`) rather than hand-listed, so a tool gaining
async dispatch later cannot go quietly uncovered. It has to be given arguments
or the suite fails.

The derivation earned that immediately: it found `run_workflow`, which
advertises async mode and was absent from the hand-written list it replaced.
Four tools are now covered, up from one.

Tools without an `outputSchema` today are covered anyway — gaining one is
precisely how the break would return.

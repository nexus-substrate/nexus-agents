---
'nexus-agents': minor
---

fix(mcp): the stdio server no longer outlives its client (#5231)

A `--mode=server` process exists to answer one client over one pipe, and nothing
was telling it when that pipe closed. The SDK's `StdioServerTransport` registers
only `stdin.on('data')` and `stdin.on('error')` — never `'end'` or `'close'` —
and reaches its own `close()` only from the `_ondata` parse-error path.
`startStdioServer` registered nothing either. So a disconnected client left a
fully-resident server running indefinitely.

Measured on one machine before the fix: **140 resident servers holding 28.9 GB**,
the oldest **3.9 days** old, under 23 abandoned parent processes. System memory
available was 1.4 GB of 64 GB, which was OOM-killing local `tsc` and `eslint` and
crashing interactive sessions.

`startStdioServer` now closes the server and exits when stdin ends or closes.
Both events are watched, because a pipe torn down abruptly emits `'close'` with
no preceding `'end'` — exactly the abandoned-parent case. `'data'` and `'error'`
are deliberately not shutdown signals: a transient read error is not a departed
client.

`wireStdioShutdown` is exported separately so the behaviour is testable against a
fake stream; verifying it through `startStdioServer` would require a test to
observe its own `process.exit`.

**Behaviour change worth noting:** a stdio server that previously stayed resident
after its client disconnected now exits with code 0. This is the intended fix,
but it is a change in when the process terminates.

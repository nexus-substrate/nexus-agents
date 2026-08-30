---
'nexus-agents': patch
---

fix(mcp): remove the duplicate stdio shutdown guard and correct its changelog

The previous entry — *"fix(mcp): the stdio server no longer outlives its client"* —
**was wrong on the load-bearing point, and this note is the correction.**

`startStdioServer` has **zero production callers**. `--mode=server` routes
`cli.ts → cli-server.ts:startServer → connectToStdioTransport`, and
`cli-server.ts:605-610` has wired `StdinLifecycleMonitor` to `process.exit(0)`
since #810/#2905. That monitor already watches **all three** signals — stdin
`'end'`, stdin `'close'`, and a ppid poll — which is strictly more than the guard
that was added. The shipped bundle confirms it: `dist/cli.js` contains two
references to `StdinLifecycleMonitor` and **zero** to `startStdioServer`.

So the added guard could not fire in the binary that leaked, and
`mcp/stdio-lifetime.ts` was a second implementation of
`adapters/stdin-lifecycle.ts` — the anti-sprawl rule this repo enforces
elsewhere.

**The root cause was also misdiagnosed.** The 140 resident servers had **living**
parents — 23 simultaneous `codex mcp-server` processes. So stdin never closed and
ppid never changed, and the monitor correctly stayed silent. The servers behaved
as designed. What actually leaked is that those parent sessions never exited and
each spawned many servers; #5231 carries the corrected analysis.

The memory measurements in the reverted entry were accurate — 140 processes,
28,940 MB, oldest 3.9 days — and clearing them did free 25 GB. Only the
attribution was wrong.

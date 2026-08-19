---
'nexus-agents': patch
---

Guarantee subprocess tempdir cleanup on every exit path (#4488).

`CommandConfig.cleanup` removes a tempdir the command builder created — for codex that is `nexus-codex-sysprompt-*`, holding the system prompt. It was invoked inside a wrapped `resolve()`, which covers normal completion but not a synchronous throw: `spawn()` throws on some failures (EACCES, and ENOENT on certain platforms) and handler setup can throw too. Those paths skipped cleanup entirely and rejected the promise instead of returning a `Result`, breaking the never-throws contract this adapter is meant to honour.

The executor body is now wrapped, cleanup runs through a once-guard on every path, and a synchronous spawn failure returns a proper `EXECUTION_ERROR` Result.

This is the same leak class `codex-adapter` already documents as having "exhausted inodes on long-running MCP daemons" — the fix there attached cleanup to the command config; this attaches it to the paths that consume it.

Verified by mutation: removing the cleanup call from the new catch fails the regression test. The first version of that test passed the mutation because a nonexistent binary surfaces as an _async_ `error` event and never reaches the catch — it now forces a synchronous throw via the existing `spawn` mock.

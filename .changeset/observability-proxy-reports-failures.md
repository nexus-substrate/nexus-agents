---
'nexus-agents': patch
---

fix(mcp): the tool observability proxy reported every failed call as a success

`createToolObservabilityProxy` emitted `tool.completed { success: true }` from
the `try` path with the value hardcoded, and read failure only from its `catch`.
Nexus tools do not throw — `toolStructuredError` returns `{ isError: true }` —
so no real tool failure ever reached the `catch`, and every EventBus consumer
saw a 100% tool success rate. A tool returning a validation or internal error
envelope was indistinguishable from one that worked.

`success` is now derived from `result.isError`, matching what the sibling
middleware `tool-metrics.ts` has always recorded, and a returned envelope
carries its text as `errorMessage` the way the throw path already did.

The existing failure test used a _throwing_ handler, which is why the gap
survived: it exercised the one path production never takes.

---
'nexus-agents': minor
---

Select a working Codex read-only sandbox backend before starting CLI or MCP seats.
On Linux, the async, process-memoized preflight tries plain arguments first, then
the legacy landlock flag needed by some older Codex installations. The first
successful candidate supplies the arguments for both transports, and doctor
reports the selected backend. This avoids the legacy-flag panic on modern Codex
hosts where bubblewrap already works.

If neither candidate succeeds, a numeric nonzero exit with a recognized sandbox
diagnostic from either candidate marks the sandbox broken and refuses execution;
timeouts, spawn failures, and unrecognized diagnostics alone remain unknown.
Unknown default probes proceed read-only with plain arguments because legacy is
deprecated and panics on modern Codex; older installations use legacy when that
candidate is verified. Injected synchronous or asynchronous probe results that
omit sandboxArgs preserve the previous platform arguments (legacy on Linux,
plain elsewhere), while explicit empty arguments select the modern default.

---
'nexus-agents': patch
---

test(mcp): every dispatch tool must advertise the fields its handler accepts

Four tools maintain a hand-written object literal for `registerTool` rather
than registering `SomeSchema.shape`, and a mirror is a second declaration of
one contract. `run_workflow`'s omitted `idempotencyKey` was exactly that: the
SDK stripped the field before the handler saw it, every async dispatch minted a
fresh jobId, and the `replay` / `collision` envelopes could never fire — a
whole feature unreachable with nothing red.

The parity check runs at the protocol boundary, comparing what `listTools()`
advertises against the schema each handler parses with, so it holds whether a
tool mirrors or registers `.shape`.

Keys only, deliberately. Replacing the mirrors with `.shape` was tried and
measured: it degrades six caller-facing descriptions and newly advertises
internal defaults. The mirrors carry better text than the internal schemas —
descriptions should be free to differ, the field set must not.

Refs #4972 finding 3. Finding 2 (`run_workflow`'s stripped `idempotencyKey`) is
already fixed on main; finding 1 (AbortSignal adoption) stays open.

---
'nexus-agents': patch
---

say why the dev pipeline did not complete on the `run` path, and keep the result

Every non-completion reaching `run` collapsed to "the dev pipeline did not
complete", and `exec.result` was discarded — so a caller could not tell a
security gate that REJECTED the change from one that never ran, which is the
distinction #4772/#4783 added `securityRan` to provide.

The message now names the reason (empty plan, security rejected, stopped before
the gate) and the engine's result travels in the error envelope's `detail`.
`securityRan` is read as three-valued: absent means a producer predating the
field, not `false`, so the generic message stands rather than claiming a reason
we do not have.

Fixes #4789.

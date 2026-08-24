---
'nexus-agents': patch
---

fix(workflows): stop retrying validation failures

`isNonRetryableError` could not return true. `step-executor` wraps every
failure in a `WorkflowError`, and `WorkflowError` hardcodes
`code: ErrorCode.WORKFLOW_ERROR` while `Omit`-ing `code` from its options — so
a caller cannot set `VALIDATION_ERROR` even deliberately, and `name` is always
`'WorkflowError'`. Both branches of the guard were unreachable from the one
call site that uses it, and a validation failure was retried to exhaustion:
same input, same failure, every time.

The original error survives as `cause` on the wrap, so the guard now walks the
cause chain rather than changing the error class. The walk is cycle-guarded —
`cause` is untyped at that boundary, and a loop would hang the retry rather
than fail it.

Absence of a cause still means retry. No evidence of a permanent failure is not
evidence of one.

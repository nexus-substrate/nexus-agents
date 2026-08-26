---
'nexus-agents': minor
---

tell a poller when a job will never settle

`runAsJob` writes a durable `pending` record and runs the body as a detached
in-process promise. If the process dies mid-body no terminal writer runs, and
`writeJobPending` refuses to overwrite an existing file — so the record stays
`pending` forever and `get_job_result` tells the caller to keep waiting on work
that no longer exists.

The response now carries `abandoned` when a `pending` record has outlived the
`async-job-body` runaway guard. That anchor is objective rather than a chosen
timeout: a live job cannot still be pending past the guard, because the guard
would already have recorded it `failed`.

The record itself is left saying `pending`. It is evidence of what was
observed, and rewriting it on read would destroy that — the qualifier goes on
the response, the same treatment `notVerified` gives an audit chain that
verified nothing.

This is the caller-facing half of the lifecycle gap. A reaper and a retention
policy are still needed, and the retention window is a real trade between disk
and auditability rather than something to pick silently.

---
'nexus-agents': minor
---

`cancel_job` now stops an async `run_workflow` or `execute_spec` job at the next step boundary. Before this, cancelling either job marked the record `cancelled` while the run kept dispatching steps, and so kept spending, until it finished.

- `IWorkflowEngine.execute` options gain `signal` (new, optional): `WorkflowEngine` links it to the execution's own abort controller, so a step not yet dispatched is skipped and the run fails with `Workflow cancelled` at the next phase boundary, including after the final phase.
- `SpecExecutionOptions.signal` (new, optional): `executeSpec` hands the signal to the graph executor, which checks it before each super-step. Once it has fired, `executeSpec` returns the error `Spec execution cancelled` at stage `execute`, never a partial result that goes on to validation.

In both cases a step that is already running finishes. Only the steps after it are skipped. The job record's `signalAccepted` is now `true` for both tools. `orchestrate` and `run` still do not accept the signal (#6305).

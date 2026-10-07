---
'nexus-agents': minor
---

Expose plan-vote evidence in `run_pipeline` dry runs using the same field names as `run_dev_pipeline`: decision, measured approval percentage, persisted vote-record id, and available reason or feedback. Approved votes return this evidence in the success response; rejected and no-quorum votes retain `isError: true` and include their evidence in the structured error envelope's detail. Infrastructure failures surface their reason without reporting the fail-closed sentinel 0% as a measured approval percentage. Pipeline success/failure and graph state semantics are unchanged.

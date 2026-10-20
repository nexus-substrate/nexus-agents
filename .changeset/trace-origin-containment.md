---
'nexus-agents': minor
---

Persist versioned trace attribution and snapshot-bound writer observations, dropping explicitly foreign events while preserving bounded global signal context. Query counts distinguish writer observations, retained rows, filtered rows and returned pages; missing or mismatched metadata remains unmeasured.

Legacy and unthreaded producer traces remain readable as UNKNOWN and no longer certify weather participation or replay decisions. This containment increment does not yet thread dev-session or durable-attempt origins, distinguish reused/concurrent session invocations, or prove worker/callback/process completion.

Safe dotted and Unicode task IDs remain unchanged in local trace files. Unsafe output paths or IDs beyond bounded metadata cause an explicit trace-loss warning while task execution continues. The existing `query_trace` MCP input still accepts only 1–128 ASCII letters/digits, hyphens and underscores; this increment does not broaden that input contract.

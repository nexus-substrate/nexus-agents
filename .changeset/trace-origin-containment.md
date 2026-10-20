---
'nexus-agents': minor
---

Persist versioned trace attribution and snapshot-bound writer observations, dropping explicitly foreign events while preserving bounded global signal context. Query counts distinguish writer observations, retained rows, filtered rows and returned pages; missing or mismatched metadata remains unmeasured.

Legacy and unthreaded producer traces remain readable as UNKNOWN and no longer certify weather participation or replay decisions. This containment increment does not yet thread dev-session or durable-attempt origins, distinguish reused/concurrent session invocations, or prove worker/callback/process completion.

---
'nexus-agents': minor
---

Enforce declared required pipeline evidence obligations before successful completion. Add host-configured artifact content digest verification, structured evidence reports, and accepted/rejected receipts persisted atomically with the final decision.

Content verification certifies only the expected artifact bytes. It does not prove worker delivery or model inspection; the actual worker-to-pipeline evidence bridge remains pending under #7523. Legacy tasks with no declared obligations retain their execution behavior.

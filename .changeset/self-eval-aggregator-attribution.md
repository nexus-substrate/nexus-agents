---
'nexus-agents': patch
---

Attribute aggregator synthesis audit entries to 'aggregator' rather than borrowing 'code-quality' evaluator role, and widen `AuditEntry.agent` to `EvaluatorRole | 'aggregator'` (#5655).

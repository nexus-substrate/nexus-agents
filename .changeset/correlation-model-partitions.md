---
'nexus-agents': minor
---

The `correlationMaxAgeMs` and `observationDecayFactor` keys are retained as deprecated no-ops for compatibility, with removal tracked in #5564. Correlation history is now partitioned by each role's pinned model, while the model that actually answered is retained as provenance.

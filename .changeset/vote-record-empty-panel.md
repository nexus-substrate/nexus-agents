---
'nexus-agents': patch
---

Refuse to persist consensus vote records with no voter attribution, returning an `empty-panel` reason and logging a warning. Panels whose voters all errored still retain their no-quorum records and failure coverage.

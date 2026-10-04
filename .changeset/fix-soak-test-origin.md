---
'nexus-agents': patch
---

Count production code-PR soak evidence only, report excluded test rows in readiness, and stamp new records with origin. Legacy unstamped `audit-soak-<digits>` records are counted as excluded test output without rewriting the ledger. Assert soak paths use the existing test data-dir override.

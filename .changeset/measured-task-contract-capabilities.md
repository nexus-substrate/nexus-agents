---
'nexus-agents': patch
---

Populate orchestration and delegation task contracts with analyzed constraints,
required capabilities, and measured capability gaps. Unsupported symbol-extraction
requests now report inferred gaps with `allSatisfied: false`, independently of
ledger recording settings. The contract schema remains unchanged; unrecognized
scope stays empty and unrecognized time and quality constraints remain absent.

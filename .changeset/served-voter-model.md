---
'nexus-agents': patch
---

Accept optional `servedModel` identifiers when reading vote records, validate their format, and include them in hash verification while preserving existing record hashes. Vote-record producers do not yet write this field, so existing producer behavior is unchanged.

---
'nexus-agents': patch
---

Accept optional `servedModel` identifiers when reading vote records, validate their format (`servedModel_invalid` on malformed input), and include them in hash verification while preserving existing record hashes. Vote-record producers in this release do not write the field, so producer behavior is unchanged; the reader exists so ledgers written by later producers still verify.

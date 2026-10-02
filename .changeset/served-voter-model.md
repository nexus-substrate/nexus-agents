---
'nexus-agents': patch
---

Accept optional `servedModel` identifiers when reading vote records, validate their format, and include them in hash verification while preserving existing record hashes. Vote-record producers do not yet write this field, so existing producer behavior is unchanged.

Preserve the configured-model diversity floor for records without `servedModel`. A serving report retains a seat's known configured family only when its known family matches; mismatched or unclassifiable reports withhold credit. Bare Claude alias normalization applies only to the serving comparison. The gateway's own claim (#6952) can never grant a new family.

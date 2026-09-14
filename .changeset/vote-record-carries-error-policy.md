---
'nexus-agents': patch
---

The persisted vote record now carries the error policy the panel actually ran under (schema tier `1.11`, field `errorPolicy`). The value is the effective policy after the per-strategy default was applied — `reduce_denominator` for a vote that never named one, `fail_closed` for an unnamed `unanimous` vote — not the raw tool input, and it is folded into the record's self-hash as the last present-only key, so a record cannot be relabelled after the fact. Records at 1.10 and below carry no such key and re-hash byte-identically; nothing in an existing ledger needs rewriting. Both producers write it: the `consensus_vote` MCP tool and the `nexus-agents vote` command.

The governor ratification gate (`scripts/governor-ledger-evidence.ts`) gains a `wrong-error-policy` verdict for a bound record whose recorded policy is anything but `absolute_quorum`, reported ahead of `degraded-panel`. A record without the field keeps the panel-coverage inference the gate already made, and the `ratified` annotation now says which applied: `errorPolicy: absolute_quorum` or `errorPolicy: unrecorded`. The gate remains warn-first; #5131 is still the flip to a failure.

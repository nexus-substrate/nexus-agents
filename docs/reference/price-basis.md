---
title: 'Price basis in recorded costs'
description: 'Meaning and persisted-reader compatibility of the published PriceBasis vocabulary'
tier: 2
keywords: [pricing, telemetry, gateway, compatibility]
---

# Price basis in recorded costs

`PriceBasis` describes the rate behind a recorded dollar figure. Consumers of
outcome records, voter and decision cost summaries, and injected
`WeatherReportDeps` records must handle all three members. The runtime validator
and TypeScript union share `PriceBasisSchema` in `core/price-basis.ts`.

| Basis      | Meaning                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `list`     | An assumed published registry-chain rate. Operator manifest overrides and fuzzy matches still carry this label.                |
| `declared` | An explicit operator statement in `NEXUS_GATEWAY_COST`: `priced:<in>,<out>`, `free`, or `local`. This is not a published rate. |
| `unknown`  | No usable price was resolved. This does not mean the call was free.                                                            |

For example, `NEXUS_GATEWAY_COST=priced:2,10` prices one million input tokens and
half a million output tokens at $7 with basis `declared`. `free` and `local`
record a measured $0 with the same basis. Bare `priced` delegates to the registry:
its basis is `list` when priced, otherwise `unknown`. Unset or invalid declarations
remain unpriced with basis `unknown`.

Decision totals use `list` if any voter states a list basis, otherwise `declared`
if any voter states a declaration basis, otherwise `unknown` when a basis was
stated. Per-voter rows preserve individual sources. Empty voter sets and callers
that state no basis leave the field absent. Plan-mode summaries omit the basis
because their recorded zero is determined by billing mode.

`priceBasisCaveat` provides wording for both priced bases and returns no caveat
for `unknown`. Its exhaustive switch and the decision summary switch fail to
compile if a future union member lacks handling. Weather reports accept declared
records; their cross-decision aggregates currently expose cost and coverage
without a price-basis field. Inspect per-decision or per-voter records for rate
provenance.

## Persisted-reader compatibility

The next-major release adds `declared` to the published union. Current in-tree
outcome and decision-cost readers use the shared schema and accept it. Older
readers with the `list`/`unknown` schema reject these records and may skip whole
JSONL rows, rather than just ignoring the basis. Upgrade readers sharing telemetry
before producing declared records. Existing records, including those without a
basis, remain readable. See the [gateway configuration](../getting-started/CONFIGURATION.md)
for declaration syntax.

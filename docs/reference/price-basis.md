---
title: 'Price basis in recorded costs'
description: 'Meaning and persisted-reader compatibility of the published PriceBasis vocabulary'
diataxis: reference
audience: user
tier: 2
keywords: [pricing, telemetry, gateway, compatibility]
---

# Price basis in recorded costs

`PriceBasis` describes the rate behind a recorded dollar figure. Consumers of
outcome records, voter and decision cost summaries, and injected
`WeatherReportDeps` records must handle all three members. The runtime validator
and TypeScript union share `PriceBasisSchema` in `core/price-basis.ts`.

| Basis      | Meaning                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list`     | An assumed published registry-chain rate, including in-tree prices. A fuzzy match may resolve a different model's rate.                                                               |
| `declared` | A manifest-overlay price (user or operator tier), or an explicit `NEXUS_GATEWAY_COST` statement: `priced:<in>,<out>`, `free`, or `local`. Neither verifies the vendor's billing rate. |
| `unknown`  | No usable price was resolved. This does not mean the call was free.                                                                                                                   |

For example, `NEXUS_GATEWAY_COST=priced:2,10` prices one million input tokens and
half a million output tokens at $7 with basis `declared`. `free` and `local`
record a measured $0 with the same basis. Bare `priced` delegates to the registry:
it inherits the resolved tier's basis (`declared` for an overlay-priced model,
`list` for an in-tree price), or `unknown` when no price resolves. Unset or invalid
declarations remain unpriced with basis `unknown`.

Manifest-overlay prices retain `declared` through fuzzy matches that resolve to
the overlay entry. Metadata-only overlays do not declare an inherited rate.

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

`declared` has been part of the published union since 9.0. Current in-tree
outcome and decision-cost readers use the shared schema and accept it. Older
readers with the `list`/`unknown` schema reject these records and may skip whole
JSONL rows, rather than just ignoring the basis. Upgrade readers sharing telemetry
before producing declared records. Existing records, including those without a
basis, remain readable. See the [gateway configuration](../getting-started/CONFIGURATION.md)
for declaration syntax.

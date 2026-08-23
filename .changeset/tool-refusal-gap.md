---
'nexus-agents': patch
---

Record tool-refusal capability gaps (#4651)

The capability-gap loop was inert: `detectCapabilityGaps` compares required
against available capabilities, and the required set is drawn from static
lookup tables whose every entry is already available — a subset of a superset,
so the difference is always empty. The ledger recorded nothing and
`research-trigger` ranked frequency over an always-empty list.

This gives it a real producer, chosen by a 7-voter panel (option C, unanimous
among approvers). `CapabilityGap['type']` gains `tool_refusal`: a tool that
exists, ran, and declined work it can name — as opposed to a registry gap,
which is a capability that does not exist at all.

First emitter is `extract_symbols` hitting its extension gate. It records at
the MCP tool boundary rather than in the extractor, so the count reflects what
agents actually asked for; the `search_codebase` sweep pre-filters by extension
and cannot inflate it. `no-declarations` is deliberately not recorded — a file
that parsed and declares nothing is a measured zero, not a missing capability.

`research-trigger`'s generated tasks are now phrased per gap kind. The single
wording was routing-specific ("observed Nx in routing decisions … route the
goal through the MetaOrchestrator"), which would have made the loop's first
real signal produce a task that misdescribes its own evidence.

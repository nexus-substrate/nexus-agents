---
'nexus-agents': patch
---

Assert TypeDoc entry-point coverage in CI (#4504).

`typedoc.markdown.json` declares 19 entry points; generation produces 16 module pages. Three barrels — `pipeline`, `benchmarks`, `agents-ictm` — emit nothing, so `PipelineRunner` (a CLAUDE.md canonical path) and `BenchmarkAdapter` have **no published API reference at all**. This went unnoticed for months because the committed docs tree still held stale pages for those modules from an older config; deleting that tree in #4449 exposed it.

The previous gate only asserted that _some_ pages were produced, which a silently-vanishing module passes trivially. It now compares generated pages against **declared entry points**.

Chosen by a 7-voter `higher_order` panel (4-2, one reject). The cause is unconfirmed — the re-export-barrel theory fits two of the three modules but not `benchmarks.ts` with its 20 export statements — so committing to a fix means committing unbounded effort against an undiagnosed defect. The durable problem is that the pipeline claimed 19 and silently delivered 16; this makes that claim checkable.

`KNOWN_MISSING` enumerates exactly the three failing entry points, the condition both A-voters attached. The panel drew the distinction explicitly: the stale committed pages were an invisible default reading as a pass, whereas an enumerated allowlist is partial coverage honestly labelled. The gate still **fails closed on any fourth divergence** — verified by removing a fourth page and watching it exit 1 — and the list is a monotonically decreasing coverage metric. An allowlisted entry that starts generating is reported as stale so the list shrinks rather than rots.

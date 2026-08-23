---
'nexus-agents': patch
---

Persist the capability-gap ledger (#4645)

`getGapLedger()` is now backed by a JSONL file under the nexus data dir instead
of process memory.

Its consumer — `pipeline/research-trigger.ts` — ranks gaps **by frequency** and
turns the frequent ones into research. In memory, "frequent" meant "since this
process started": seconds for a CLI invocation. A gap recurring once a day for a
month never became frequent, because each observation landed in a different
process — and a gap that recurs across sessions is precisely the kind worth
researching.

Four of seven voters on the #4651 panel raised this independently, including the
one who voted against the proposal outright, so persistence lands **before** the
first producer rather than after it.

`loadReport()` distinguishes states that all summarize to "no gaps": file absent
(nothing was ever written, or the ledger is aimed at the wrong path), malformed
lines (counted, never silently skipped — a silent skip under-reports demand),
and entries dropped by the 90-day retention window.

Switching the default is a no-op today: `detectCapabilityGaps` cannot currently
produce a gap (#4651), so nothing is written until the tool-refusal producer
lands.

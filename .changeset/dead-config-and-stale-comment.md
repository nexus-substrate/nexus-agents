---
'nexus-agents': patch
---

chore: remove a config knob nothing sets and correct a stale ledger comment

`PersistentGapLedgerConfig.maxEntries` had no writer anywhere — production or
test — so the in-memory cap was permanently its default. It is a constant now
rather than a knob nothing turns. Its sibling `retentionDays` stays: a test uses
it to control retention without manipulating clocks.

`issue-triage.ts` re-exported `formatTriageComment` "for convenience" from
`issue-triage-helpers.js`, but nothing imported it via that path — the barrel
already re-exports it from the helpers module directly.

The `getGapLedger` doc still said "nothing is written until the tool-refusal
producer lands". It landed: `extract-symbols-tool.ts` calls `recordToolRefusal`,
which defaults to this ledger and writes `tool_refusal` entries (#4654).

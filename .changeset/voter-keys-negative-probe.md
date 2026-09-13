---
'nexus-agents': patch
---

The audit vote-record's voter-field exhaustiveness constraint is now pinned by a compile-time negative probe (#6092). `VOTER_SUMMARY_KEYS` — the canonical field order the vote-record hash iterates — is initialised through a helper whose parameter type rejects a tuple missing any `VoterSummary` key. That rejection was verified only by a one-off mutation on #6077; a TypeScript release that changed inference on intersected conditionals could have silenced it with no gate noticing, and a schema field would then hash as absent. A never-called `@ts-expect-error` call with the tuple minus `retried` now sits beside the helper: while the constraint fires the directive consumes TS2345, and if it ever weakens the directive is unused and `tsc` fails with TS2578. A vitest source-presence test guards the probe itself. No runtime behavior changes; hashes, schemas and the ledger format are untouched.

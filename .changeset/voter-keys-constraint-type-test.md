---
'nexus-agents': patch
---

No runtime change; the voter-key exhaustiveness constraint on `VOTER_SUMMARY_KEYS` in the vote-record module is now probed by a type test (#6092). The constraint that makes an incomplete key tuple a compile error (#6077) has moved to a `CompleteKeys` type in a sibling audit module, still consumed by the same tuple initializer, and a dedicated test asserts it resolves to `never` for a tuple missing a key — so `tsc` fails if a future TypeScript release weakens the check, instead of the omission going unnoticed until a manual mutation. Emitted JavaScript for the vote-record module is unchanged.

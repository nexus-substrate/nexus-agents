---
'nexus-agents': minor
---

Vote records now keep each voter's stated grounds. `generateVoteHash` already hashed `{role, decision, reasoning}` and the record then discarded the text, so the chain attested to a value it did not store and a blocking dissent survived only in the terminal scrollback of whoever ran the vote. Schema 1.6 adds an optional `reasoning` per voter entry, clipped at 20,000 characters with a `reasoningTruncated` marker on the entry it clipped. Entry-level fields are folded into the self-hash only when present, so every existing record still verifies.

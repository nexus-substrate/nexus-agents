---
'nexus-agents': patch
---

fix(audit): validate a ledger record against the read schema before appending it (#6054)

Both hash-chained JSONL ledgers (`vote-records`, `pr-review-records`) appended
`JSON.stringify(record)` with no schema check; the only `safeParse` was on the
read path. A builder could emit a record the schema rejects, the append
succeeded, and the line surfaced later as an `invalidLines` entry that no
non-test consumer reads. #6049 shipped exactly that shape.

For an append-only chain that direction is wrong: an unreadable line cannot be
repaired in place because the chain has already moved past it. Both stores now
serialize through one shared `serializeValidatedRecord(schema, record, ledger)`
guard — one definition of "valid at write", so the two ledgers cannot drift.

Behaviour for a valid record is unchanged, including its hash. A record the
read schema would reject is refused before it is durable: the store's existing
`try` turns the throw into `logger.warn` + `undefined`, the same outcome a
failed write already has, and the warning names the failing field rather than
only "write failed". Persistence still never throws into the vote path.

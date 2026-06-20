---
'nexus-agents': minor
---

feat(governance): surface authentic-vote-record persistence outcome in consensus_vote result (#3991)

The `consensus_vote` tool persists an authentic, committable vote record
(`governance/vote-records.jsonl`, #3897) at vote time, but a skipped or failed
persist was only a server-side WARN — invisible to MCP clients. A live 2.135.0
vote produced a real decision with NO persisted record and no signal the MCP
caller could see.

Observability only — the persistence path and cwd-resolution logic are
UNCHANGED, the vote outcome is unchanged, and persistence stays best-effort
(a persist skip never fails or blocks the vote).

- `recordAuthenticVote` now returns a structured `VoteRecordPersistOutcome`
  (`{ persisted: true, record }` or `{ persisted: false, reason, detail }`,
  where `reason` is `'all-simulated' | 'no-repo-root' | 'write-failed'`). The
  `no-repo-root` detail reuses the existing server WARN text, so it carries the
  actionable fix (set `NEXUS_VOTE_RECORDS_PATH` or commit the returned bytes).
- The `consensus_vote` result gains additive fields `voteRecordPersisted:
  boolean` and, when not persisted, `voteRecordNote: string`. The output schema
  is updated to match. No existing result fields are renamed or removed; the
  tool description is unchanged.
- The server-side WARN is retained (defense-in-depth).

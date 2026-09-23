---
'nexus-agents': patch
---

Vote records are no longer written into a linked git worktree's ledger, and concurrent votes no longer share a sequence number (#6531).

- **Worktree routing.** Before this fix, a `nexus-agents vote` (or `consensus_vote`) run from inside a linked git worktree wrote its record to `<worktree>/.nexus-agents/governance/vote-records.jsonl`. That file started out empty, so the record got sequence `#0`, and it was deleted when the worktree was removed. `scripts/append-ratification-record.ts` then failed with `record-not-found` when run from the main checkout. The `governance` data category now resolves to the main checkout's `.nexus-agents/`. The main checkout is found through the worktree's `gitdir` → `commondir` link, and the link must point back at the worktree the way git writes it; otherwise the worktree's own root is kept. Every other per-repo category (`tmp`, `sessions`, `jobs`, `audit`, …) stays worktree-local.
- **Concurrent writers.** Each append read the ledger's highest sequence and then appended, so two processes could both claim the same "next" number. For example, six writers starting at once on a new ledger all wrote sequence 0. The read and the append now run under a cross-process lock file (`<ledger>.lock`, created exclusively; a lock older than 30 s is treated as abandoned and broken; acquisition times out after 10 s). A timeout is reported as a failed write, never as a written record.
- **Read-back.** After appending, the recorder reads the record back from the ledger by id and hash. If it is missing, the outcome is `persisted: false` with reason `read-back-missed`, the CLI prints `Vote NOT recorded…`, and `nexus-agents vote` exits 1 even when the vote was approved. The MCP response reports it as `voteRecordPersisted: false` with the reason in `voteRecordNote`.
- The CLI line now names the ledger: `Audit record #N written (<id>) to <path>`. Scripts that match on the `Audit record #N written (<id>)` prefix still work.

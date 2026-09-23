---
'nexus-agents': patch
---

Vote records are no longer written into a linked git worktree's ledger, and concurrent votes no longer share a sequence number (#6531).

- **Worktree routing.** Before this fix, a `nexus-agents vote` (or `consensus_vote`) run from inside a linked git worktree wrote its record to `<worktree>/.nexus-agents/governance/vote-records.jsonl`. That file started out empty, so the record got sequence `#0`, and it was deleted when the worktree was removed. The `governance` data category now resolves to the main checkout's `.nexus-agents/`, and git itself decides which checkout that is: the worktree's admin dir must point back at it, `git rev-parse --git-common-dir` gives the shared git dir, and `core.bare`/`core.worktree` are read from that dir's config.
  - A worktree of a submodule resolves to the submodule's checkout.
  - A worktree of a bare repository, or of a `--separate-git-dir` clone (git records no path back to that clone's checkout), keeps its own root.
  - Every other per-repo category (`tmp`, `sessions`, `jobs`, `audit`, …) stays worktree-local.
- **Concurrent writers.** Each append read the ledger's highest sequence and then appended, so two processes could both claim the same "next" number. For example, six writers starting at once on a new ledger all wrote sequence 0. The recorder now takes a cross-process lock file (`<ledger>.lock`) around the read and the append.
  - Waiting for the lock is asynchronous, so a busy ledger does not stall the MCP server.
  - A lock is treated as abandoned only when its owner process on this host has exited, or, for another host or an unreadable owner, when the lock is older than 30 s.
  - Breakers take turns and check again before removing a lock, so a lock another process has just acquired is never removed.
  - Timing out after 10 s is reported as a failed write, never as a written record.
- **Read-back.** After appending, the recorder reads the record back from the ledger by id and hash. If it is missing, the outcome is `persisted: false` with reason `read-back-missed`, the CLI prints `Vote NOT recorded…`, and `nexus-agents vote` exits 1 even when the vote was approved. The MCP response reports it as `voteRecordPersisted: false` with the reason in `voteRecordNote`.
- The CLI line now names the ledger: `Audit record #N written (<id>) to <path>`. Scripts that match on the `Audit record #N written (<id>)` prefix still work.

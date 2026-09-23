---
'nexus-agents': minor
---

The `AuditLogger` hash chain now survives more than one process writing to the same log directory (#6546). Before this, each process started its chain from nothing. The first event written after a server restart, or by a second concurrent session, had no `previousHash`, and concurrent processes interleaved two separate chains in one file. `verify_audit_chain` reported `previous_hash_mismatch` for every such log, the same verdict it gives for a deleted event.

- `FileAuditStorage` now appends under the cross-process file lock (`<logDir>/<filePrefix>.lock`). While it holds the lock, it moves to the newest log file, reads the hash of the last valid event on disk (looking back past an empty newest file), links the batch to that hash, and writes it out. Only the first event in an empty directory has no `previousHash`.
- Events are now linked when the queue is flushed, not when `log()` is called. An event dropped by queue backpressure no longer leaves a break in the chain. The logger's drop warning and counter still report it.
- If the lock cannot be acquired, the flush fails loudly as before, and the batch stays queued for the next flush instead of being lost.
- `IAuditStorage` gains an optional `appendChained` method. Custom storages without it keep the previous single-process behaviour.
- Logs written before this release still fail verification at each old restart point. Those breaks are real and stay reported; there is no marker that hides them. Writers from older releases do not take the lock, so breaks continue until every process writing to the directory is upgraded. See §1.5 of `docs/security/audit-hash-chain-threat-model.md`.

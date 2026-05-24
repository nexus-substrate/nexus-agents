---
'nexus-agents': minor
---

**fix(consensus):** switch correlation persistence to append-only JSONL. Closes #2973.

The previous design — read `correlations.json`, merge with the proposals to save, write to a PID-suffixed temp file, then `renameSync` — was race-free **within** a process but unsafe **across** processes. Two processes voting concurrently (e.g., the MCP server and a parallel `nexus-agents vote` CLI) each loaded N entries, each merged their own proposal, each renamed over the same file. The first writer's proposal was silently lost. HOV (Higher-Order Voting) correlation history degraded over time under fan-out load — the Bayesian correlation signal depended on the proposals we were dropping.

Switched the store to append-only `correlations.jsonl` (one `PersistedProposal` per line). POSIX `O_APPEND` (used implicitly by `appendFileSync`) guarantees atomic writes per line for sizes under `PIPE_BUF` (4 KB Linux, 512 B macOS) — well above what a typical 3-7-voter proposal line takes. Concurrent writers from any number of processes all land their lines. No read-merge-rename cycle on save.

**Reads** consolidate both stores: legacy `correlations.json` (skipped if corrupt/invalid-schema) plus all JSONL lines, dedup by `proposalId` (later wins per id), FIFO-truncate to `config.maxProposals`. Loaders previously got truncation enforced at save time; now they enforce it themselves on `loadCorrelationData(config)` — pass the config explicitly if you care about the cap (callers that pass nothing get `DEFAULT_HIGHER_ORDER_CONFIG.maxProposals = 5000`, generous enough for any single-session use).

**Compaction:** added `compactCorrelationData()` that consolidates JSONL + legacy into a fresh deduplicated JSONL and removes the legacy file. Safe to call periodically (e.g., on session shutdown) to bound disk size. Compaction itself is NOT cross-process race-free — serialize it (single compactor per data dir, or guard with a lockfile).

**Migration:** zero-touch for existing users. The legacy `correlations.json` is read alongside the JSONL on every load; new writes go to JSONL. After `compactCorrelationData()` runs (or after any session that calls it), the legacy file is removed.

**Schema bumped to version 2** because the wrapper format around `proposals` is now load-time, not on-disk. Tests updated: `PersistedCorrelationData.version === 2` now; corrupt legacy files yield empty-success rather than err-Corrupt (we still warn-log); `maxProposals` truncation tested against the load path.

23 tests pass including a new concurrent-writer test that exercises the race the JSONL switch is for: 10 parallel `saveCorrelationData([…])` calls and verifies all 10 land. Pre-fix this test would frequently lose proposals to the rename-clobber.

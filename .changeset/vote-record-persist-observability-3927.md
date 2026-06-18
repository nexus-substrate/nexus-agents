---
'nexus-agents': patch
---

fix(governance): surface + override vote-record persistence skip so authentic votes aren't silently lost (#3927)

When the MCP server runs with a `process.cwd()` outside the repo, `resolveVoteRecordsPath()` returned `undefined` and `persistVoteRecord()` skipped the write at DEBUG level — real consensus votes were lost with no visible signal. The skip is now an actionable WARN, and a `NEXUS_VOTE_RECORDS_PATH` env var lets you force the write to an explicit absolute path. Precedence: `opts.filePath` > `NEXUS_VOTE_RECORDS_PATH` > `findRepoRoot(process.cwd())`. Caller-commits (the proposer commits the returned record bytes into `governance/vote-records.jsonl` in the promotion PR) remains the authoritative population path per the 7-0 design vote; this is observability + an escape hatch, not enforcement.

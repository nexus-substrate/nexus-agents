---
'nexus-agents': minor
---

feat(governance): route runtime vote-records store through `nexusDataPath` (#3991)

The runtime authentic-vote-record store now resolves its ledger path through the
canonical `nexusDataPath` resolver under a per-repo `governance/` category,
consistent with the other 10+ runtime stores. Precedence is now:
`NEXUS_VOTE_RECORDS_PATH` override (absolute as-is; relative resolved against cwd,
with fail-closed path-traversal validation) → `nexusDataPath('governance',
'vote-records.jsonl')`, which yields `<sandbox-root>/.nexus-agents/governance/`
(sandbox), `<repo>/.nexus-agents/governance/` (repo-preferred, gitignored), or
`~/.nexus-agents/governance/vote-records.jsonl` (default / global install).

This removes the old `findRepoRoot(cwd)/governance/...` default that caused a
silent persist-skip on global installs (cwd not a repo) and tracked-file churn.
The runtime store now essentially always persists into `.nexus-agents`. The
committed `<repo>/governance/vote-records.jsonl` ledger the promotion gate reads
remains a separate caller-commits artifact, reachable only via the explicit
override. The persistence outcome `'no-repo-root'` reason is removed (obsolete);
a non-persist is now `'all-simulated'` or `'write-failed'` (unwritable data dir).

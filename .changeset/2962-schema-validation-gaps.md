---
'nexus-agents': patch
---

**fix(validation):** Zod-validate two external-payload boundaries. Partial fix for #2962 (3 of 4 sites — the 4th was already fixed in #2990).

- **#2962 site 1 — `mcp/tools/repo-analyze.ts:426`.** `JSON.parse(metaJson.trim()) as GhRepoMetadata` on `gh api repos/{repoId}` stdout. A GitHub-side schema drift produced a typed-but-mismatched object that either crashed deep in `analyzeRepo` or silently surfaced a wrong field (same shape as #2943). Added `GhRepoMetadataSchema` (Zod) and `safeParse`; failures throw with a payload preview instead of corrupting the downstream analysis.
- **#2962 site 3 — `cli/issue-command.ts:37`.** `JSON.parse(output) as { number; title; … }` on `gh issue view`. Any GitHub-schema drift threw `TypeError` inside the outer `catch` and surfaced as the misleading "issue not found." Split error handling: gh-exit failures still return `null`, but malformed JSON or schema mismatches now write a diagnostic line to stderr before returning `null` — operators can see the actual cause.
- **#2962 site 2 — `pipeline/pipeline-checkpoint.ts:157`** was fixed in #2990 (closes #2981, same schema-cast pattern). No further action needed.
- **#2962 site 4 — `scm/github-provider.ts:107` + 4 parallel sites** (P2, 5 casts feeding mappers that dereference `raw.labels.map`). **Deferred to a follow-up issue** because it spans 5 call sites with a shared schema set — bigger scope than this PR is taking.

98 tests pass across the 2 changed files (repo-analyze, issue-command); tsc + eslint clean.

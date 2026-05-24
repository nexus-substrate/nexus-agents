---
'nexus-agents': patch
---

**fix(scm):** Zod-validate `gh` CLI JSON at the boundary so schema drift surfaces as `schema mismatch` instead of misleading "Failed to parse JSON" (closes #2962 site 4).

`packages/nexus-agents/src/scm/github-provider.ts` had 5 parallel `JSON.parse(result.value) as Gh<X>Json` casts feeding mappers (`mapIssue`, `mapComment`, `mapPRStatus`) that dereferenced nested fields like `raw.labels.map((l) => l.name)` and `raw.author.login`. When `gh` CLI returned the JSON in an unexpected shape (rename, removed nullable, missing nested object), the deref blew up with a TypeError that the surrounding `try/catch` then rewrapped as `Failed to parse <X> JSON: …` — misleading: the JSON parsed fine; the shape mismatched. Operators debugging this chased a parser bug that didn't exist.

The fix:

- Added four `z.object(...)` schemas mirroring each `--json <fields>` projection: `GhIssueJsonSchema`, `GhCommentJsonSchema`, `GhPrJsonSchema`, `GhPrStatusJsonSchema`.
- Extracted a `safeParseGhJson<T>(rawJson, schema, label)` helper that does `JSON.parse` → `schema.safeParse` and distinguishes the two failure modes:
  - `<label>: Failed to parse JSON: …` (gh returned non-JSON — html error page, empty output)
  - `<label>: schema mismatch — <path>: <message>` (gh returned valid JSON in an unexpected shape, with Zod's path pointing at the broken field)
- Replaced all 5 raw casts in `getIssue`, `listIssues`, `createPR`, `getPRStatus`, `listComments`.

Same Zod-validate-at-the-boundary pattern as #2932 (policy-engine), #2943 (PaperEntry), and #2962 sites 1+3 (repo-analyze + issue-command, already shipped).

2 regression tests added: schema-drift surfaces the new typed error with the broken-field path; non-JSON output surfaces the parse-failure label distinctly. 15 tests pass (was 13).

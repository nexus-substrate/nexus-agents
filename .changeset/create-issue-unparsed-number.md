---
'nexus-agents': patch
---

`createIssue` no longer reports success for an issue it cannot identify. `gh
issue create` has no `--json`, so the number is scraped from the URL it prints;
the pattern was anchored to end-of-string and fell back to `number: 0` inside an
`ok(...)`, so a trailing gh notice line, a `?`/`#` suffix, or a build that writes
the URL to stderr produced a "created" issue whose identity was `0` — and
`task-tracker.createTask` fed that straight into `addComment(0)` and
`gh issue close 0`. The number is now matched anywhere in the output and an
unparseable result is an error. `ScmIssue` gains an optional `url`, which
`task-tracker` was already reading through a cast for a field that did not
exist, so `TrackedTask.url` was permanently `undefined` on the GitHub path.

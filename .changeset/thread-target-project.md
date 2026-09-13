---
'nexus-agents': minor
---

`consensus_vote` and `nexus-agents vote` now tell the voter panel which project it is judging, and disclose how that name was decided.

Until now every voter's system prompt named "the nexus-agents project" no matter who called: a consuming repository got a scope steward checking its proposal against this package's mission and a product manager checking "alignment with project goals in CLAUDE.md". The tool input gains an optional `project` (letters, digits and `._/@-`, at most 200 characters) and the CLI gains `--project <name>`. When it is given it replaces `nexus-agents` in every seat's prompt. When it is omitted the name is derived from the server's working directory — the `origin` remote of the enclosing git repository as `owner/repo`, else the nearest `package.json` `name` — and falls back to `nexus-agents`. Derivation is a file read of `.git/config` (linked worktrees are followed to the shared config); no `git` process is spawned, and any candidate from any source that fails the pattern is logged with its reason and the next source is tried.

The response always carries `project: { name, source }`, with `source` one of `input`, `derived` or `default`, so a caller that forgot the input sees `default` next to the verdict instead of a silent mis-scope. The CLI summary prints the same on one line (`Project: acme/widgets (derived)`) and the GitHub vote comment carries a `**Project:**` line.

For a foreign project the scope steward's reuse ladder now says "an existing `<project>` substrate primitive" and the governance references in the steward and PM prompts say "the target project's governance rules". The seven prompts rendered for `nexus-agents` itself are unchanged byte-for-byte and are pinned by a snapshot.

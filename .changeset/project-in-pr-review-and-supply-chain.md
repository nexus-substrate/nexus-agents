---
'nexus-agents': minor
---

`pr_review` and `supply_chain_tradeoff_panel` now tell their voter panels which project they are judging, the same way `consensus_vote` has since 8.52.0, and disclose how that name was decided.

Both tools still built every voter's system prompt for "the nexus-agents project": a consuming repository reviewing its own pull request through `pr_review` got a scope steward and a security reviewer judging the diff against this package's mission and governance files. Each tool input gains the same optional `project` field as `consensus_vote` (letters, digits and `._/@-`, at most 200 characters). When it is given it replaces `nexus-agents` in every seat's prompt; when it is omitted the name is derived from the server's working directory — the `origin` remote of the enclosing git repository as `owner/repo`, else the nearest `package.json` `name` — and falls back to `nexus-agents`. The resolution is the one `consensus_vote` uses: no `git` process is spawned, and a candidate from any source that fails the pattern is logged with its reason before the next source is tried.

Both responses always carry `project: { name, source }`, with `source` one of `input`, `derived` or `default`, so a caller that forgot the input sees `default` next to the verdict instead of a silent mis-scope. The prompts rendered for `nexus-agents` itself are unchanged.

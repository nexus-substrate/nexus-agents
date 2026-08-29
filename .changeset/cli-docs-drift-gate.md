---
'nexus-agents': patch
---

feat(ci): gate docs/ENTRYPOINTS.md against the CLI command catalog

`docs/ENTRYPOINTS.md` is named canonical for CLI entry points in CLAUDE.md and
had drifted: 20 commands documented against 52 registered, and two rows —
`review-demo` and `validation-dashboard` — naming implementation modules as if
they were commands a user could type. They are the internals behind `review` and
`validation`; the docs turned file names into command names, and the usage
examples told readers to run them.

`inject-governance.ts` already regenerates ENTRYPOINTS' MCP _tool_ tables from
source. The CLI _command_ table had no markers and no gate, so nothing compared
the two lists — the #5142 shape.

Adds `scripts/check-cli-docs-drift.ts`, a baseline-aware ratchet matching the
repo's three existing ones. A documented command absent from the catalog always
fails; a newly undocumented command fails; the 34 currently-undocumented
commands are recorded as visible debt rather than blocking the gate.

A check rather than a generator, because the table's subcommand and mode columns
are human-authored and no catalog field supplies them. The name set is what
drifts, and that is mechanically comparable.

# Pipeline notes

One file per PR. When a PR changes a DocOps pipeline file (the
`pipeline_files` list in `docs/ops/docops-manifest.json`), the DocOps Skill
Sync gate (`scripts/check-docops-skill.ts`) requires a Documentation
Management update in the same PR. Adding a `.md` file here satisfies it.

## Convention

- Name: `<PR-or-issue-number>-<slug>.md`, e.g. `6334-notes-directory.md`.
- Body: the same `PIPELINE NOTE:` prose the `<!-- PIPELINE NOTE: … -->`
  comments in `../SKILL.md` carry — which pipeline file changed, what changed,
  and the PR or issue number. Plain Markdown, no frontmatter.
- One file per PR, never appended to a shared file, so two concurrent
  pipeline PRs cannot conflict on merge (a hand-resolved conflict voids a
  governor ratification binding — #6334).
- Only `.md` files directly matter to the gate; a non-`.md` file here, or a
  file in a sibling directory, does not count. This README is itself a `.md`
  file under the directory and so counts as a note for the PR that added it.

Editing `../SKILL.md` still satisfies the gate; the note file is the preferred,
conflict-free route. The historical notes in SKILL.md stay there until they are
migrated one file per note.

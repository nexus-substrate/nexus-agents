PIPELINE NOTE: check-docops-skill.ts and docs-check.yml (docops-skill-sync job)
now accept a per-PR `.md` note file under
`skills/documentation-management/pipeline-notes/` as the required
Documentation Management update, in addition to an edit to SKILL.md. The
manifest gained `pipeline_notes_dir`. Motivation: every PIPELINE NOTE landed in
one shared region of SKILL.md, so concurrent pipeline PRs conflicted on merge
and a hand-resolved conflict voided the governor ratification binding (#6334).

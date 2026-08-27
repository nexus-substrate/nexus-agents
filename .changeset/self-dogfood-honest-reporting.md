---
'nexus-agents': patch
---

stop the Self-Dogfood Review workflow reporting reviews it never ran

CI-only; no shipped code changes. Recorded as a changeset because the workflow
is governance instrumentation and the fix is worth finding in the changelog.

The job reported "Review completed" on every pull request without ever running
one. `npx nexus-agents` could not resolve the built binary, `2>&1` redirected
that error into the file used as the success signal, and a non-empty file was
read as evidence of a review — so the one condition the check could not
distinguish was the only one that ever occurred.

It also never read the diff. `PR_DIFF` was fetched and discarded; the prompt
carried a list of up to 20 filenames, so the reviewer was asked to judge code
quality, security and test coverage from paths alone.

Now: credentials are detected up front and their absence reported as not
measured; the diff is the artifact, bounded with the reviewed portion stated in
the summary; the CLI is invoked through its built entry point; and the outcome
distinguishes reviewed from no-diff, cli-missing, cli-failed and
malformed-output. The default when no outcome is reported is NOT REVIEWED,
which is the reverse of what it was.

The triage job had the same defect in a purer form: `triage_complete=true` was
written unconditionally after `|| true`, so the flag the summary reads could
not hold any other value, and the command it guarded was a `--dry-run` that
prints a routing decision rather than triaging anything. Same treatment.

Both jobs also drop to read-only permissions. Neither writes a comment or a
label, and with model credentials present the old `pull-requests: write` /
`issues: write` grants would have put untrusted input, repository write access
and secrets in one job — the Rule of Two.

---
'nexus-agents': patch
---

fix(ci): four workflow gates reported a pass without measuring (#5302)

Each was verified by executing the shell construct, not by reading it. None of
these workflows sets `defaults.shell` or `-o pipefail`, so every `run:` block
executes under GitHub's default `bash -e {0}` with no pipefail.

**`ci.yml` — working-tree clean check.** `git status ... 2>/dev/null | awk |
grep || true`. The pipeline's status is grep's, and `|| true` erased even that,
so a `git status` failure (dubious ownership, permissions) produced an empty
`leaks` and the step printed "✓ Working tree clean after tests". Confirmed by
running the old form outside a git repo: exit 0, clean message, nothing
inspected. This job is on the required path via `ci-success.needs`. `git` is now
captured separately so its failure is a failure; the `|| true` stays on the grep
pipeline, where the discarded status is grep's "found nothing" rather than
git's "could not look".

**`docs-check.yml` — MCP tool-count drift, README leg.** `while read` over an
empty `$readme_counts` runs its body once with an empty `$n`, the `[ -n "$n" ]`
guard is false, and no check runs — while the step still prints "✅
MCP_TOOL_COUNT agrees everywhere". Verified: the old form ran **0** checks over
empty input and continued. Rewording the README from "47 MCP tools" to "47
tools" would have silently retired the leg. Absence of the count is now
reported as drift.

**`docs-check.yml` — spell check.** `pnpm spell | tee` takes tee's status, so a
cspell crash yielded a file with no "Unknown word" and the step printed "✅ No
spelling issues found" for a check that never ran. The job is advisory, so this
was a false log line rather than a merge bypass; it now distinguishes "no
findings" from "the tool failed".

**`docs-check.yml` — `[skip-docs]` rate limit, removed.** It claimed "2 per
author per 7 days" and could never fire: it read `docs/.audit/escape-hatch.log`,
but that directory holds only `.gitkeep` and `*.log` is gitignored, so the file
is absent from every checkout. The append below it wrote to the runner
workspace, discarded at job end, so no run could observe another's usage — and
`tail -14 | wc -l` counted lines, not days. Removed rather than left standing: a
limit that is advertised and unenforced invites reliance on a control that does
not exist. The `::warning::` recording each use, attributed to its author,
remains.

The fifth item in #5302 — the semgrep SARIF upload — is **not** a defect. It is
a plain redirect, so a crashed scanner does redden the step, and upload-only to
code scanning is the documented advisory pattern under #4802.

---
'nexus-agents': patch
---

The docs-check remediation hints are reachable again ([#4582](https://github.com/nexus-substrate/nexus-agents/issues/4582)).

GitHub Actions runs `run:` blocks under `bash --noprofile --norc -e -o pipefail`. With `-e`, a non-zero exit aborts the step at the failing command, so an `if [ $? -eq 0 ]` on the next line never executes. Eleven steps in `.github/workflows/docs-check.yml` were written that way — every one in this repo, none in any other workflow.

Nine used `-eq 0`, which made the `else` branch dead: the `::error::` annotation and the "run this to fix it" line. Two — the skills-index and agents-index freshness gates — used `-ne 0`, where the unreachable branch was the entire error handler, so those steps failed with no annotation at all.

**No gate was passing when it should have failed.** `-e` aborted with the script's own status every time, so the step still went red. What was lost is the part that tells you what to do about it: a maintainer got a failed job and a bare non-zero exit. This is an observability fix, and the distinction matters — nothing here was made to pass that was previously failing.

Each site now tests the command directly, so `-e` is suppressed for the tested command only and both branches run:

```bash
if npx tsx scripts/generate-repo-index.ts --check; then
  echo "✅ …"
else
  echo "::error::…"
  exit 1
fi
```

The adjacent "Verify injection idempotency" step already used this form (`if git diff --exit-code CLAUDE.md`), so the correct idiom was in the file the whole time.

Adjudicated per-site rather than swept: no site was a pipeline, so `pipefail` changes nothing here, and none was relying on abort-on-failure as its intended behavior. Every message is preserved verbatim. The canonical-index step is the one with a second command in its `else` — it runs `check-docs-indexed.ts --fix` to print the diff before exiting; whether that helper succeeds or fails, the step still exits non-zero, so it was left as written.

Verified by extracting each converted `run:` block from the parsed YAML and executing it under `bash -e -o pipefail` against a stub exiting 0 and then 1. All 11 print the success line and exit 0 on the first, and print `::error::` **and** exit non-zero on the second — the assertion that matters, since a block that logged an error and fell through would convert a working gate into a silent pass. The same harness run against the original blocks reproduces the bug (exit 1, no annotation), which is what makes the passing result mean something. `shellcheck` is clean on all 11. `actionlint` is not installed here and was not run.

`.github/workflows/` is a CODEOWNERS path: owner ratification required, no auto-merge.

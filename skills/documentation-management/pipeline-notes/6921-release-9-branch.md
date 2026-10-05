PIPELINE NOTE (#6921, refs #6291): `.github/workflows/docs-check.yml` now
runs `pull_request` checks for PRs into `release/9.0` as well as `main`. Its
three diff steps (changed source, changed docs, new module index files)
compare against `origin/${GITHUB_BASE_REF:-main}` instead of `origin/main`,
so a PR into `release/9.0` is judged on its own changes, not on every earlier
9.0 change.

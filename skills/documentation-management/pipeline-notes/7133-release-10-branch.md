PIPELINE NOTE (#7133): `.github/workflows/docs-check.yml` now runs
`pull_request` checks for PRs into `release/10.0` as well as `main`, replacing
the `release/9.0` entry added by #6921 (9.0 shipped). The diff steps still
compare against `origin/${GITHUB_BASE_REF:-main}`, so a PR into `release/10.0`
is judged on its own changes. No DocOps step changes behaviour.

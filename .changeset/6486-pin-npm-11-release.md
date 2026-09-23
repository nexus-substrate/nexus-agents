---
'nexus-agents': patch
---

Pin npm 11.x in release workflow publish jobs to prevent `EUNKNOWNCONFIG` errors from `--no-git-checks` under npm 12 (#6486). Changesets passes `--no-git-checks` through `pnpm publish` to npm, which npm 11 accepts with a warning while npm 12 errors out.

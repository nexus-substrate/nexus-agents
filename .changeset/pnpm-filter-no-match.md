---
'nexus-agents': patch
---

fix(ci): fail when a pnpm filter matches no package

`pnpm --filter <name> …` exits 0 when the filter matches nothing — verified:
`pnpm --filter nonexistent exec node -e 1` returns 0, and with
`--fail-if-no-match` returns 1. So `set -euo pipefail` in `verify-refresh.sh`
could not catch a silently-skipped suite: renaming the package, or moving it
outside the workspace globs, would print "verify-refresh: all gates passed"
having run zero tests. That is the #4340 shape the comment above that line says
the gate exists to prevent.

`--fail-if-no-match` added to the eight unguarded `pnpm --filter` invocations
across `verify-refresh.sh` and five workflows, so a build or test step that
matches nothing is a red job rather than a quiet no-op.

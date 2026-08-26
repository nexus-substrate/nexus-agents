---
'nexus-agents': minor
---

fix(cli): the demo no longer lists an uninstalled CLI as available

`getCliAvailability` wrote `available: true` unconditionally and read failure
only from a `catch`. `healthCheck` does not throw — `BaseCliAdapter` catches and
returns `{ healthy: false, version: 'unknown', versionStatus: 'unsupported' }`,
and `ModelToCliAdapter.healthCheck` has no throw path at all. So a CLI whose
binary is absent (`spawn ENOENT`) showed as installed-but-unauthenticated, and
the demo told the user to run `auth login` for something they do not have.

`HealthStatus` gains an optional `reachable`. `BaseCliAdapter` sets it `true`
when the binary answered `--version` — whatever it said — and `false` when it
could not be run; `ModelToCliAdapter` sets `true`, since an in-process API
adapter has no binary to be missing. Absent means the producer predates the
distinction, and consumers treat `reachable !== false` as present, so adding
the field cannot silently reclassify an older adapter as uninstalled.

This is what separates two states that were previously identical: a binary that
is missing and one that is installed on an unsupported version are both
`healthy: false` with `versionStatus: 'unsupported'`.

Closes #5060.

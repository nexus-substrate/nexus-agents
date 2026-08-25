---
'nexus-agents': patch
---

make `vote --timeout` take effect, and document its real default

The same handler that dropped `--option` also dropped `timeoutMs`, so every
vote used the 300s default however the operator set it — the "timeout: 300s
each" line reported the default rather than the request.

The help was separately wrong: it advertised `default: 90` when
`VOTE_TIMEOUTS.defaultMs` has been 300 since it was raised from 180, on the
observation that architecture and security voters average 315s. An operator
reading 90 would conclude a 250s vote had hung. A test now ties the documented
value to the constant so they cannot drift again.

The mapping from parsed args to `VoteCommandOptions` is extracted into one
function. Every field on that type is optional, so the compiler cannot notice a
missing one — enumerating them inline is what let two flags disappear.

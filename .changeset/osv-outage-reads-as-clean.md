---
'nexus-agents': patch
---

fix(security): stop an OSV outage reading as a clean dependency scan

`runOsvCheck` flat-mapped only `vulnerabilities` off each lookup and discarded
the `error` field. `queryOsv` returns `{ vulnerabilities: [], error }` on a
non-200 or a timeout, so an unreachable OSV API produced an empty array —
byte-identical to a clean scan — and `buildScanSummary` appended "none
blocking". The OSV half of the gate could not fail when the network was down.

The summary now says how many lookups failed instead, and states the
denominator the OSV verdict covers: the query is capped at 20 dependencies and
`devDependencies` are never queried, neither of which was disclosed.

This is the claim `run_quality_gate`'s own description makes — "a run in which
nothing executed reports verdict 'skip', never 'pass': no evidence is not a
pass" — applied to the dimension that was not honouring it.

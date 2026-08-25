---
'nexus-agents': patch
---

report securityRan on every dev-pipeline return, not just dry runs

#4774 added `securityRan` so a caller could tell a failed security review from
one that never executed, but only assigned it in `buildDryRunResult`. On the
paths that actually ship code — harness mode, a red quality gate in `blocking`
mode, and the normal post-scan return — the field was absent, so a real security
rejection stayed byte-identical to a run where the gate never ran.

Sets it on all three: `false` where the run stops before the scan, `true` after
the scan executes. Fixes #4782.

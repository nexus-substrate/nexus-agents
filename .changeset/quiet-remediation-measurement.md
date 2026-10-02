---
'nexus-agents': patch
---

Report the remediation-review readiness harmful rate as `unmeasured (0 judged)` when no selections have been judged, with `harmfulRate: null` in JSON output. Readiness continues to fail the soundness criterion until judged evidence is present; measured rates are unchanged.

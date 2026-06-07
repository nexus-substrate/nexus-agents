---
'nexus-agents': patch
---

safety(capability-loop): fail-closed security classification for auto-remediation (#3615)

Condition 4 of the #3540 auto-invoke gate. The hard exclusion "security signals
are always human-gated" only holds if classification is correct — a security
issue mislabeled by a detector (e.g. as `bug` or `routing`) would silently bypass
the gate. `evaluateRemediationShadow` now treats a signal as security if EITHER
its declared category is `security` OR any keyword from the canonical
`SECURITY_KEYWORDS` appears in its key/title/body (uncertain → security →
human-gated). Exposed as `isSecuritySignal` for the future enforce path (#3618)
to reuse, so shadow and enforce decide identically.

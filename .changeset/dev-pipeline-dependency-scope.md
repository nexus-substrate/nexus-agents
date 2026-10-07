---
'nexus-agents': minor
---

The dependency check now covers the working-directory package manifest plus every package manifest the pipeline captures as changed. Changed manifests that cannot be read or parsed block completion with a recorded reason, and so does a changed manifest whose dependency lookup fails, since its dependencies were never checked. When dependency coverage is partial, a passing run now reports that in `securityNote` instead of recording it as full coverage.

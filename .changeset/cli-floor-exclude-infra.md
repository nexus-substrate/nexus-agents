---
'nexus-agents': patch
---

fix(governance): CLI performance-floor signal measures model quality, not infra (#3620)

`detectCliPerformanceFloor` divided successes by ALL outcomes, so infrastructure
failures (adapter_unavailable, parse/empty-response, auth, rate-limit, timeout,
connection) were counted as model-quality failures — producing a misleading
"claude security_review 4%" critical routing signal when the genuine quality rate
was 67% (above the floor). It now excludes infra/transport failure categories
from the quality rate; those still surface separately via
detectFailureCategoryConcentration (so real adapter outages aren't hidden, just
not mislabeled as a CLI quality regression). Found via capability-loop
dogfooding (#3540); the residual empty-response root cause is tracked in #3625
(+ attribution gap #3624).

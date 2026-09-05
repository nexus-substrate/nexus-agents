---
'nexus-agents': patch
---

Remove the delegate pipeline's route-stage policy evaluation because the built-in policy can only deny execute stages, while retaining enforcement at the execute-stage seams.

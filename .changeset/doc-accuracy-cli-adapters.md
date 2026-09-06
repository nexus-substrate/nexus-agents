---
'nexus-agents': patch
---

Five doc comments that contradicted the code they document are corrected. `modelTimeoutMs` documented a 30s default against an actual 120s; `enableCapacityBalancing` read as if it excluded exhausted candidates when removal additionally requires a second flag that defaults to false; `getFallbackChain('code')` and `classifyTask` both carried examples whose stated results the functions do not produce. No behaviour changes.

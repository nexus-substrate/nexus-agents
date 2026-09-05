---
'nexus-agents': patch
---

`NEXUS_AUTH_METHOD` is removed from the env schema and docs: it never reached enforcement (only the startup log line read it), so `validateNexusEnv` now reports it as unknown; set `security.auth.method` in the config file instead (#5665, panel 3/3).

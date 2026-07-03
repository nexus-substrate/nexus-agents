---
'nexus-agents': patch
---

Remove three never-wired env-var declarations from the env-schema (#4180, same silent-no-op class as #2977): `NEXUS_TEST_TIMEOUT_MS` had no production reader, and `NEXUS_TIMEOUT_CLISIMPLE` / `NEXUS_TIMEOUT_CLICOMPLEX` fed only `getTimeout('cliSimpleMs'/'cliComplexMs')`, which has zero production call sites — per-complexity CLI timeouts flow through `TIMEOUT_PROFILES` / `getTimeoutForCli`. The equally unread `DEFAULTS.TIMEOUT_DEFAULTS.cliSimpleMs` / `cliComplexMs` keys are removed with them (internal surface only; not exported from the package entry point). Setting the removed vars now produces an unknown-variable warning from `validateNexusEnv` instead of silently doing nothing.

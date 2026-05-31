---
'nexus-agents': patch
---

fix(security): warn on coercion of invalid security-mode env vars (#3130)

`NEXUS_ACCESS_POLICY_MODE` (ClawGuard) and `NEXUS_REPUTATION_GATING` (reputation gating) previously **silently** coerced an invalid/typo'd value (e.g. `enfroce`) to their default, so a misconfigured `enforce` degraded to a less-strict mode with no signal. Both now route through a shared `resolveEnvMode` helper that emits a one-line `warn` on coercion of a non-empty invalid value (unset/empty stays silent — absence is normal), while keeping the never-throw, never-fatal coercion a security layer requires. Extracting the shared helper also guarantees the two flags coerce identically.

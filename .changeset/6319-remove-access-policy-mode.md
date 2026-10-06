---
'nexus-agents': major
---

Remove `NEXUS_ACCESS_POLICY_MODE` in 10.0 ([#6319](https://github.com/nexus-substrate/nexus-agents/issues/6319)). It has had no effect since its only reader was deleted. Unset it; no replacement is needed. `validateNexusEnv` now reports the removed name in `unknownVars`, and startup validation warns that it is unknown, regardless of its value.

```diff
-export NEXUS_ACCESS_POLICY_MODE="audit"
+unset NEXUS_ACCESS_POLICY_MODE
```

Remove the unused `deprecatedVars` field from `EnvValidationResult` and the `DeprecatedVar` type from the config exports. Consumers should use the remaining `unknownVars`, `invalidVars` and `ineffectiveVars` fields; no deprecated-variable producer remains.

---
'nexus-agents': patch
---

One accept-set for six more `NEXUS_*` boolean flags (#5464, wave 2 of #5155).
`NEXUS_ROUTE_MODEL_SHADOW`, `NEXUS_META_SHADOW_TRAIN`, `NEXUS_LLM_CLASSIFICATION`,
`NEXUS_REPO_PREFERRED`, `NEXUS_ROUTE_MODEL_SELECTION` and `NEXUS_PERSIST_LEARNING`
now read through `parseBoolEnv`, so each accepts `true`/`1`/`false`/`0`
case-insensitively instead of the single literal its author happened to pick.

Two spellings change meaning, both of which the schema previously reported as
invalid at startup: `NEXUS_REPO_PREFERRED=false` now opts out of the per-repo
data dir (it used to be rejected, then route per-repo anyway), and
`NEXUS_PERSIST_LEARNING=0` now disables learning persistence (it used to be
rejected, then persist anyway). No previously-valid value changes behaviour.

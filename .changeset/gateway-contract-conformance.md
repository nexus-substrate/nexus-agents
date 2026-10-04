---
'nexus-agents': minor
---

Add optional adapter contract members for auth status, opt-in bounded live readiness, and model-support queries. Live readiness is capped by the interactive operation-class guard and single-flight per adapter. Enforce these members across in-tree CLI and API adapters with one conformance suite; preserve explicit unknown and unmeasured outcomes.

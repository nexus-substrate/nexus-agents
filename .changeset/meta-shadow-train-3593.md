---
'nexus-agents': patch
---

feat(orchestration): feed live dispatch outcomes into the MetaOrchestrator shadow selector so it learns (#3593)

The `run` entry point now (behind `NEXUS_META_SHADOW_TRAIN=1`, default off) feeds each MetaDispatcher outcome — success or failure — into the process-scoped shadow selector and persists a sanitized, versioned record to `learning/meta-outcomes.jsonl`. The selector hydrates from that file on construction (30-day lookback, corrupt-line tolerant), so shadow agreement reflects accumulated learning instead of a cold start. The persisted line contains only numeric bandit-feature values plus strategy + success — never task text/prompts/paths. The dispatcher gains an optional `onOutcome(record, decision)` observer and stays selector-agnostic; the selector exposes `stats()` (per-arm pulls + reward mean) for bandit-movement telemetry. Training stays strictly shadow — it never alters what runs and never feeds the enforce path.

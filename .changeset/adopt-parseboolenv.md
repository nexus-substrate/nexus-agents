---
'nexus-agents': patch
---

refactor(config): adopt canonical parseBoolEnv in 4 duplicate bool-env parsers (#3297)

Four sites reimplemented `process.env[K] === '1' || === 'true'` inline (research
scaffold, two hook-utils flags, custom-API allow-private). They now call the
existing canonical `parseBoolEnv(key, false)`. Behavior-preserving except env
flags become case-insensitive (a desirable normalization — `TRUE` now parses as
true). The `'true'`-only and `'on'`-accepting sites are left as-is (different
semantics); portable-mode keeps its explicit tri-state.

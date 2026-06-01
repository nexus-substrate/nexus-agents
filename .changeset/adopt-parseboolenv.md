---
'nexus-agents': patch
---

refactor(config): adopt canonical parseBoolEnv in 3 duplicate bool-env parsers (#3297)

Three benign flag sites reimplemented `process.env[K] === '1' || === 'true'` inline
(research scaffold, two hook-utils flags). They now call the existing canonical
`parseBoolEnv(key, false)`, which also makes them case-insensitive (a desirable
normalization). Deliberately EXCLUDES the SSRF-guard-bypass flag
(`NEXUS_CUSTOM_API_ALLOW_PRIVATE`), which stays strict/case-sensitive so extra
case variants can't loosen the security control.

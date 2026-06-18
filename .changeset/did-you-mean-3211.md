---
'nexus-agents': patch
---

feat(cli): suggest closest command on unknown subcommand (#3211)

An unrecognized top-level subcommand (e.g. `nexus-agents reviw`) previously
fell through silently to the MCP stdio server. It now prints
`Unknown command 'reviw'. Did you mean: review?` plus the usage hint and exits
INVALID_ARGS. Suggestions are typo-tolerant via Levenshtein distance (capped at
distance 2 and ~40% of the input length), ranked nearest-first, up to 3. When
nothing is close, only the usage hint is shown — behavior is otherwise
unchanged. The shared Levenshtein helper is extracted to `string-distance.ts`
and reused by the env-var typo detector.

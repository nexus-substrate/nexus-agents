---
'nexus-agents': minor
---

Remove twelve `NEXUS_*` variables that were registered, documented, and reported
by `config get` as `Source: (env)` while nothing that runs read them: the four
`NEXUS_RETRY_*`, the six `NEXUS_RATE_LIMIT_*`, and the two
`NEXUS_CIRCUIT_BREAKER_*`. The MCP rate limiter takes `enabled` from the config
file, `adapters/retry.ts` builds its defaults from the static `DEFAULTS`, and
the production circuit breakers carry their own config. Same treatment as the
worker knobs in #2977 and the per-complexity CLI timeouts in #4180. An operator
still setting one now gets the existing unrecognized-variable report with a typo
suggestion, instead of a CLI claiming the value took effect.

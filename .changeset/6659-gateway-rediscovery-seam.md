---
'nexus-agents': patch
---

Three gateway fixes.

**A gateway that was down at startup is now found by any call, not only by a vote.** Before, lazy re-discovery ran only from `consensus_vote` and the PR-review panel, so on a gateway-only host `orchestrate`, `execute_expert` and `create_expert` stayed off the gateway until a vote happened to run. Now every adapter the registry hands out triggers re-discovery before its call, and so does the adapter-availability check. The limits are unchanged: at most one attempt per 60 s, concurrent callers share one attempt, and the discovery request's own timeout bounds how long a call waits. Once the gateway is found, the default adapter and the claude, codex and gemini slot adapters switch to it on their next call, even if they had already chosen a path before. The routing arm set that `run_dev_pipeline`'s expert stage uses is built once per process and is not rebuilt yet (#6667).

**A private-address refusal is no longer retried.** If re-discovery is refused by the private-address guard, the log now gives the same `NEXUS_CUSTOM_API_ALLOW_PRIVATE=1` remedy as at startup, and re-discovery stops. Allowing the host is an env change, which needs a restart.

**`NO_PROXY` now matches IP addresses and CIDR ranges.** Entries like `10.0.0.0/8`, `10.1.2.3`, `fd00::1`, `[fd00::1]` and `fd00::/8` now exempt a gateway addressed by IP. Before, `NO_PROXY=10.0.0.0/8` still sent `https://10.1.2.3/v1` through the proxy. An IP host is never matched as a domain suffix, so `2.3` no longer exempts `10.1.2.3`, and a host name is not resolved to match an IP entry. `*`, exact hosts, domain suffixes (with or without a leading `.` or `*.`) and an optional `:port` work as before.

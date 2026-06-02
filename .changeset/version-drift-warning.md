---
"nexus-agents": minor
---

feat(server): warn at startup when running a stale version (#3283)

A long-lived MCP server can drift many versions behind the published package and
silently serve old code (47 stale `--mode=server` processes pinned at v2.76.0
were found in the wild — which is what let an already-fixed `consensus_vote` bug
reappear). The server now does a best-effort check at startup and logs a
prominent WARN if the running build is behind the latest published version, with
the fix command. Fail-soft and non-blocking: any network/timeout/parse failure
is swallowed, it never gates startup, and it auto-skips dev builds + CI. One
outbound npm-registry call; opt out with `NEXUS_VERSION_CHECK=0`.

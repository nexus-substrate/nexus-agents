---
'nexus-agents': patch
---

cli-adapters: `HealthStatus` now says when the probe behind `reachable` actually ran (#5864)

`reachable: true` is documented as "the binary answered `--version`", and `HealthStatus.reachable` as "whether the underlying CLI could be reached at all". `BaseCliAdapter.getVersion` caches the version string with no TTL, no reset, and no clear on `dispose()`, so every health check after the first for a given adapter instance returns without spawning anything — and `lastChecked` is stamped `now`, dating a replay as if it were a fresh probe.

`versionProbedAt` (optional, following the same "absent means unknown" convention `reachable` itself uses) records when the version currently reported was read off the binary. Equal to `lastChecked` means this check ran the binary; earlier means `reachable` rests on a cached reading.

No behaviour changes: the probe still runs when the cache is cold, and the cache still never expires. What changes is that the record can now say which of the two it is.

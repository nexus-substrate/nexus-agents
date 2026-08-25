---
'nexus-agents': patch
---

remove two configuration fields nothing reads

`RouterConfig.minCapacityThreshold` was declared on the interface and in
`RouterConfigSchema` with a `0.1` default, and had exactly two occurrences
repo-wide — both of them those declarations. No reader, no test, no consumer.
`RouterConfigSchema` is not strict, so a YAML that still sets the key is
ignored rather than rejected.

`BaseAdapter.lastHealthCheck` was assigned after every health check and never
read by the base class or any subclass. `checkHealth` already returns the
status it was caching.

Public API surface is unchanged by both, confirming neither was reachable from
outside the package. Found in a vestigial-code sweep (#4939).

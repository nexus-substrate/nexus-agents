---
'nexus-agents': major
---

Remove the unenforced `maxDecisionTimeMs` option from router configuration and `routing.linucb` YAML configuration. Remove this key from your configuration; it never bounded routing decisions. Use the capacity stage's `probeTimeoutMs` to bound capacity probes, and use `decisionTimeMs` to observe routing latency. LinUCB exploration remains configurable through `linucbAlpha` or `routing.linucb.alpha`.

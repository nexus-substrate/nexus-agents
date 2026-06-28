---
'nexus-agents': minor
---

Add per-role voter model overrides (#4055). Voters round-robin across the gateway's
discovered models (#4040), so a role can land on a model that fails on a particular
gateway (e.g. a bodyless HTTP 400 for specific model ids, #4049) with no way to pin
a known-good model. Operators can now route a role to a gateway-accepted model:

```
NEXUS_VOTER_MODEL_<ROLE>=<bare gateway model id>
# e.g. NEXUS_VOTER_MODEL_ARCHITECT=claude_4_5_opus
```

In the gateway round-robin (`resolveDiverseAdapters`), a role with a valid override
is pinned to that model and the remaining roles round-robin as before. The override
is validated against the discovered gateway catalog: an id that is not a live
gateway model warns and falls back to round-robin for that role (no hard failure).
Roles without an override are unchanged. This is the operator escape hatch for the
per-model gateway-rejection situation, independent of the underlying gateway fix
(#4049).

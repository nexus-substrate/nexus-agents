---
'nexus-agents': minor
---

`getGlobalRegistry(config)` throws `RegistryAlreadyInitializedError` (a `ConfigError`, exported from the adapters barrel) when a non-empty config arrives after the singleton exists. It used to log a warning and return the existing registry, so a caller that passed a conflicting `logger` or `defaultCliTimeoutMs` silently got a registry built from someone else's settings. `getGlobalRegistry()` with no config, or with `{}`, still returns the existing instance; `resetGlobalRegistry()` first if reconfiguration is intentional, and `claimGlobalRegistry(logger)` remains the idempotent way to name the logger. Nothing in the package passes a config after initialisation; only out-of-tree callers that did are affected (#5211).

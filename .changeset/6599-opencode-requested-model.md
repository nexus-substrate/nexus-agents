---
'nexus-agents': minor
---

The model a caller asks for now reaches opencode. It used to be dropped, so every opencode call ran opencode's default model and was costed at that model's price (#6599).

- `CompletionRequest` has a new optional `model` field. The CLI model bridge forwards it to the CLI task. A registry model that belongs only to a different CLI (for example after a failover) is not forwarded; that CLI runs its default and logs a warning.
- `UnifiedAdapterRegistry.getAdapterForModel` binds an exactly matched registry id to the requests it serves, so `create_expert`/`execute_expert` with a model preference run that model instead of the CLI default. A prefix match still routes to the CLI only.
- The opencode adapter resolves a requested model against `opencode models`. It accepts an exact opencode id, a registry id or alias (through its opencode `cliModelName`), and a bare `provider/model` that opencode lists as `openrouter/provider/model`. **Behaviour change:** if a requested model can't be resolved, or is in rate-limit cooldown, the call now returns a non-retryable `EXECUTION_ERROR` instead of quietly running opencode's default. If no model is requested, nothing changes.
- The claude adapter now accepts a canonical registry id (`claude-opus`) as well as the alias, cliModelName and legacy names. Before, a model-bound request passed that id straight through as `--model claude-opus`, which the CLI rejects.
- If a CLI doesn't report its own model, a CLI response now reports the canonical id of the model it was sent, not the adapter default.
- An unresolvable requested model is caller input, not a sign the CLI is unhealthy. It reaches callers as a `ModelError` with `ErrorCode.INVALID_INPUT`, and the resilient adapter's circuit breaker does not count it.
- An opencode response now reports the model that ran: the canonical registry id when one exists, otherwise the opencode id. Cost is priced from that model. A model the registry has no price for is reported as unpriced, not at the default's price.

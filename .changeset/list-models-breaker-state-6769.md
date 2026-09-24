---
'nexus-agents': minor
---

`list_available_models` now reports whether the router is refusing a CLI. Each CLI transport (`claude`, `codex`, `gemini`, `opencode`) carries `breakerOpen`, read from the shared circuit breaker that the router and the unified adapter registry consult. The response adds `breakerOpenTransports`, which lists the transports whose breaker is open and is empty when none is. A transport can probe fine and still be refused while its breaker is open, and the report used to call it healthy.

`breakerOpen` is absent on transports no CLI breaker tracks (`openrouter`, `gateway`). Absent means "not tracked", not "closed". Existing fields keep their meaning: `ok`, `servesModels`, `healthyTransports` and `reachableTransports` still describe the probe alone.

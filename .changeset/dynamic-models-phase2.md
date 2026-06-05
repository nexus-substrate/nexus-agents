---
'nexus-agents': patch
---

Logical→live model-id resolution — Phase 2 (#3407, epic #3403). When a configured model id has gone stale because the provider renamed it (the exact case: OpenRouter `qwen/qwen3-coder-480b-a35b:free` → `qwen/qwen3-coder:free`), the opencode adapter now resolves it to the closest id the transport actually offers — so a rename is zero-touch instead of needing a registry edit. The new `resolveLiveModelId(configured, available)` is a pure, deterministic, conservative resolver: exact match always wins; otherwise it substitutes only within the same provider namespace and only when the shared prefix is substantial (≥60%), preferring a matching `:free`/paid tier; anything else returns unchanged. Wired into the opencode adapter's `--model` resolution (where it already probes `opencode models`), opt-in via `NEXUS_DYNAMIC_MODELS` and fail-open — when discovery is off or the catalog is cold, behavior is byte-for-byte unchanged.

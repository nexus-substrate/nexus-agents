---
'nexus-agents': minor
---

With a discovered OpenAI-compatible gateway (`NEXUS_OPENAI_COMPAT_URL`/`_KEY`), the `claude`, `codex` and `gemini` slots are now served by a gateway model of their own family when their CLI is not installed: `claude` by an Anthropic model, `codex` by an OpenAI model, `gemini` by a Google model. Before, such a slot fell back to the single `NEXUS_CUSTOM_MODEL` (default `gpt-5.5`), so a "claude" task could run GPT, and a gateway that did not serve that id failed every call.

- **Which model.** Within a family, models the registry has quality scores for come first, highest `reasoning + codeGeneration` first; the rest follow, newest version first. The chosen mapping is logged at startup.
- **New `NEXUS_GATEWAY_MODEL_ANTHROPIC` / `_OPENAI` / `_GOOGLE`** pin a family's model. The id must be in the discovered catalogue and not be classified as another family; otherwise a warning is logged once and the default order applies.
- **A family the gateway does not serve makes its slot unavailable.** It gets no router arm and a pinned request for it fails, as for a CLI disabled with `NEXUS_DISABLED_CLIS`. It is never given another family's model or `NEXUS_CUSTOM_MODEL`.
- **Attribution.** Outcomes keep the slot key (`claude`, `codex`, `gemini`), and the model that served the call is its `modelId`. A gateway-served voter seat is priced by the gateway's `NEXUS_GATEWAY_COST` declaration, and an undeclared gateway still records the call as unpriced, not as $0.
- **Where it applies.** It covers every registry-pinned slot (orchestrate workers, `execute_expert`, voter seats) and the router arms used by `run_dev_pipeline`'s expert stage. On the router path a slot is treated as installed when its executable is on `PATH`; login state is not checked there.
- **No gateway, no change.** Without a discovered gateway, adapter selection and the router arm set are unchanged, including the `NEXUS_CUSTOM_MODEL` fallback.

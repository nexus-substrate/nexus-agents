---
'nexus-agents': minor
---

With a discovered OpenAI-compatible gateway, the unpinned default adapter (`registry.getDefault()`, reached for unknown models, uncategorised tasks and unmapped roles, and the `api:custom-openai` router arm) now sends a model from the gateway catalogue instead of the unchecked `NEXUS_CUSTOM_MODEL` (default `gpt-5.5`). The default is the highest-tier top model across the Anthropic, OpenAI and Google families, so a flagship wins over a mid-tier model; a tier tie goes to Anthropic, then OpenAI, then Google, the order the direct-API fallback already uses. Models of no known family are considered only when the gateway serves none of the three.

`NEXUS_CUSTOM_MODEL` still names the default when the catalogue lists it. When it names a model the catalogue does not list, a warning is logged once and the model is never sent. The startup slot mapping log now includes the `default` model.

A pinned `opencode` slot whose binary is not installed is now unavailable in gateway mode instead of falling through to another CLI or to `NEXUS_CUSTOM_MODEL`. opencode is multi-vendor, not a model family, so no gateway model stands in for it.

With no gateway catalogue (no gateway, or discovery failed), both paths behave exactly as before.

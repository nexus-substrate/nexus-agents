---
'nexus-agents': minor
---

Harden OpenAI-compatible gateway discovery (`NEXUS_OPENAI_COMPAT_URL`/`_KEY`) for large, mixed catalogues.

- **Non-chat models are excluded.** Embedding, TTS, image, moderation, audio/whisper and rerank models no longer get an adapter or a voter seat, where they errored and could void an `absolute_quorum` panel. The listing's own metadata (`type`/`mode`, `capabilities.chat`, `architecture.output_modalities`) decides when present; otherwise the id does. The exclusion is logged at info with a count and a sample of ids.
- **Duplicate ids are removed**, so one listed model builds one adapter.
- **New `NEXUS_OPENAI_COMPAT_MODELS` allowlist.** Comma-separated model ids, with `*` as a wildcard (`anthropic/*,gemini-2.5-pro`). It is applied before the 256-model adapter cap, so a gateway listing more models than that now serves the allowlisted ones instead of failing discovery. An entry that matches no listed chat model is warned. Without an allowlist, a catalogue over the cap is still refused, and the error now names the variable. `nexus-agents init --opencode --validate` honours it too.
- **Listed ids are sent verbatim.** A gateway that lists `gpt-4o` is now asked for `gpt-4o`, not the dated `gpt-4o-2024-11-20` the direct OpenAI adapter's alias table substitutes, and `NEXUS_VOTER_MODEL_<ROLE>=gpt-4o` matches that adapter. `OpenAIAdapterConfig` gains an optional `verbatimModelId` flag for this; the direct OpenAI adapter's default is unchanged.
- **Model identity keeps versions.** `claude_4_5_opus` and `claude_4_1_opus`, and `gemini-2.5-pro` and `gemini-3-pro`, no longer share an identity key, and `vertex_ai/gemini-2.5-pro` gets a version. `claude-sonnet-4.5` and `claude-sonnet-4-5` now share one. The panel-diversity check (`countDistinctModels`) therefore stops reporting two model generations as one model. Registry lookup is unchanged: a census of 14,625 lookups over every registry entry, bare and under six gateway prefixes, resolved identically before and after.

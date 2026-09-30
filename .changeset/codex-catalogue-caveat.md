---
'nexus-agents': patch
---

`list_available_models` now labels the codex transport's model list as a vendor-catalogue superset. The codex row is the models.dev `openai` catalogue — dozens of OpenAI API ids — while the codex CLI serves only the few slugs marked `visibility: list` in its own models cache, so most listed ids are rejected by `codex -m`. The codex transport report carries a new optional `catalogueCaveat` string saying so, and the top-level `note` points at the field. Transports whose list is their own vocabulary (opencode, openrouter, claude, gemini) carry no caveat. The list itself is unchanged: routing only checks that an arm reports some model, which a superset cannot change. To see what the installed codex actually serves, run `nexus-agents verify`, whose codex models check reads that cache.

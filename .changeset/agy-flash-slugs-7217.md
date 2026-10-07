---
'nexus-agents': patch
---

Gemini Flash requests routed through the Antigravity (`agy`) CLI work again. agy 1.3.1 no longer serves any `gemini-3.5-flash-*` model and answers one with `status: ERROR` ("invalid model selection") while exiting 0, so every dispatch of the `gemini-3.5-flash` or `gemini-3-flash` registry models failed. They now run on Gemini 3.7 Flash at the same effort tier as before: `gemini-3.5-flash` → `gemini-3.7-flash-medium`, `gemini-3-flash` → `gemini-3.7-flash-low`. The 3.5 slugs are no longer accepted as pinned agy models, so a caller that pins one now falls back to the default agy model instead of failing.

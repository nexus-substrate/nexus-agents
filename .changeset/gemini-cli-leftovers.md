---
'nexus-agents': patch
---

Removed the unused `ResilientGeminiParser` and its helpers, which parsed output of the retired standalone `gemini` CLI. They were never part of the public API and no adapter used them; the gemini arm runs `agy` and parses its output with the agy parser.

`GeminiResponseParser` is now marked `@deprecated`. It parses the retired `gemini` CLI's output and nothing in nexus-agents uses it. It stays exported, together with its `GeminiCliResponse` type, so existing imports keep compiling.

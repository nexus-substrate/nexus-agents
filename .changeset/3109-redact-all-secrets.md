---
'nexus-agents': patch
---

**fix(security):** redact ALL secret matches in tool output, not just the first (#3109).

`sanitizeOutput` (secure-handler) used non-global `SECRET_PATTERNS` with a `pattern.test()`-then-`replace()` loop, so `String.replace` substituted only the **first** match per pattern. Tool output (or a thrown error's text) containing two or more secrets of the same shape — e.g. a rotated old+new API key, or two `Bearer` tokens in one stack trace — leaked every secret after the first to the MCP caller. Patterns are now global and the redaction replaces unconditionally (dropping the `test()` guard, which would advance a global regex's `lastIndex` and skip earlier matches). Found via a proactive security audit.

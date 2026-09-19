---
'nexus-agents': patch
---

Sanitize and redact credentials in code-PR push execution and out-of-band git auth. Transmit push credentials out-of-band via `GIT_CONFIG_VALUE_0` (`http.extraHeader`) rather than embedding tokens into command-line `argv` URLs, preventing exposure in process listings and `/proc`. Scrub tokens, base64 authorization headers, and URL userinfo from `git`, `gh`, and `executeCodePrPush` error messages and denial details.

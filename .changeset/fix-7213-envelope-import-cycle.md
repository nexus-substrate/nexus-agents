---
'nexus-agents': patch
---

Importing `cli-adapters/cli-error-envelope` directly, without going through the package index, no longer crashes with `ReferenceError: Cannot access 'GEMINI_CLI_COMMAND' before initialization`. The rate-limit detector now imports its error and time helpers from their own modules instead of the `core` barrel, which had pulled the router and `cli-binary-on-path` into an import cycle with the envelope. Loading through the published package entry point was never affected.

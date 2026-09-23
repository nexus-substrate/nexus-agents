---
'nexus-agents': patch
---

Unify MCP tool output and error envelope redaction on `sanitizeErrorDetails` (#6484).

- Extends `output-sanitizer.ts` secret patterns to cover Anthropic (`sk-ant-*`), OpenAI project keys (`sk-proj-*`), public keys (`pk-*`), AWS access key IDs (`AKIA*`), and plain-text credential assignments (`password=...`, `secret:...`).
- Sanitizes `result.structuredContent` and `result._meta` recursively in `secure-handler.ts` so structured outputs and nested error metadata cannot leak credentials.
- Sanitizes error messages in `toolErrorResponse` in `tool-error-handler.ts` before creating structured error envelopes.

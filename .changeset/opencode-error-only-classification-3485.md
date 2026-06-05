---
'nexus-agents': patch
---

fix(cli-adapters): classify OpenCode error-only streams instead of PARSE_ERROR (#3485)

An error-only OpenCode NDJSON stream (e.g. an upstream 401 → `{"type":"error",…}`
with no assistant content) was misclassified as `PARSE_ERROR`, masking the real
cause and dropping the remediation hint. The subprocess adapter now consumes the
parser's extracted error message via a new optional
`ICliResponseParser.extractErrorMessage`, classifying it through the shared
`classifyExtractedError` (rate-limit → auth → generic). An upstream 401 now
surfaces as `NOT_AUTHENTICATED: … → Re-authenticate: run \`opencode auth login\``
instead of "Failed to parse response". The optional parser method lets other CLI
adapters opt into the same handling for their error-only streams.

---
'nexus-agents': patch
---

Secret redaction in `sanitizeErrorDetails` (applied to MCP tool output and upstream error bodies) no longer breaks JSON. When the whole text is one JSON document, a redacted `password=`, `secret:`, `Authorization: Bearer|Basic` or `?token=`-style value now ends at the closing quote of its JSON string and never consumes an escape halfway, so the output still parses and neighbouring fields are kept. Semgrep finding ids of the form `semgrep:<rule>generic-secret:<file>:<line>` are no longer truncated. Every other `generic-secret:` value is still redacted, including one with whitespace after the colon or without a `file:line` location.

Plain-text redaction is unchanged: values keep their previous extent, including quotes inside the value and a value on the line after `password=` or `bearer`. The only exception is those exact semgrep finding ids. A known gap remains: AWS key-shaped JSON fields can still produce invalid JSON, because the shared credential-shape patterns were not changed here.

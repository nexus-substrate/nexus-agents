---
'nexus-agents': minor
---

**fix(security):** three MCP-surface hardening fixes from the 2026-05-24 wave-3 audit.

These are exploitable from untrusted MCP input that operators routinely route through nexus-agents (issue bodies, PR comments, third-party MCP servers wired into the gateway). Marked minor because the secret-redaction change to tool-error responses can clip legitimate strings that happen to match the secret patterns.

- **Path traversal — sibling-prefix bypass in 5 MCP tools.** `mcp/tools/dev-pipeline-tool.ts`, `pipeline-tool.ts`, `compare-data-feeds.ts`, `search-codebase-tool.ts`, `extract-symbols-tool.ts` all checked `resolved.startsWith(cwdRoot)` without a trailing separator. From cwd `/home/u/proj`, a caller passing `directory: "../projEVIL/secret.txt"` resolves to `/home/u/projEVIL/secret.txt`, which passes the bare `startsWith` check. Fixed to match the convention in `security/safe-path.ts` and `mcp/tools/query-trace-tool.ts`: `(resolved === cwdRoot || resolved.startsWith(cwdRoot + sep))`.
- **Secret leak in tool-error responses.** `mcp/middleware/secure-handler.ts:460-472`: success-branch `ToolResult` went through `sanitizeToolResult` (which redacts AWS keys, Bearer tokens, hex secrets, `password=`/`token=`/`api_key=` patterns), but the `catch (error)` branch returned the raw `error.message` to the MCP client. Adapter SDKs commonly echo offending credentials in their error messages (Anthropic's `AuthenticationError` carries `sk-ant-api03-…` substrings; fetch wrappers echo `Authorization` headers). The exception path now runs the same `sanitizeOutput`.
- **Supply-chain env leak in MCP gateway.** `mcp/gateway/upstream-client.ts` previously spread full `process.env` into spawned upstream subprocesses — every API key (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GITHUB_TOKEN`, `OPENROUTER_API_KEY`, etc.) leaked to whatever third-party MCP server the operator wired up, contradicting the schema comment "use `{env:VAR}` references, not plaintext secrets" (`schemas-gateway.ts:37`). Now passes only `UPSTREAM_BASELINE_KEYS` (`PATH`, `HOME`, `USER`, `LANG`, `LC_ALL`, `LC_CTYPE`, `TMPDIR`, `TZ`, `PWD`, `SHELL`, `TERM`) plus the operator's explicit `env` mappings.

144 tests pass across the 7 affected test files. Two remaining wave-3 findings (#2993 hardcoded `trustTier=1` + fail-open in orchestrate/execute-expert, #2994 V2 delegate strips `trustTier`) need multi-file changes and are filed for separate PRs.

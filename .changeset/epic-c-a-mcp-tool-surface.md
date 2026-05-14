---
'nexus-agents': minor
---

Epic C (cross-adapter rule precedence) + Epic A (MCP tool surface foundation).

**Epic C — cross-adapter rule loading**

- `docs/guides/RULE_PRECEDENCE.md` documents how Claude Code / Codex CLI / Gemini CLI / OpenCode each resolve rule files, with a `check:adapter-precedence-docs` CI gate ([#2655](https://github.com/williamzujkowski/nexus-agents/issues/2655)).
- Every `.rules/*.md` now carries `paths:` + `description:` YAML frontmatter so non-Claude harnesses can resolve rules deterministically, with a `check:rule-frontmatter` CI gate ([#2656](https://github.com/williamzujkowski/nexus-agents/issues/2656)).

**Epic A — MCP tool surface foundation** ([#2651](https://github.com/williamzujkowski/nexus-agents/issues/2651))

- All 38 registered MCP tools now declare the full set of MCP 2025-11-25 annotation hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) via a central source-of-truth map, with a `check:tool-annotations` CI gate ([#2648](https://github.com/williamzujkowski/nexus-agents/issues/2648)).
- All 38 tools + the shared error-producing middleware return a **structured error envelope** (`errorCategory` ∈ `transient | validation | permission | business | internal`, `isRetryable`, `message`, optional `detail`) instead of opaque strings. The envelope is carried in the result's `_meta` (never `structuredContent`, which MCP clients validate against `outputSchema` even on error results). `toolError(msg)` remains as a back-compat alias. New `check:mcp-error-envelope` CI gate ([#2649](https://github.com/williamzujkowski/nexus-agents/issues/2649)).
- A `check:tool-distinctness` CI gate computes pairwise TF-IDF similarity across the 38 tool descriptions and catches regressions in description distinctness (baseline-aware, mirrors the orphan-allowlist pattern) ([#2650](https://github.com/williamzujkowski/nexus-agents/issues/2650)).

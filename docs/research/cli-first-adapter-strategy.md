# Research: CLI-First Adapter Strategy

**Issue:** #691
**Status:** Canonical
**Date:** 2026-02-03
**Author:** nexus-agents research system

## Summary

Investigation into making installed CLI tools (Claude, Gemini, Codex) the default model adapter strategy, with raw API keys as fallback.

## Findings

### CLI Detection Methods

| CLI    | Binary   | Version Check      | Auth Check                  | Non-Interactive Flag |
| ------ | -------- | ------------------ | --------------------------- | -------------------- |
| Claude | `claude` | `claude --version` | `claude auth status`        | `-p` / `--print`     |
| Gemini | `gemini` | `gemini --version` | env check + minimal request | `-p` / `--prompt`    |
| Codex  | `codex`  | `codex --version`  | `codex login status`        | `codex exec`         |

### Output Format Compatibility

All three CLIs support structured JSON output:

| CLI    | JSON Flag              | Streaming Flag                | Token Usage      |
| ------ | ---------------------- | ----------------------------- | ---------------- |
| Claude | `--output-format json` | `--output-format stream-json` | In response JSON |
| Gemini | `--output-format json` | `--output-format stream-json` | In `stats` field |
| Codex  | `--json`               | `--json` (JSONL events)       | In turn events   |

### SDK Alternatives

| CLI    | SDK Package                          | Approach                                  |
| ------ | ------------------------------------ | ----------------------------------------- |
| Claude | `@anthropic-ai/claude-agent-sdk`     | Wraps CLI subprocess, rich TypeScript API |
| Gemini | `@ketd/gemini-cli-sdk` (third-party) | Wraps CLI subprocess                      |
| Codex  | `@openai/codex-sdk`                  | Wraps CLI binary, TypeScript API          |

### Special Capabilities

| Capability       | Claude       | Gemini             | Codex               |
| ---------------- | ------------ | ------------------ | ------------------- |
| Code execution   | Via tools    | Via tools          | Sandboxed execution |
| Image generation | No           | Via MCP extensions | No                  |
| Image input      | No           | `@file.jpg` syntax | `--image` flag      |
| Speech/TTS       | No           | API only (not CLI) | No                  |
| MCP server mode  | Yes (native) | Via extensions     | `codex mcp-server`  |

### Architecture (Already Implemented)

The nexus-agents codebase already has comprehensive CLI adapter infrastructure:

1. **`ICliAdapter` interface** - Full CLI adapter contract with health checks, capacity monitoring
2. **`SubprocessCliAdapter`** - Base class for subprocess-based CLI invocation
3. **`ClaudeCliAdapter`** / `GeminiCliAdapter` / `CodexCliAdapter`\*\* - Per-CLI implementations
4. **`CliToModelAdapter`** - Bridge pattern: wraps `ICliAdapter` as `IModelAdapter`
5. **`AutoAdapter`** - Auto-selects CLI vs API with configurable priority (`cli-first`, `api-first`, etc.)
6. **`CliDetectionCache`** - Caches health check results to avoid repeated subprocess calls
7. **`CompositeRouter`** - Multi-stage routing (Budget → Zero → Preference → TOPSIS → LinUCB)

### What Was Missing (Resolved)

1. **Status command** only showed API key availability, not CLI tool detection
2. **No research documentation** of CLI capabilities and integration patterns

### Recommendations

1. **Default strategy: `cli-first`** - Already the default in `AutoAdapter`. CLIs handle auth natively, reducing API key management burden.
2. **Status command enhanced** - Now shows both CLI tools (with version) and API keys, plus the active strategy.
3. **Doctor command** - Already performs full CLI health checks including version status and authentication.
4. **No new adapters needed** - The existing `ClaudeCliAdapter`, `GeminiCliAdapter`, and `CodexCliAdapter` are complete.

## Decision

The `cli-first` strategy is already the architectural default. This research validates that approach and enhances the `status` command to surface CLI detection to users.

## References

- [Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference)
- [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Gemini CLI GitHub](https://github.com/google-gemini/gemini-cli)
- [Gemini CLI Headless Mode](https://geminicli.com/docs/cli/headless/)
- [Codex CLI Documentation](https://developers.openai.com/codex/cli/)
- [Codex SDK](https://developers.openai.com/codex/sdk/)

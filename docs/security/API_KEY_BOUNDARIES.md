---
title: API Key Usage Boundaries
description: Which API keys can be used with which CLI tools
tier: 1
keywords: [security, api-key, opencode, claude, subscription, terms-of-service]
---

# API Key Usage Boundaries

nexus-agents routes tasks through multiple CLI tools. Each tool has its own authentication requirements and API key restrictions. Violating provider terms of service risks account suspension.

## CLI Authentication Matrix

| CLI                         | API Key Source                    | Env Variable                       | Risk Level                     |
| --------------------------- | --------------------------------- | ---------------------------------- | ------------------------------ |
| **Claude** (claude CLI)     | Anthropic subscription or API key | `ANTHROPIC_API_KEY`                | **Safe** — this IS Claude Code |
| **Gemini** (gemini CLI)     | Google AI API key                 | `GOOGLE_AI_API_KEY`                | **Safe** — separate provider   |
| **Codex** (codex CLI)       | OpenAI API key                    | `OPENAI_API_KEY`                   | **Safe** — separate provider   |
| **OpenCode** (opencode CLI) | Internal config file              | `~/.config/opencode/opencode.json` | **Conditional** — see below    |

## OpenCode API Key Boundary

**Claude Code subscription API keys are restricted to use only within Claude Code itself.** Using a Claude Code subscription key with any third-party tool (including OpenCode, direct API calls, or any non-Claude-Code application) violates [Anthropic's terms of service](https://www.anthropic.com/terms).

### When OpenCode Is Safe

- OpenCode uses its built-in free models (e.g., `opencode/big-pickle`)
- OpenCode is configured with a **separate** Anthropic API key from [console.anthropic.com](https://console.anthropic.com) (paid API tier)
- OpenCode is configured with non-Anthropic providers only (OpenAI-compatible endpoints, Google, etc.)

### When OpenCode Violates Terms

- OpenCode is configured with an `anthropic` provider that uses the same API key from a Claude Code subscription
- The `opencode-custom-opus` or `opencode-custom-sonnet` model IDs route through a `custom/claude-*` provider that uses a subscription key

### Startup Warning

nexus-agents automatically detects and warns when OpenCode has Anthropic/Claude models configured:

```
WARN: OpenCode has Anthropic/Claude models configured.
      Ensure these use a SEPARATE API key from console.anthropic.com,
      NOT a Claude Code subscription key (which is restricted to Claude Code only).
```

This warning appears during adapter initialization when `anthropic/` or `custom/claude` models are found in OpenCode's available models list.

## Safe Multi-Model Diversity

For consensus voting and multi-model orchestration, 4 CLIs (claude, gemini, codex, opencode) provide diversity:

| Strategy             | CLIs Used               | Sufficient For                                         |
| -------------------- | ----------------------- | ------------------------------------------------------ |
| **3-CLI voting**     | claude + gemini + codex | Majority votes (2/3), supermajority (3/3)              |
| **4-CLI voting**     | All 4                   | Maximum diversity (requires proper OpenCode key setup) |
| **Budget-conscious** | claude + gemini         | 2-model comparison                                     |

### Recommended Configuration

```yaml
# nexus-agents.yaml — safe multi-model setup
adapters:
  claude:
    # Uses ANTHROPIC_API_KEY from environment (subscription or API key)
    enabled: true
  gemini:
    # Uses GOOGLE_AI_API_KEY from environment
    enabled: true
  codex:
    # Uses OPENAI_API_KEY from environment
    enabled: true
  opencode:
    # Only enable if you have a SEPARATE Anthropic API key configured
    # OR are using non-Anthropic providers only
    enabled: false
```

## Current behavior: cross-CLI warning (#1429)

The shipped behavior is **advisory, not enforcing**. When OpenCode is detected with an Anthropic/Claude provider configured, nexus-agents logs a warning (`#1429`, `opencode-adapter.ts`) so you notice that an Anthropic model could be routed through a non-Claude CLI. It does **not** refuse the route — the router does not block the request. Avoid the situation by following the safe-config example above.

## Planned (not yet implemented) — see #3997

> **Not implemented.** The `NEXUS_ENFORCE_KEY_BOUNDARIES` environment variable below describes *planned* enforcement that does **not** exist in the codebase today (no such variable is read by the router). It is tracked in #3997. Do not rely on it; the current behavior is the advisory warning described above.

The planned design: set `NEXUS_ENFORCE_KEY_BOUNDARIES=true` to prevent routing Anthropic models through non-Claude CLIs, so the router would refuse to send tasks to OpenCode when the requested model is an Anthropic/Claude model.

**Planned default:** `false` (warning only, no enforcement)

---
title: Custom OpenAI-Compatible Endpoint Setup
description: Configure nexus-agents to route through a custom OpenAI-compatible API gateway using OpenCode as the transport layer
tier: 2
keywords: [custom, openai-compatible, gateway, opencode, endpoint, proxy]
---

# Custom OpenAI-Compatible Endpoint Setup

Route nexus-agents tasks through a custom OpenAI-compatible API gateway using OpenCode as the transport layer. This supports environments where models are brokered through an intermediary API endpoint.

## Architecture

```
nexus-agents → OpenCode CLI → Custom Gateway → Model Provider
                (subprocess)    (OpenAI-compat)   (Claude, etc.)
```

nexus-agents invokes `opencode run --model custom/<model-name> <prompt>` as a subprocess. OpenCode handles the HTTP transport to the custom gateway. No API keys or credentials are managed by nexus-agents.

## Prerequisites

1. **OpenCode CLI** installed and on PATH
2. **Custom gateway** that speaks the OpenAI-compatible chat completions API
3. **API key** for the gateway (stored in `opencode.json` or environment variable)

## Step 1: Configure OpenCode

Create or edit `opencode.json` in your project root:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "custom": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Custom Gateway",
      "options": {
        "baseURL": "https://your-gateway.example.com/v1",
        "apiKey": "{env:CUSTOM_API_KEY}"
      },
      "models": {
        "claude-opus-4-5": {
          "name": "Claude Opus 4.5",
          "limit": { "context": 200000, "output": 65536 }
        },
        "claude-sonnet-4-5": {
          "name": "Claude Sonnet 4.5",
          "limit": { "context": 200000, "output": 65536 }
        }
      }
    }
  }
}
```

Set the API key as an environment variable:

```bash
export CUSTOM_API_KEY="your-api-key"
```

Config files are merged across three locations (project overrides global):

1. **Global:** `~/.config/opencode/opencode.json`
2. **Project:** `opencode.json` in project root
3. **Environment:** `OPENCODE_CONFIG` path

## Step 2: Verify OpenCode Can Reach the Gateway

Test model connectivity:

```bash
opencode run --model custom/claude-sonnet-4-5 "Hello, respond with OK"
```

You should receive a response from the model via the gateway.

To verify which models the gateway exposes (standard OpenAI-compatible endpoint):

```bash
curl -H "Authorization: Bearer $CUSTOM_API_KEY" https://your-gateway.example.com/v1/models
```

Or list models via OpenCode:

```bash
opencode models custom --verbose
```

## Step 3: Model Registry

nexus-agents includes two pre-configured model profiles for custom endpoints:

| Model ID                 | CLI Model Name             | Quality Profile                  |
| ------------------------ | -------------------------- | -------------------------------- |
| `opencode-custom-opus`   | `custom/claude-opus-4-5`   | reasoning: 10, code: 9, speed: 5 |
| `opencode-custom-sonnet` | `custom/claude-sonnet-4-5` | reasoning: 9, code: 9, speed: 7  |

These are registered in `config/model-capabilities.ts` with `provider: 'custom-openai'` and `cliName: 'opencode'`.

## Step 4: Routing

The routing pipeline automatically discovers custom models via `cliName: 'opencode'`. When OpenCode is available and the task profile matches, custom models participate in model scoring alongside direct-access models.

The opencode fallback chain prioritizes custom models:

```
opencode-custom-opus → opencode-custom-sonnet → opencode-default
```

To force routing through a custom model, use `delegate_to_model` with `model_hint`:

```bash
nexus-agents orchestrate --model opencode-custom-opus "Your task here"
```

Or via MCP:

```json
{
  "tool": "delegate_to_model",
  "arguments": {
    "task": "Your task here",
    "model_hint": "opencode-custom-opus"
  }
}
```

## Customizing Model Names

If your gateway uses different model identifiers, two changes are needed:

**1. OpenCode config** (`opencode.json`) — model keys must match the gateway's model IDs:

```json
{
  "provider": {
    "custom": {
      "models": {
        "your-model-id": { "name": "Your Model" }
      }
    }
  }
}
```

**2. nexus-agents registry** (`config/model-capabilities.ts`) — `cliModelName` must match `<provider>/<model-key>`:

```typescript
{
  id: 'opencode-custom-opus',
  // ...
  cliModelName: 'custom/your-model-id',
}
```

The `cliModelName` is passed directly to `opencode run --model <cliModelName>`.

## Advanced Options

nexus-agents passes optional flags to OpenCode when specified in task options:

| Option     | Values                   | Description                    |
| ---------- | ------------------------ | ------------------------------ |
| `variant`  | `high`, `max`, `minimal` | Reasoning effort level         |
| `thinking` | `true`                   | Show model thinking blocks     |
| `workDir`  | path string              | Working directory for the task |

Example via MCP:

```json
{
  "tool": "delegate_to_model",
  "arguments": {
    "task": "Review this code for security issues",
    "model_hint": "opencode-custom-opus"
  }
}
```

The `variant` flag uses a strict allowlist — non-allowlisted values are silently dropped for security.

## Using nexus-agents as MCP Server Inside OpenCode

nexus-agents can run as an MCP server inside OpenCode, giving OpenCode access to all 24 nexus-agents tools (orchestrate, consensus vote, memory, research, etc.).

Add the `mcp` section to your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "nexus-agents": {
      "type": "local",
      "command": ["node", "/path/to/nexus-agents/dist/cli.js", "--mode=server"],
      "enabled": true,
      "environment": {
        "NEXUS_ALLOW_MOCK_ORCHESTRATION": "true"
      }
    }
  }
}
```

Verify the connection:

```bash
opencode mcp list
# Should show: nexus-agents connected
```

Then use nexus-agents tools from within OpenCode sessions. The model will automatically discover and call available MCP tools.

## Docker Container Testing

Run OpenCode + nexus-agents MCP in an isolated Docker container for reproducible testing.

### Quick Start

```bash
# Build the image
docker build -f Dockerfile.opencode -t nexus-opencode .

# Run smoke test (no API key needed)
docker compose -f docker-compose.opencode.yml run --rm smoke-test

# Interactive session with Anthropic
docker run -it --rm -e ANTHROPIC_API_KEY nexus-opencode

# Run with custom OpenAI-compatible endpoint
docker run -it --rm \
  -e CUSTOM_API_BASE_URL=https://your-gateway.example.com/v1 \
  -e CUSTOM_API_KEY=your-key \
  nexus-opencode run --format json -m custom/claude-opus "your prompt"

# Test MCP integration with free model (no API key)
docker run --rm nexus-opencode run --format json -m opencode/big-pickle \
  "Use the list_experts MCP tool"
```

### What the Container Includes

- **Node.js 22** + built nexus-agents with all dependencies
- **OpenCode v1.2.15** (pinned for reproducibility)
- **MCP config** (`opencode.json`): nexus-agents connected via stdio local transport
- **Provider config**: Anthropic + custom OpenAI-compatible endpoint preconfigured
- Runs as non-root `nexus` user

### Docker Desktop Sandbox (Alternative)

For stronger isolation via microVM, Docker Desktop users can use Docker Sandboxes:

```bash
docker sandbox run opencode .
```

This provides credential proxying and filesystem isolation. See [Docker Sandbox docs](https://docs.docker.com/ai/sandboxes/agents/opencode/) for details. Note: requires Docker Desktop with sandbox support enabled.

## Troubleshooting

**"No model adapter configured"**: OpenCode is not on PATH or not installed. Install it and verify with `which opencode`.

**Gateway connection errors**: Check `opencode.json` baseURL and API key. Verify with `opencode run --model custom/... "test"` directly.

**Model not selected by router**: Custom models default to `cliName: 'opencode'`. If OpenCode is unavailable, the router skips opencode models entirely. Check `nexus-agents doctor` for adapter status.

**Wrong model used**: Verify `cliModelName` in `model-capabilities.ts` matches the provider ID in `opencode.json`. The format is `<provider-id>/<model-id>`.

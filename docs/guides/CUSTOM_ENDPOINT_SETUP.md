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
  "provider": {
    "custom": {
      "name": "Custom Gateway",
      "driver": "@ai-sdk/openai-compatible",
      "baseURL": "https://your-gateway.example.com/v1",
      "apiKey": "${CUSTOM_API_KEY}",
      "models": {
        "claude-opus-4-5": {
          "name": "Claude Opus 4.5"
        },
        "claude-sonnet-4-5": {
          "name": "Claude Sonnet 4.5"
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

## Step 2: Verify OpenCode Can Reach the Gateway

```bash
opencode run --model custom/claude-sonnet-4-5 "Hello, respond with OK"
```

You should receive a response from the model via the gateway.

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

If your gateway uses different model identifiers, update `cliModelName` in `config/model-capabilities.ts`:

```typescript
{
  id: 'opencode-custom-opus',
  // ...
  cliModelName: 'your-provider/your-model-id',
}
```

The `cliModelName` is passed directly to `opencode run --model <cliModelName>`.

## Troubleshooting

**"No model adapter configured"**: OpenCode is not on PATH or not installed. Install it and verify with `which opencode`.

**Gateway connection errors**: Check `opencode.json` baseURL and API key. Verify with `opencode run --model custom/... "test"` directly.

**Model not selected by router**: Custom models default to `cliName: 'opencode'`. If OpenCode is unavailable, the router skips opencode models entirely. Check `nexus-agents doctor` for adapter status.

**Wrong model used**: Verify `cliModelName` in `model-capabilities.ts` matches the provider ID in `opencode.json`. The format is `<provider-id>/<model-id>`.

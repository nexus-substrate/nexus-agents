---
title: Cloud Provider Setup (Bedrock, Vertex, Azure)
description: Three paths to route nexus-agents through Bedrock, Vertex AI, Azure OpenAI, and any other cloud-hosted model — without nexus-agents shipping provider-specific code
tier: 2
keywords: [bedrock, vertex, azure, openrouter, litellm, cloud, providers, gateway]
---

# Cloud Provider Setup

Route nexus-agents through AWS Bedrock, Google Vertex AI, Azure OpenAI, or any of LiteLLM's 2,673 supported models — without nexus-agents shipping any provider-specific adapter code.

> **Why no native Bedrock/Vertex/Azure adapter?** Per the consensus vote on issue [#2182](https://github.com/nexus-substrate/nexus-agents/issues/2182) (6-0 unanimous reject), shipping per-cloud provider plugins is a build-vs-buy mistake — the existing OpenAI-compatible gateway pattern already covers every cloud through one of the three paths below. This guide documents what to use instead.

## TL;DR — Pick a path

| Path                                 | Use when                                                                                 | Setup minutes | Credentials managed by |
| ------------------------------------ | ---------------------------------------------------------------------------------------- | ------------- | ---------------------- |
| **A. OpenRouter direct**             | You want a hosted gateway across many providers in one billing relationship              | 2             | OpenRouter             |
| **B. LiteLLM-proxy + custom-openai** | You need self-hosted credential isolation, on-prem, or fine-grained per-provider routing | 10            | Your LiteLLM container |
| **C. Any OpenAI-compatible gateway** | You already run a gateway (Portkey, Helicone, Langfuse-Gateway, internal proxy, etc.)    | 2             | Your existing gateway  |

All three paths use existing nexus-agents code. No new adapters, no new provider plugins.

---

## Path A — OpenRouter direct

OpenRouter is a hosted multi-provider gateway. Set one env var, and nexus-agents speaks to OpenRouter, which forwards to whichever underlying model you pick. Bedrock-Claude, Vertex-Gemini, Azure-GPT-4o — all reachable through OpenRouter's catalog.

### Setup

```bash
# 1. Get an API key at https://openrouter.ai/keys
export OPENROUTER_API_KEY="sk-or-v1-..."

# 2. Route a task. nexus-agents picks an OpenRouter model that matches the
#    routing decision (free models prioritized; paid via OpenRouter pricing).
nexus-agents orchestrate "Explain the architecture of this codebase"
```

### Pinning a specific model

OpenRouter exposes provider-prefixed model IDs. To pin one explicitly:

```bash
# Pin to Claude on AWS Bedrock via OpenRouter
export NEXUS_OPENROUTER_MODEL="anthropic/claude-sonnet-4-6"

# Pin to Gemini on Vertex via OpenRouter
export NEXUS_OPENROUTER_MODEL="google/gemini-3-pro"

# Pin to GPT-4o on Azure via OpenRouter
export NEXUS_OPENROUTER_MODEL="openai/gpt-4o"
```

See OpenRouter's [model catalog](https://openrouter.ai/models) for the full list.

### Pros / cons

|     | OpenRouter direct                                                                                 |
| --- | ------------------------------------------------------------------------------------------------- |
| ✅  | Single API key for every cloud-hosted model                                                       |
| ✅  | Hosted — no infra to run                                                                          |
| ✅  | Built-in fallback routing across providers                                                        |
| ✅  | Free-tier models (Llama, Mixtral, Qwen) work without payment                                      |
| ⚠   | OpenRouter is in the data path — encrypted in transit, but a third party sees prompts/completions |
| ⚠   | Per-token cost markup vs. provider-direct pricing                                                 |
| ⚠   | Cannot use AWS IAM / GCP service-account / Azure RBAC; auth is via OpenRouter API key only        |

**When NOT to use:** regulated environments (HIPAA, FedRAMP, on-prem); workloads that must stay inside a single cloud's IAM boundary; cost-sensitive high-volume workloads.

---

## Path B — LiteLLM proxy + custom-openai shim

[LiteLLM](https://github.com/BerriAI/litellm) is a self-hosted OpenAI-compatible proxy that speaks to 100+ provider APIs natively (Bedrock IAM, Vertex service-accounts, Azure managed identity, etc.). Run it in a container, point nexus-agents at it via the existing `NEXUS_CUSTOM_*` env vars.

### Setup

```bash
# 1. Run LiteLLM proxy. Minimum config: one model.
docker run -d --name litellm \
  -p 4000:4000 \
  -e AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
  -e AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
  -e AWS_REGION_NAME="us-east-1" \
  -v "$(pwd)/litellm-config.yaml:/app/config.yaml" \
  ghcr.io/berriai/litellm:main-stable \
  --config /app/config.yaml --port 4000
```

`litellm-config.yaml`:

```yaml
model_list:
  - model_name: claude-bedrock
    litellm_params:
      model: bedrock/anthropic.claude-sonnet-4-20250514-v1:0
      aws_region_name: us-east-1
  - model_name: gemini-vertex
    litellm_params:
      model: vertex_ai/gemini-1.5-pro
      vertex_project: your-gcp-project-id
      vertex_location: us-central1
  - model_name: gpt4-azure
    litellm_params:
      model: azure/gpt-4o
      api_base: https://your-resource.openai.azure.com/
      api_version: '2024-08-01-preview'
      api_key: ${AZURE_API_KEY}
```

```bash
# 2. Point nexus-agents at the proxy
export NEXUS_CUSTOM_API_BASE_URL="http://localhost:4000/v1"
export NEXUS_CUSTOM_API_KEY="anything"   # LiteLLM master key (or 'sk-1234' if no auth)
export NEXUS_CUSTOM_MODEL="claude-bedrock"   # or gemini-vertex, gpt4-azure

# 3. Run a task — flows through LiteLLM → Bedrock/Vertex/Azure
nexus-agents orchestrate "Explain the architecture of this codebase"
```

> **SSRF guard:** nexus-agents validates the base URL before making any request. `localhost`, RFC 1918 private ranges, and link-local addresses are rejected by default. For local dev (LiteLLM at `localhost:4000`) set `NEXUS_CUSTOM_API_ALLOW_PRIVATE=1`. See [CUSTOM_ENDPOINT_SETUP.md](./CUSTOM_ENDPOINT_SETUP.md) for the full guard rules.

### Pros / cons

|     | LiteLLM-proxy + custom-openai                                                |
| --- | ---------------------------------------------------------------------------- |
| ✅  | Native AWS IAM / GCP service-account / Azure managed identity                |
| ✅  | Self-hosted — prompts/completions never leave your network                   |
| ✅  | Per-provider routing rules, retries, fallbacks, and cost tracking in LiteLLM |
| ✅  | One integration covers Bedrock + Vertex + Azure + 100+ others                |
| ⚠   | Operational burden — you run the container, monitor it, patch it             |
| ⚠   | Adds one network hop                                                         |
| ⚠   | LiteLLM config is a separate source of truth from your IDE setup             |

**When NOT to use:** trial / proof-of-concept work where Path A's setup time dominates; environments without container infrastructure.

---

## Path C — Any OpenAI-compatible gateway

If you already run an OpenAI-compatible gateway (Portkey, Helicone, Langfuse Gateway, an internal proxy, etc.), point nexus-agents at it the same way as Path B — but skip the LiteLLM container. Your gateway handles the cloud auth.

### Setup

```bash
export NEXUS_CUSTOM_API_BASE_URL="https://your-gateway.example.com/v1"
export NEXUS_CUSTOM_API_KEY="your-gateway-key"
export NEXUS_CUSTOM_MODEL="claude-sonnet-4-5"   # whatever model id your gateway exposes
```

### Pros / cons

|     | Any OpenAI-compatible gateway                                                                        |
| --- | ---------------------------------------------------------------------------------------------------- |
| ✅  | Reuse existing gateway investment (auth, rate limiting, observability)                               |
| ✅  | No new infra to run                                                                                  |
| ✅  | Gateway handles cloud auth — nexus-agents only sees the gateway's API key                            |
| ⚠   | Constrained to whichever models your gateway supports                                                |
| ⚠   | Cloud-specific features (e.g. Bedrock guardrails, Vertex tools) require your gateway to forward them |

For full setup — including the SSRF guard, model-id mapping, and OpenCode transport variant — see [CUSTOM_ENDPOINT_SETUP.md](./CUSTOM_ENDPOINT_SETUP.md).

---

## Comparison at a glance

| Concern                        | Path A (OpenRouter)           | Path B (LiteLLM)                  | Path C (Existing gateway)       |
| ------------------------------ | ----------------------------- | --------------------------------- | ------------------------------- |
| **Setup time**                 | 2 min                         | 10 min                            | 2 min                           |
| **Hosted vs self-hosted**      | Hosted                        | Self-hosted                       | Either                          |
| **AWS/GCP/Azure native auth**  | ❌ (uses OpenRouter key only) | ✅                                | Gateway-dependent               |
| **Per-token cost markup**      | ✅ (OpenRouter margin)        | ❌                                | Gateway-dependent               |
| **Compliance (HIPAA/FedRAMP)** | ❌                            | ✅ if your container is compliant | ✅ if your gateway is compliant |
| **Provider fallback**          | ✅ built-in                   | ✅ via LiteLLM router             | Gateway-dependent               |
| **Free models available**      | ✅                            | ❌ (provider keys required)       | Gateway-dependent               |
| **Operational burden**         | None                          | Container + config maintenance    | None additional                 |

## Verifying the connection

Whichever path you pick, run:

```bash
nexus-agents doctor
```

The doctor command probes available adapters and reports which paths are configured. A healthy run lists `OpenRouter` (Path A) or `Custom OpenAI` (Paths B/C) under "Available adapters."

To verify end-to-end with a real model call:

```bash
nexus-agents orchestrate "Print the string OK"
```

Look for the configured CLI/adapter in the trace output.

## Related

- [CUSTOM_ENDPOINT_SETUP.md](./CUSTOM_ENDPOINT_SETUP.md) — full custom-openai env-var reference + SSRF guard rules
- [CONFIGURATION.md](../getting-started/CONFIGURATION.md) — all environment variables
- [#2182](https://github.com/nexus-substrate/nexus-agents/issues/2182) — the consensus vote that closed the door on per-cloud-provider plugins; this guide is the project's stated answer to "how do I use Bedrock/Vertex/Azure?"

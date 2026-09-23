---
title: Corporate OpenAI-Spec Gateway
description: Run nexus-agents as an MCP server behind one OpenAI-compatible gateway that serves Anthropic, OpenAI and Google models, with no local CLIs
tier: 2
keywords: [gateway, openai-compatible, corporate, proxy, mcp, env, family-slot, voter, doctor]
---

# Corporate OpenAI-Spec Gateway

This recipe covers a common setup: your organization's OpenAI-compatible gateway serves Anthropic, OpenAI and Google models behind one URL and one key, and the host has no vendor CLIs (`claude`, `codex`, `gemini`) installed or authenticated. nexus-agents runs as an MCP server inside your harness and makes every model call through the gateway, in-process.

For the single-model SDK path and the OpenCode subprocess transport, see [CUSTOM_ENDPOINT_SETUP.md](./CUSTOM_ENDPOINT_SETUP.md). For containerized use, see [SANDBOXED-USAGE.md](./SANDBOXED-USAGE.md). The full variable reference is [CONFIGURATION.md](../getting-started/CONFIGURATION.md).

## Required variables

| Variable                  | Value                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| `NEXUS_OPENAI_COMPAT_URL` | The gateway base URL, **ending in `/v1`**, e.g. `https://llm-gateway.corp.example/v1`        |
| `NEXUS_OPENAI_COMPAT_KEY` | The gateway key. Sent as `Authorization: Bearer <key>` unless you set an auth header (below) |

Both must be non-empty after trimming, or the gateway is off. The URL is handed to the `openai` SDK as its base URL, and the SDK appends `/models` and `/chat/completions`. nexus-agents does not add `/v1` for you: a URL without it probes the wrong path, and one with `/v1/v1` in a hand-built `curl` does the same.

The deprecated `NEXUS_CUSTOM_API_BASE_URL` / `NEXUS_CUSTOM_API_KEY` pair does **not** turn on the gateway path. Use the two names above.

## Harness MCP `env` blocks

The variables must reach the nexus-agents MCP server process. Harnesses differ in what they pass through, so the safest rule is: **list every variable you need in the server's `env` block**, including proxy and CA variables.

| Harness     | What the MCP server receives                                                                                                                                                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex CLI   | **Filtered.** Only a fixed default set (`HOME`, `LOGNAME`, `PATH`, `SHELL`, `USER`, `LANG`, `LC_ALL`, `TERM`, `TMPDIR`, `TZ`, plus a macOS encoding variable), the names in `env_vars`, and the `env` table. `HTTPS_PROXY` is not in the default set. |
| OpenCode    | The full OpenCode process environment, overlaid with the `environment` block.                                                                                                                                                                         |
| Claude Code | The `env` block, with `${VAR}` and `${VAR:-default}` expanded from Claude Code's environment. Its MCP docs do not promise full inheritance, so list what you need.                                                                                    |

### Claude Code (`.mcp.json`)

```json
{
  "mcpServers": {
    "nexus-agents": {
      "command": "nexus-agents",
      "args": ["--mode=server"],
      "env": {
        "NEXUS_OPENAI_COMPAT_URL": "${NEXUS_OPENAI_COMPAT_URL}",
        "NEXUS_OPENAI_COMPAT_KEY": "${NEXUS_OPENAI_COMPAT_KEY}",
        "NEXUS_GATEWAY_COST": "openai-compat=free",
        "HTTPS_PROXY": "${HTTPS_PROXY:-}",
        "NO_PROXY": "${NO_PROXY:-}",
        "NODE_EXTRA_CA_CERTS": "${NODE_EXTRA_CA_CERTS:-}"
      }
    }
  }
}
```

Keep the key out of the committed file: reference it with `${...}` and export it in the shell that starts Claude Code, or add the server at user scope with `claude mcp add --env`.

### Codex CLI (`~/.codex/config.toml`)

```toml
[mcp_servers.nexus-agents]
command = "nexus-agents"
args = ["--mode=server"]
# Forwarded from the Codex process environment by name.
env_vars = [
  "NEXUS_OPENAI_COMPAT_URL",
  "NEXUS_OPENAI_COMPAT_KEY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "NODE_EXTRA_CA_CERTS",
]

[mcp_servers.nexus-agents.env]
NEXUS_GATEWAY_COST = "openai-compat=free"
```

Without `env_vars` (or an `env` entry), Codex starts the server without the gateway variables and nexus-agents falls back to CLI subprocesses.

### OpenCode (`opencode.json`)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "nexus-agents": {
      "type": "local",
      "command": ["nexus-agents", "--mode=server"],
      "enabled": true,
      "environment": {
        "NEXUS_OPENAI_COMPAT_URL": "{env:NEXUS_OPENAI_COMPAT_URL}",
        "NEXUS_OPENAI_COMPAT_KEY": "{env:NEXUS_OPENAI_COMPAT_KEY}",
        "NEXUS_GATEWAY_COST": "openai-compat=free"
      }
    }
  }
}
```

`nexus-agents init --opencode <path>` merges an equivalent block into an existing file (see [SANDBOXED-USAGE.md](./SANDBOXED-USAGE.md)).

## Optional variables

| Variable                                                                                      | Behaviour                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXUS_OPENAI_COMPAT_MODELS`                                                                  | Comma-separated allowlist of model ids; `*` is a wildcard over the whole id. Applied after the non-chat filter and **before** the 256-model cap. A catalogue above 256 chat models is refused with an error (not truncated), and discovery fails until you set this.                                                                            |
| `NEXUS_OPENAI_COMPAT_AUTH_HEADER`                                                             | Header name that carries the key instead of `Authorization: Bearer`, e.g. `api-key`. The raw key is sent with no `Bearer` prefix. `Authorization` (any case) keeps the bearer default; an illegal header name is ignored with a warning.                                                                                                        |
| `NEXUS_OPENAI_COMPAT_EXTRA_HEADERS`                                                           | Static headers on every gateway request, as `Name=value,Name2=value2` (not JSON). The whole value is ignored with a warning if any entry is malformed, repeats a name, or sets `Authorization`.                                                                                                                                                 |
| `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY` (lower-case forms too)                              | nexus-agents builds its own proxy agent for gateway calls, because Node's `fetch` ignores these variables unless started with `NODE_USE_ENV_PROXY=1`. Lower-case wins over upper-case. `NO_PROXY` uses curl-style matching. Only `http://` and `https://` proxy URLs are accepted; anything else is ignored with a warning and calls go direct. |
| `NODE_EXTRA_CA_CERTS`                                                                         | Standard Node variable for a corporate root CA; Node reads it at process start. nexus-agents has no gateway-specific CA setting. It is on the allowlist of variables passed to spawned CLIs.                                                                                                                                                    |
| `NEXUS_CUSTOM_API_ALLOW_PRIVATE`                                                              | Set to exactly `1` or `true` (case-sensitive) when the gateway resolves to a private, loopback or link-local address. Otherwise the SSRF guard refuses the host and the gateway is not used.                                                                                                                                                    |
| `NEXUS_GATEWAY_MODEL_ANTHROPIC` / `NEXUS_GATEWAY_MODEL_OPENAI` / `NEXUS_GATEWAY_MODEL_GOOGLE` | Pin the model a family slot uses (see below). A pin that is not in the catalogue, or that belongs to another family, is ignored with a warning.                                                                                                                                                                                                 |
| `NEXUS_GATEWAY_COST`                                                                          | Declares what the gateway costs: `free`, `local`, `priced` (registry pricing) or `priced:<inputPer1M>,<outputPer1M>`, optionally scoped as `openai-compat=<decl>` and separated by `;`. Undeclared, the gateway is excluded from the task-class cost ceiling and per-task budget, and `doctor` warns.                                           |
| `NEXUS_OPENAI_COMPAT_ENDPOINT`                                                                | The arm id the gateway registers as, `api:<endpoint>`; default `openai-compat`. A scoped `NEXUS_GATEWAY_COST` key must use the same name.                                                                                                                                                                                                       |
| `NEXUS_DISABLED_CLIS`                                                                         | Comma-separated CLI names (e.g. `claude,codex,gemini`) removed from detection, voting, routing, fallback and `doctor` probes. Useful on a gateway-only host so absent CLIs are not probed.                                                                                                                                                      |
| `NEXUS_SUBPROCESS_EXTRA_ENV`                                                                  | Extra variable names (comma or whitespace separated) forwarded to spawned CLI subprocesses, even names that look like secrets.                                                                                                                                                                                                                  |

### What spawned CLIs see

Spawned CLI subprocesses get an allowlisted environment, not yours. The allowlist includes `PATH`, `HOME`, the proxy variables, `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`/`SSL_CERT_DIR`, the CLI's own vendor keys, and `NEXUS_*` names that do not look like secrets. So:

- `NEXUS_OPENAI_COMPAT_KEY` is **stripped** (its name ends in `_KEY`); `NEXUS_OPENAI_COMPAT_URL` is passed.
- `OPENAI_BASE_URL` and `ANTHROPIC_BASE_URL` are not on the allowlist, so they are dropped.

To point a spawned CLI at the gateway, name the variables in `NEXUS_SUBPROCESS_EXTRA_ENV`, e.g. `OPENAI_BASE_URL,ANTHROPIC_BASE_URL`. `NEXUS_SUBPROCESS_ENV_ALLOWLIST=false` turns the filter off entirely; prefer the narrower variable.

## How discovery works

At startup the server calls `GET $NEXUS_OPENAI_COMPAT_URL/models` (10 s timeout, one retry), then:

1. Drops ids that are not a valid model-id shape.
2. Removes duplicates.
3. Drops non-chat models (embedding, TTS, image, audio, moderation, rerank, video), using the listing's metadata first and the id second.
4. Applies `NEXUS_OPENAI_COMPAT_MODELS`.
5. Refuses the catalogue if more than 256 models remain.

On success it logs `OpenAI-compatible gateway wired` with the **host only** (never the full URL, which can carry credentials), the model count and the model ids.

## Family-slot mapping

The router's vendor slots are served from the gateway by family:

| Slot     | Family    | Identified by (in the model id)              |
| -------- | --------- | -------------------------------------------- |
| `claude` | Anthropic | `claude`, `anthropic`                        |
| `codex`  | OpenAI    | `gpt`, `o1`–`o9`, `chatgpt`, `openai`        |
| `gemini` | Google    | `gemini`, `bison`, `gecko`, `palm`, `google` |

Without a pin, each slot takes the top-ranked chat model of its family. Ranking is **tier first**: flagship (`opus`, `pro`, `ultra`, or unmarked), then mid (`sonnet`, `mini`, `flash`, `medium`), then small (`haiku`, `nano`, `lite`, `tiny`, `small`). Within a tier: the `/models` `created` field (only when every model has one), then the generation parsed from the id, then `-latest`, registry quality, date stamp and id. A family with no chat model leaves its slot unavailable; it never borrows another family's model. The server logs `Gateway family slots resolved` with the chosen model per slot.

## Voter panels

With the gateway configured, `consensus_vote` runs every voter in-process through it. Seats are dealt across families before models:

1. `NEXUS_VOTER_MODEL_<ROLE>` pins are seated first and count toward the balance.
2. Each remaining seat goes to the family with the fewest seats so far (ties: Anthropic, OpenAI, Google, then other vendors, unknown last).
3. Within a family, the least-used model is chosen, with ties going to the best-ranked model.

The gateway's listing order does not matter. If the catalogue offers only one family, the server warns `Consensus panel collapsed to a single model family — votes may correlate`.

## Checking the catalogue: `model-drift`

```bash
nexus-agents model-drift          # human-readable report
nexus-agents model-drift --json   # machine-readable
```

Reports gateway models the registry does not know and registry models no source lists any more. The gateway source uses the same discovery path (chat filter and allowlist apply). `--file-issue` drafts one GitHub issue per new model with `gh`. It never edits the registry; a non-zero exit means nothing could be measured.

## Checking the setup: `doctor --gateway`

`nexus-agents doctor` prints the voter transport and warns when `NEXUS_GATEWAY_COST` is undeclared.

`doctor --gateway` is added by PR [#6647](https://github.com/nexus-substrate/nexus-agents/pull/6647) and **requires the release that includes it**. It measures the gateway with the same calls the server makes: the private-address guard, then discovery. It reports listed vs chat model counts, a family census, the slot-to-model mapping, the guard result and the proxy host. `--probe` sends one completion per family (this spends tokens). With that change, a host whose gateway passes no longer fails `doctor` because the vendor CLIs are not installed.

## Troubleshooting

| Symptom                                                                                     | Cause and fix                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `No in-process gateway is configured, so voter/consensus calls will spawn CLI subprocesses` | Logged when the variables are missing, the probe failed, or the gateway listed no models. If the variables are missing, check the harness `env` block; Codex needs them in `env_vars` or `env`. Otherwise read the preceding warning.                       |
| `Failed to discover models from <host>`                                                     | Probe by hand: `curl -H "Authorization: Bearer $NEXUS_OPENAI_COMPAT_KEY" "$NEXUS_OPENAI_COMPAT_URL/models"`. A 404 usually means the URL lacks `/v1` (or has it twice). A 401 with a custom header scheme means you need `NEXUS_OPENAI_COMPAT_AUTH_HEADER`. |
| `Gateway host <host> refused by the private-address guard`                                  | The gateway resolves to an internal address. Set `NEXUS_CUSTOM_API_ALLOW_PRIVATE=1` and restart the server.                                                                                                                                                 |
| `... above the 256 cap. Refusing to build an adapter per model.`                            | Set `NEXUS_OPENAI_COMPAT_MODELS` to an allowlist of at most 256 models.                                                                                                                                                                                     |
| `NEXUS_OPENAI_COMPAT_MODELS entries matched no chat model in the gateway catalogue`         | An allowlist entry is misspelled or names a non-chat model. Compare against the ids in the `gateway wired` log line.                                                                                                                                        |
| TLS errors (`unable to get local issuer certificate`)                                       | Set `NODE_EXTRA_CA_CERTS` to your corporate root CA bundle in the MCP `env` block, then restart the harness.                                                                                                                                                |
| Timeouts behind a proxy                                                                     | Pass `HTTPS_PROXY` / `NO_PROXY` in the MCP `env` block. Check the log for `HTTPS_PROXY ignored for the gateway`, which means the proxy URL is not `http://` or `https://`.                                                                                  |
| A slot uses an unexpected model                                                             | Read the `Gateway family slots resolved` log line, then pin with `NEXUS_GATEWAY_MODEL_ANTHROPIC` / `_OPENAI` / `_GOOGLE`.                                                                                                                                   |
| Budget gates skip the gateway                                                               | Declare `NEXUS_GATEWAY_COST`, e.g. `openai-compat=free`, or `openai-compat=priced:<in>,<out>` if the gateway meters usage.                                                                                                                                  |
| A setting "does nothing"                                                                    | The MCP server's environment is fixed when the harness spawns it. Restart the harness (or its MCP server) after changing a variable.                                                                                                                        |

## Related

- [CONFIGURATION.md](../getting-started/CONFIGURATION.md) — every `NEXUS_*` variable
- [HARNESS_COMPATIBILITY.md](./HARNESS_COMPATIBILITY.md) — harness wiring and voter transport
- [CUSTOM_ENDPOINT_SETUP.md](./CUSTOM_ENDPOINT_SETUP.md) — single-model SDK path and OpenCode transport
- [MODEL_REGISTRY_PRICING.md](./MODEL_REGISTRY_PRICING.md) — decorated gateway model names and pricing
- [SANDBOXED-USAGE.md](./SANDBOXED-USAGE.md) — the gateway inside a container

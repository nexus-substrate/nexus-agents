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

`nexus-agents init --opencode <path>` merges a **different** block into an existing file (see [SANDBOXED-USAGE.md](./SANDBOXED-USAGE.md)). It does not write `NEXUS_OPENAI_COMPAT_URL` or `NEXUS_OPENAI_COMPAT_KEY`. Its `environment` sets `NEXUS_OPENCODE_CONFIG` (the path of the file itself), `NEXUS_DATA_DIR` and `NEXUS_GATEWAY_COST=openai-compat=free`, plus `NEXUS_SANDBOX` when a sandbox flavor is given. The server then reads the gateway from that file's `providers.openai-compat.options.baseURL` and `options.apiKey` (`{env:VAR}` in `apiKey` is resolved). When both `NEXUS_OPENAI_COMPAT_*` variables are set, they take precedence over the file.

## Optional variables

| Variable                                                                                      | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXUS_OPENAI_COMPAT_MODELS`                                                                  | Comma-separated allowlist of model ids; `*` is a wildcard over the whole id. Applied after the non-chat filter and **before** the 256-model cap. A catalogue above 256 chat models is refused with an error (not truncated), and discovery fails until you set this.                                                                                                                                                                                                                      |
| `NEXUS_OPENAI_COMPAT_AUTH_HEADER`                                                             | Header name that carries the key instead of `Authorization: Bearer`, e.g. `api-key`. The raw key is sent with no `Bearer` prefix. `Authorization` (any case) keeps the bearer default; an illegal header name is ignored with a warning.                                                                                                                                                                                                                                                  |
| `NEXUS_OPENAI_COMPAT_EXTRA_HEADERS`                                                           | Static headers on every gateway request, as `Name=value,Name2=value2` (not JSON). The whole value is ignored with a warning if any entry is malformed, repeats a name, sets `Authorization`, or names the header set in `NEXUS_OPENAI_COMPAT_AUTH_HEADER` (that header carries the key and nothing else may set it).                                                                                                                                                                      |
| `HTTPS_PROXY` / `HTTP_PROXY` / `NO_PROXY` (lower-case forms too)                              | nexus-agents builds its own proxy agent for gateway calls, because Node's `fetch` ignores these variables unless started with `NODE_USE_ENV_PROXY=1`. Lower-case wins over upper-case. `NO_PROXY` uses curl-style matching; an IP or CIDR entry matches only a gateway URL whose host is an IP literal, never a host name. Only `http://` and `https://` proxy URLs are accepted; anything else is ignored with a warning and calls go direct. `ALL_PROXY` is not read for gateway calls. |
| `NODE_EXTRA_CA_CERTS`                                                                         | Standard Node variable for a corporate root CA; Node reads it at process start. nexus-agents has no gateway-specific CA setting. It is on the allowlist of variables passed to spawned CLIs.                                                                                                                                                                                                                                                                                              |
| `NEXUS_CUSTOM_API_ALLOW_PRIVATE`                                                              | Set to exactly `1` or `true` (case-sensitive) when the gateway resolves to a private, loopback or link-local address. Otherwise the SSRF guard refuses the host and the gateway is not used.                                                                                                                                                                                                                                                                                              |
| `NEXUS_GATEWAY_MODEL_ANTHROPIC` / `NEXUS_GATEWAY_MODEL_OPENAI` / `NEXUS_GATEWAY_MODEL_GOOGLE` | Pin the model a family slot uses (see below). A pin that is not in the catalogue, or that belongs to another family, is ignored with a warning.                                                                                                                                                                                                                                                                                                                                           |
| `NEXUS_GATEWAY_COST`                                                                          | Declares what the gateway costs: `free`, `local`, `priced` (registry pricing) or `priced:<inputPer1M>,<outputPer1M>`, optionally scoped as `openai-compat=<decl>` and separated by `;`. Undeclared, the gateway is excluded from the task-class cost ceiling and per-task budget, and `doctor` warns.                                                                                                                                                                                     |
| `NEXUS_OPENAI_COMPAT_ENDPOINT`                                                                | The arm id the gateway registers as, `api:<endpoint>`; default `openai-compat`. A scoped `NEXUS_GATEWAY_COST` key must use the same name.                                                                                                                                                                                                                                                                                                                                                 |
| `NEXUS_DISABLED_CLIS`                                                                         | Comma-separated CLI names (e.g. `claude,codex,gemini`). Disables the CLI **transport** only: the binary is never spawned or probed, and `doctor` skips it. The slot is not removed. The family's gateway model still serves the slot when the gateway lists that family, and the slot is unavailable when it does not. Use it to keep a quota-exhausted or unwanted CLI out of a gateway host while its family stays served.                                                              |
| `NEXUS_SUBPROCESS_EXTRA_ENV`                                                                  | Extra variable names (comma or whitespace separated) forwarded to spawned CLI subprocesses, even names that look like secrets.                                                                                                                                                                                                                                                                                                                                                            |

### What spawned CLIs see

Spawned CLI subprocesses get an allowlisted environment, not yours. The allowlist includes `PATH`, `HOME`, the proxy variables, `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`/`SSL_CERT_DIR`, the CLI's own vendor keys, and `NEXUS_*` names that do not look like secrets. So:

- `NEXUS_OPENAI_COMPAT_KEY` is **stripped** (its name ends in `_KEY`); `NEXUS_OPENAI_COMPAT_URL` is passed.
- `OPENAI_BASE_URL` and `ANTHROPIC_BASE_URL` are not on the allowlist, so they are dropped.

To point a spawned CLI at the gateway, name the variables in `NEXUS_SUBPROCESS_EXTRA_ENV`, e.g. `OPENAI_BASE_URL,ANTHROPIC_BASE_URL`. `NEXUS_SUBPROCESS_ENV_ALLOWLIST=false` turns the filter off entirely; prefer the narrower variable.

### The direct OpenAI adapter and `OPENAI_BASE_URL`

The direct OpenAI adapter (`OPENAI_API_KEY`) sends requests to the host in `OPENAI_BASE_URL` when that variable is set. If the host is anything other than `api.openai.com`, the adapter treats it as an OpenAI-compatible gateway and posts to `<base>/chat/completions` (#6654). Set `NEXUS_CUSTOM_API_SURFACE=responses` if the host serves the Responses API (`<base>/responses`). With `OPENAI_BASE_URL` unset, or set to `api.openai.com`, the adapter uses the Responses API as before and ignores `NEXUS_CUSTOM_API_SURFACE`.

## How discovery works

At startup the server calls `GET $NEXUS_OPENAI_COMPAT_URL/models` (10 s timeout, one retry), then:

1. Drops ids that are not a valid model-id shape.
2. Removes duplicates.
3. Drops non-chat models (embedding, TTS, image, audio, moderation, rerank, video), using the listing's metadata first and the id second.
4. Applies `NEXUS_OPENAI_COMPAT_MODELS`.
5. Refuses the catalogue if more than 256 models remain.

On success it logs `OpenAI-compatible gateway wired` with the **host only** (never the full URL, which can carry credentials), the model count and the model ids.

Before the request, the private-address guard resolves the gateway host. The DNS lookup is capped at 5 s. A lookup that does not answer within that time fails closed: the gateway is not wired on this attempt, and a later attempt retries it. A DNS **error** fails open (the host is allowed), so a flaky resolver cannot break a legitimate gateway; the HTTP request then decides.

**Rediscovery.** If discovery fails at startup (unreachable, an error status, a timed-out lookup, or no models), the server starts without the gateway and tries again later. There is no timer. A model call triggers the retry, at most once every 60 s, and the boot attempt starts that clock. Every adapter the registry hands out triggers it (orchestrate, `execute_expert`, voting, `pr_review` and the rest), and once the gateway is found each of those adapters re-detects once, so the default adapter and the family slots move onto the gateway. A private-address refusal is never retried: fixing it is an environment change, so restart the server after setting `NEXUS_CUSTOM_API_ALLOW_PRIVATE`.

## Family-slot mapping

The router's vendor slots are served from the gateway by family:

| Slot     | Family    | Identified by (in the model id)              |
| -------- | --------- | -------------------------------------------- |
| `claude` | Anthropic | `claude`, `anthropic`                        |
| `codex`  | OpenAI    | `gpt`, `o1`–`o9`, `chatgpt`, `openai`        |
| `gemini` | Google    | `gemini`, `bison`, `gecko`, `palm`, `google` |

Without a pin, each slot takes the top-ranked chat model of its family. Ranking is **tier first**: flagship (`opus`, `pro`, `ultra`, or unmarked), then mid (`sonnet`, `mini`, `flash`, `medium`), then small (`haiku`, `nano`, `lite`, `tiny`, `small`). Within a tier: the `/models` `created` field (only when every model has one), then the generation parsed from the id, then `-latest`, registry quality, date stamp and id. A family with no chat model leaves its slot unavailable; it never borrows another family's model. For example, a catalogue with no Google model leaves the `gemini` slot unavailable, and a task pinned to it fails with an "unavailable" error. The server logs `Gateway family slots resolved` with the chosen model per slot.

The gateway serves a slot only when its CLI does not. An installed, authenticated CLI takes precedence and serves its own slot. The gateway model takes over when the CLI is missing, logged out, or disabled with `NEXUS_DISABLED_CLIS`. A CLI whose login expires mid-session is re-checked on its next call. The `opencode` slot has no family, so the gateway never serves it. This precedence applies to routing and to pinned slots. Voter panels are dealt differently (below).

## Voter panels

With the gateway configured, `consensus_vote` runs every voter in-process through it. Seats are dealt across families before models:

1. `NEXUS_VOTER_MODEL_<ROLE>` pins are seated first and count toward the balance.
2. Each remaining seat goes to the family with the fewest seats so far (ties: Anthropic, OpenAI, Google, then other vendors, unknown last).
3. Within a family, the least-used model is chosen, with ties going to the best-ranked model.

The gateway's listing order does not matter. If the catalogue offers only one family, the server warns `Consensus panel collapsed to a single model family — votes may correlate`.

A `NEXUS_VOTER_MODEL_<ROLE>` value must be a model id from the gateway catalogue: the id exactly as `/models` lists it, or the same id in different case. A registry alias such as `claude-opus` does not match. An id that matches nothing is ignored with a warning and the seat is dealt. When the gateway serves only one model, every seat gets that model and the overrides are skipped. `NEXUS_DISABLED_CLIS` does not affect gateway seats: a disabled CLI's family is still dealt seats.

## Checking the catalogue: `model-drift`

```bash
nexus-agents model-drift          # human-readable report
nexus-agents model-drift --json   # machine-readable
```

Reports gateway models the registry does not know and registry models no source lists any more. The gateway source uses the same discovery path (chat filter and allowlist apply). `--file-issue` drafts one GitHub issue per new model with `gh`. It never edits the registry; a non-zero exit means nothing could be measured.

## Checking the setup: `doctor --gateway`

Plain `nexus-agents doctor` already measures the gateway with the calls the server makes: the private-address guard, then discovery. It counts the result in its verdict. It also prints the voter transport and warns when `NEXUS_GATEWAY_COST` is undeclared. Each family slot left with no arm is named as a warning, for example `claude slot unavailable: disabled by NEXUS_DISABLED_CLIS, and the gateway has no anthropic model`. `--gateway` (since 8.101.0) adds the gateway report: listed vs chat model counts, a family census, the guard result, the proxy host, and one line per slot saying what serves it. That line uses the router's own decision: for example `claude → <model> (gateway; CLI disabled by NEXUS_DISABLED_CLIS)`, `codex → CLI (...)` or `gemini → unavailable (...)`. `--probe` also sends one completion per family (this spends tokens) and implies `--gateway`.

The gateway's verdict:

| Gateway state                                                                         | Verdict | Effect on the exit code                                                                                           |
| ------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| Not configured                                                                        | absent  | None. The CLIs and API keys decide.                                                                               |
| Discovery answered, and at least one of the `claude`/`codex`/`gemini` slots is served | pass    | A missing CLI no longer fails `doctor`. A missing CLI whose slot has no gateway model is a warning, not a failure |
| Refused by the guard, lookup timed out, discovery failed, or no chat models           | fail    | `doctor` exits 1                                                                                                  |
| Discovery answered but no family slot has a model                                     | fail    | `doctor` exits 1                                                                                                  |
| `--probe` and any family's completion failed                                          | fail    | `doctor` exits 1                                                                                                  |

`doctor` exits 0 only when every term passes (Node version, an auth method, the MCP server, install freshness, scratch space, the CLIs and the gateway), and 1 otherwise.

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
| A slot runs the local CLI, not the gateway                                                  | An installed, authenticated CLI serves its own slot first. To route that family through the gateway, set `NEXUS_DISABLED_CLIS=<cli>`; `doctor --gateway` then shows the slot as served by the gateway.                                                      |
| Budget gates skip the gateway                                                               | Declare `NEXUS_GATEWAY_COST`, e.g. `openai-compat=free`, or `openai-compat=priced:<in>,<out>` if the gateway meters usage.                                                                                                                                  |
| A setting "does nothing"                                                                    | The MCP server's environment is fixed when the harness spawns it. Restart the harness (or its MCP server) after changing a variable.                                                                                                                        |

## Related

- [CONFIGURATION.md](../getting-started/CONFIGURATION.md) — every `NEXUS_*` variable
- [HARNESS_COMPATIBILITY.md](./HARNESS_COMPATIBILITY.md) — harness wiring and voter transport
- [CUSTOM_ENDPOINT_SETUP.md](./CUSTOM_ENDPOINT_SETUP.md) — single-model SDK path and OpenCode transport
- [MODEL_REGISTRY_PRICING.md](./MODEL_REGISTRY_PRICING.md) — decorated gateway model names and pricing
- [SANDBOXED-USAGE.md](./SANDBOXED-USAGE.md) — the gateway inside a container

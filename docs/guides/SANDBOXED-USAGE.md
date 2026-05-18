---
title: 'Sandboxed Usage'
description: Run nexus-agents inside Docker, restricted-FS sandboxes, and team-distribution flows; OpenCode-in-Docker + OpenAI-compat gateway scenario.
tier: 2
keywords:
  [
    sandbox,
    portable,
    docker,
    container,
    team,
    distribution,
    getting-started,
    opencode,
    mcp,
    openai-compat,
    gateway,
    NEXUS_SANDBOX,
    NEXUS_OPENCODE_CONFIG,
  ]
---

# Sandboxed Usage

How to run nexus-agents inside Docker containers, restricted-filesystem sandboxes, and team-distribution flows where the home directory may be read-only.

## TL;DR

Inside most container / sandbox environments, **nexus-agents auto-detects and announces** the switch to portable mode:

```text
[portable-mode] Sandbox detected (container-env). Using /work/.nexus-agents for all nexus-agents data.
                Set NEXUS_PORTABLE_MODE=0 to override; see docs/guides/SANDBOXED-USAGE.md
```

If you see this on stderr, the auto-detection worked and your nexus-agents data lives in `<cwd>/.nexus-agents/`. No action needed.

## How auto-detection works

Resolution order (first match wins):

1. **`NEXUS_DATA_DIR` set** → respected as-is, no auto-detection. Operator override.
2. **`NEXUS_PORTABLE_MODE=0`** → never portable, no auto-detection. Operator opt-out.
3. **`NEXUS_PORTABLE_MODE=1`** → always portable, **silent** (no announcement — operator already knows).
4. **Heuristic: home directory not writable** → portable mode, announces.
5. **Heuristic: container env vars set** — portable mode, announces. Detected vars:
   - `KUBERNETES_SERVICE_HOST`
   - `DOCKER_CONTAINER`
   - `ECS_CONTAINER_METADATA_URI` and `ECS_CONTAINER_METADATA_URI_V4`
   - `SANDBOX`
   - `NEXUS_SANDBOX`

When portable mode triggers, nexus-agents:

- Sets `NEXUS_DATA_DIR` to `<cwd>/.nexus-agents/`
- Announces the switch on stderr (one line, the first time it fires)
- If `<cwd>` is a git repository, appends `.nexus-agents/` to the project's `.gitignore` (idempotent — won't duplicate)

## Forcing the behavior you want

| You want                                     | Set this                        |
| -------------------------------------------- | ------------------------------- |
| Specific data directory                      | `NEXUS_DATA_DIR=/some/abs/path` |
| Force portable mode (always)                 | `NEXUS_PORTABLE_MODE=1`         |
| Disable auto-detect (use `~/.nexus-agents/`) | `NEXUS_PORTABLE_MODE=0`         |
| Default (auto-detect)                        | (no env vars)                   |

## Common scenarios

### Docker container with project mounted at `/work`

```bash
docker run --rm -v "$(pwd)":/work -w /work -e DOCKER_CONTAINER=1 \
  node:22 bash -c "npx nexus-agents auth status"
```

Output:

```text
[portable-mode] Sandbox detected (container-env). Using /work/.nexus-agents...
Nexus Agents — CLI authentication status
=========================================
  ⚠  Claude Code    needs login     ...
```

### Restricted-filesystem sandbox (cwd-only writes)

If the sandbox blocks writes to `~/`, the `home-unwritable` heuristic fires automatically. Same `[portable-mode]` announcement appears.

### Team distribution: one workspace, multiple teammates

Use `nexus-agents init --portable` once at the workspace root:

```bash
nexus-agents init --portable
```

This scaffolds `<cwd>/.nexus-agents/` and configures the project so every teammate cloning into the same workspace gets the same data layout. Pair with `init --portable --install` if your team wants a one-command setup.

The `init --portable` flow respects whatever `NEXUS_DATA_DIR` is set to, so it composes cleanly with the auto-detection above.

## Troubleshooting

### "Failed to write to ./.nexus-agents/..."

The sandbox is more restrictive than auto-detection caught. Set `NEXUS_DATA_DIR` to an absolute path you know is writable:

```bash
export NEXUS_DATA_DIR=/work/data/nexus
nexus-agents <cmd>
```

### Auto-detect didn't fire but I'm in a sandbox

Add the appropriate container env var to your launcher (`SANDBOX=1` works as a generic signal), or set `NEXUS_PORTABLE_MODE=1` explicitly.

### My CI is hitting auto-detect when I don't want it to

Set `NEXUS_PORTABLE_MODE=0` in CI's environment. The opt-out wins over every heuristic.

### Auto-gitignore isn't happening

It only fires when `<cwd>` is a git repository (has a `.git/` directory). nexus-agents doesn't ancestor-walk for `.git` discovery — see [#2301](https://github.com/nexus-substrate/nexus-agents/issues/2301) for the deferred design pass on safe ancestor walking. If you're in a subdirectory of a git repo, run nexus-agents from the repo root or add `.nexus-agents/` to `.gitignore` manually.

## What's NOT touched by portable mode

- `~/.claude/` (Claude Code CLI's own data)
- `~/.gemini/` (Gemini CLI's own data)
- `~/.config/opencode/` (OpenCode's own data)

These are third-party CLI configurations that those CLIs expect at fixed locations. nexus-agents reads them via the auth probe (#2447) but doesn't redirect them — that's the third-party CLI's contract.

## Verification

Inside any sandbox, run:

```bash
nexus-agents auth status
nexus-agents doctor
```

Both should complete without errors. The first invocation triggers the `[portable-mode]` announcement (if auto-detected) and the `.nexus-agents/` directory is created lazily by whichever subsequent command first writes data.

## OpenCode-in-Docker + OpenAI-compat gateway (epic #2500)

The portable-mode flow above covers the "I'm running nexus-agents directly in a sandbox" case. This section covers the more specific scenario where **nexus-agents is loaded as an MCP by OpenCode running inside a Docker sandbox**, with a custom OpenAI-compatible gateway proxying upstream provider keys at the host boundary.

> Source: epic [#2500](https://github.com/nexus-substrate/nexus-agents/issues/2500), shipped across [#2501](https://github.com/nexus-substrate/nexus-agents/issues/2501)–[#2505](https://github.com/nexus-substrate/nexus-agents/issues/2505).

### Architecture

```text
┌─ Host ──────────────────────────────────────────────────────┐
│  Workspace key proxy (LiteLLM / OpenRouter / vLLM / …)      │
│   → injects upstream provider keys before forwarding        │
│   → exposes /v1/models + /v1/chat/completions               │
│                                                             │
│  $ docker run --rm -it \                                    │
│       -v /projects:/projects \                              │
│       -e NEXUS_SANDBOX_ROOT=/projects \                     │
│       -e NEXUS_OPENAI_COMPAT_URL=$WORKSPACE_PROXY_URL \      │
│       -e NEXUS_OPENAI_COMPAT_KEY=$WORKSPACE_PROXY_KEY \      │
│       nexus-sandbox:latest opencode .                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ Container ─────────────────────────────────────────────────┐
│  /projects/{repo1, repo2, repo3, .nexus-agents/}            │
│                                                             │
│  OpenCode (entrypoint)                                      │
│    └─ spawns nexus-agents MCP via opencode.json             │
│        ├─ NEXUS_SANDBOX=docker-opencode                     │
│        ├─ NEXUS_DATA_DIR=/projects/.nexus-agents            │
│        ├─ NEXUS_OPENCODE_CONFIG=~/.config/opencode/...      │
│        └─ NEXUS_OPENAI_COMPAT_URL/KEY (passthrough)         │
│                                                             │
│  At startup, nexus-agents:                                  │
│    1. detectSandbox() → active=true, flavor=docker-opencode │
│    2. tryWireGatewayAdapter() → probe /v1/models            │
│    3. fail-fast if gateway unreachable                      │
│    4. log "gateway wired: <baseURL>, N models discovered"   │
└─────────────────────────────────────────────────────────────┘
```

### Build the image

`Dockerfile.sandbox` extends `docker/sandbox-templates:opencode` (the official OpenCode template) and bakes nexus-agents in alongside.

```bash
docker build -f Dockerfile.sandbox -t nexus-sandbox:latest .
```

The image sets `ENV NEXUS_SANDBOX=docker-opencode` so nexus-agents knows it's running inside a host-provided sandbox at startup ([#2501](https://github.com/nexus-substrate/nexus-agents/issues/2501)).

### Configure the workspace key proxy on the host

Don't put upstream provider keys in the image or pass them into the container. Run a workspace key proxy on the host that:

- Accepts requests from the sandbox at `WORKSPACE_PROXY_URL` authenticated by `WORKSPACE_PROXY_KEY` (an opaque per-sandbox token you generate).
- Injects the real upstream provider key before forwarding.
- Exposes the standard OpenAI Chat Completions surface (`/v1/models`, `/v1/chat/completions`).

Project-specific implementations include LiteLLM, OpenRouter's BYOK gateway, vLLM with API-key middleware, or a hand-rolled httpx proxy. The contract for the sandbox is one URL, one workspace key, OpenAI-compat models.

### Run the sandbox

```bash
docker run --rm -it \
  -v /path/to/your/projects:/projects \
  -e NEXUS_SANDBOX_ROOT=/projects \
  -e NEXUS_OPENAI_COMPAT_URL=$WORKSPACE_PROXY_URL \
  -e NEXUS_OPENAI_COMPAT_KEY=$WORKSPACE_PROXY_KEY \
  nexus-sandbox:latest opencode .
```

`NEXUS_SANDBOX_ROOT=/projects` tells nexus-agents this is the multi-repo root. State goes at `/projects/.nexus-agents/`, shared across all repo subfolders. `NEXUS_DATA_DIR` is unset on the host — the sandbox-mode default places state at `${NEXUS_SANDBOX_ROOT}/.nexus-agents/`.

### opencode.json layout

`Dockerfile.sandbox` writes a default `opencode.json` at `/home/agent/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "providers": {
    "openai-compat": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "{env:NEXUS_OPENAI_COMPAT_URL}",
        "apiKey": "{env:NEXUS_OPENAI_COMPAT_KEY}"
      }
    }
  },
  "mcp": {
    "nexus-agents": {
      "type": "local",
      "command": ["node", "/opt/nexus-agents/dist/cli.js", "--mode=server"],
      "enabled": true,
      "environment": {
        "NEXUS_SANDBOX": "{env:NEXUS_SANDBOX}",
        "NEXUS_DATA_DIR": "{env:NEXUS_DATA_DIR}",
        "NEXUS_OPENAI_COMPAT_URL": "{env:NEXUS_OPENAI_COMPAT_URL}",
        "NEXUS_OPENAI_COMPAT_KEY": "{env:NEXUS_OPENAI_COMPAT_KEY}",
        "NEXUS_OPENCODE_CONFIG": "/home/agent/.config/opencode/opencode.json"
      }
    }
  }
}
```

`{env:VAR}` is OpenCode's interpolation syntax — substitution happens when OpenCode reads the file, so values flow through to the MCP environment block at spawn time.

`NEXUS_OPENCODE_CONFIG` is the bridge that lets nexus-agents read the gateway config from `opencode.json` directly ([#2503](https://github.com/nexus-substrate/nexus-agents/issues/2503)). Precedence: `NEXUS_OPENAI_COMPAT_URL/KEY` env vars > opencode.json > unconfigured.

### Fail-fast behaviour

When sandbox mode is active and the gateway is misconfigured, nexus-agents fails fast at startup ([#2502](https://github.com/nexus-substrate/nexus-agents/issues/2502)):

- Missing env vars (and no `NEXUS_OPENCODE_CONFIG`-pointed file with `providers.openai-compat`): exit, error names the missing env vars + this doc.
- `/v1/models` probe fails: exit, error includes the HTTP failure.
- Gateway returns zero models: exit.

This is intentional — there's no human at a CLI prompt inside the container to diagnose later, so a misconfigured gateway should surface at first boot, not on the operator's first orchestrate call.

### Validating it works

From inside the running container:

```bash
nexus-agents doctor
```

The doctor output now includes a "Sandbox awareness" section ([#2501](https://github.com/nexus-substrate/nexus-agents/issues/2501)) when active. Look for:

- `✓ Sandbox flavor: docker-opencode`
- `NEXUS_SANDBOX_ROOT: /projects` (your mounted root)
- No mismatch warning (heuristic agrees: `/.dockerenv` present)
- No `dataDirInsideRepo` warning (state at the multi-repo root, not inside a single repo)

For a quick orchestrator probe:

```bash
nexus-agents orchestrate -t "Say hello"
```

The first call hits the gateway and returns from one of the configured upstream models.

### Adding nexus-agents to an existing opencode.json

If you're not using `Dockerfile.sandbox` directly — e.g., you have an existing `opencode.json` with your own provider config and want to add nexus-agents to it — run:

```bash
nexus-agents init --opencode /path/to/opencode.json --dry-run
```

This shows the proposed merge without writing. Drop `--dry-run` to commit. The merge ([#2504](https://github.com/nexus-substrate/nexus-agents/issues/2504)) preserves every existing key. Re-running is idempotent. Operator overrides like `enabled: false` are preserved across re-runs.

### OpenCode-specific troubleshooting

**"Sandbox mode active but NEXUS_OPENAI_COMPAT_URL / NEXUS_OPENAI_COMPAT_KEY are not set"** — Either pass the env vars when running the container, or set `NEXUS_OPENCODE_CONFIG` to point at an `opencode.json` whose `providers.openai-compat.options` resolves to a real URL + key.

**Gateway probe fails** — From inside the container, `curl -H "Authorization: Bearer $NEXUS_OPENAI_COMPAT_KEY" $NEXUS_OPENAI_COMPAT_URL/v1/models`. If that fails, the workspace key proxy isn't reachable from the sandbox network. Check outbound network access to the proxy host and that the proxy is bound to an interface the container can reach.

**"Mock orchestration" warnings appearing post-upgrade** — Older `Dockerfile.sandbox` builds set `NEXUS_ALLOW_MOCK_ORCHESTRATION=true` as a band-aid for the unwired gateway. With the gateway now wired ([#2502](https://github.com/nexus-substrate/nexus-agents/issues/2502)), drop that env var — orchestration uses real LLM calls. Mock-orchestration is heuristic-based and silently produces non-LLM results; leaving it on after the gateway is configured will mask real routing decisions.

## Related

- [Installation](./INSTALLATION.md) — initial install path
- [Configuration](./CONFIGURATION.md) — env vars, config files, model selection
- [#2467 epic](https://github.com/nexus-substrate/nexus-agents/issues/2467) — the umbrella for OpenAI-compat gateway support, sandbox-safe operation, and reliability hardening
- [#2500 epic](https://github.com/nexus-substrate/nexus-agents/issues/2500) — MCP-in-sandbox: full functionality with OpenCode + OpenAI-compat gateway
- [`Dockerfile.sandbox`](../../Dockerfile.sandbox) — the canonical image for the OpenCode-in-Docker scenario
- OpenCode's own [`opencode.json` reference](https://opencode.ai/docs/configuration)

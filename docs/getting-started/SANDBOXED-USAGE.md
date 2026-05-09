---
title: 'Sandboxed Usage'
description: Run nexus-agents inside Docker, restricted-FS sandboxes, and team-distribution flows.
tier: 2
keywords: [sandbox, portable, docker, container, team, distribution, getting-started]
---

# Sandboxed Usage

How to run nexus-agents inside Docker containers, restricted-filesystem sandboxes, and team-distribution flows where the home directory may be read-only.

## TL;DR

Inside most container / sandbox environments, **nexus-agents auto-detects and announces** the switch to portable mode:

```text
[portable-mode] Sandbox detected (container-env). Using /work/.nexus-agents for all nexus-agents data.
                Set NEXUS_PORTABLE_MODE=0 to override; see docs/getting-started/SANDBOXED-USAGE.md
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

It only fires when `<cwd>` is a git repository (has a `.git/` directory). nexus-agents doesn't ancestor-walk for `.git` discovery — see [#2301](https://github.com/williamzujkowski/nexus-agents/issues/2301) for the deferred design pass on safe ancestor walking. If you're in a subdirectory of a git repo, run nexus-agents from the repo root or add `.nexus-agents/` to `.gitignore` manually.

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

## Related

- [Installation](./INSTALLATION.md) — initial install path
- [Configuration](./CONFIGURATION.md) — env vars, config files, model selection
- [#2467 epic](https://github.com/williamzujkowski/nexus-agents/issues/2467) — the umbrella for OpenAI-compat gateway support, sandbox-safe operation, and reliability hardening

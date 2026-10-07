---
title: 'Which CLIs and keys do I need?'
description: 'What each nexus-agents feature needs (a coding CLI, an API key or a gateway), which CLIs serve voter seats, and what the doctor statuses mean.'
diataxis: reference
audience: user
order: 10
tier: 1
keywords: [requirements, api-keys, cli, gateway, voters, doctor, capability-matrix]
related_files:
  [
    ../guides/CORPORATE_GATEWAY.md,
    ../guides/REGISTER_MCP_SERVER.md,
    ../architecture/VOTE_RESULTS.md,
  ]
---

# Which CLIs and keys do I need?

nexus-agents does not call models itself unless you give it a way to. It
reaches a model through one of three routes:

- **A coding CLI** you have installed and signed in to: `claude` (Claude Code),
  `codex` (Codex CLI), `gemini` (Gemini CLI, run as `agy`) or `opencode`.
- **A provider API key:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or
  `GOOGLE_AI_API_KEY`.
- **An OpenAI-compatible gateway:** `NEXUS_OPENAI_COMPAT_URL` (ending in `/v1`)
  and `NEXUS_OPENAI_COMPAT_KEY`. See
  [Corporate gateway](../guides/CORPORATE_GATEWAY.md).

## Feature requirements

"Yes" means the feature works with only that route configured.

| Feature                          | Claude CLI only          | Codex CLI only           | Gateway only                 | API key only                       |
| -------------------------------- | ------------------------ | ------------------------ | ---------------------------- | ---------------------------------- |
| `nexus-agents tour`              | yes                      | yes                      | yes                          | yes (needs nothing)                |
| `nexus-agents doctor`            | yes                      | yes                      | yes                          | yes                                |
| `run` MCP tool, `execute: false` | yes                      | yes                      | yes                          | yes (routing only, no model call)  |
| `consensus_vote` MCP tool        | yes                      | yes                      | yes, seats per model         | yes, one model in every seat       |
| `run` MCP tool, `execute: true`  | as the selected strategy | as the selected strategy | as the selected strategy     | as the selected strategy           |
| `nexus-agents vote`              | yes                      | yes                      | yes, one model in every seat | yes, one model in every seat       |
| `pr_review` MCP tool             | yes                      | yes                      | yes, seats per model         | yes, one model in every seat       |
| `nexus-agents orchestrate`       | yes                      | yes                      | yes                          | only with `NEXUS_BILLING_MODE=api` |
| `nexus-agents review`            | yes, plus a GitHub token | yes, plus a GitHub token | yes, plus a GitHub token     | yes, plus a GitHub token           |
| `research_discover` MCP tool     | yes                      | yes                      | yes                          | yes (queries public sources)       |

Notes:

- **`run` with `execute: true`** needs whatever the strategy it selects needs.
  For a consensus goal that is the `consensus_vote` row.
- **API key order.** When nexus-agents falls back to a single default adapter,
  it tries an installed CLI first, then `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
  `GOOGLE_AI_API_KEY`, then the gateway. `OPENROUTER_API_KEY` is not in that
  order.
- **Gateway seats.** Only the MCP server deals voter seats across the
  gateway's model families. `nexus-agents vote` on the command line does not,
  so with only a gateway every seat uses the default model.
- **No route at all.** A vote stops with `NoAdapterError` and exits 1;
  `orchestrate` stops with `No routing arms available`.

## Voter seats

A voter must be able to analyse a proposal without changing files. A CLI
serves voter seats only if its adapter enforces read-only analysis.

| CLI            | Serves voter seats | Reason                                   |
| -------------- | ------------------ | ---------------------------------------- |
| `claude`       | yes                | enforces read-only analysis              |
| `codex`        | yes                | enforces read-only analysis              |
| `gemini`       | no                 | its plan mode was observed writing files |
| `opencode`     | no                 | does not enforce read-only analysis      |
| API key        | yes                | the API adapter has no file access       |
| Gateway models | yes                | when the gateway serves the slot         |

- Seats are dealt round-robin over the eligible CLIs. With two eligible CLIs,
  a seven-voter panel mixes both families.
- With zero or one eligible CLI, every seat uses the same default adapter.
- `NEXUS_VOTER_MODEL_<ROLE>` (for example `NEXUS_VOTER_MODEL_ARCHITECT`) pins a
  seat to a gateway model. It applies only when a gateway serving more than
  one model is active; otherwise it is ignored and the result says why.
- `NEXUS_DISABLED_CLIS` removes CLIs from the CLI path. It does not affect
  gateway seats.
- Panels: seven roles by default (`architect`, `security`, `devex`, `ai_ml`,
  `pm`, `catfish`, `scope_steward`); `--quick` uses three (`architect`,
  `security`, `scope_steward`).

## `nexus-agents doctor` statuses

`doctor` makes no model calls unless you pass `--live`.

### Symbols

| Symbol | Windows | Meaning                                       |
| ------ | ------- | --------------------------------------------- |
| `✓`    | `[OK]`  | healthy                                       |
| `⚠`    | `[!]`   | warning; works, or might, but needs attention |
| `✗`    | `[X]`   | failing                                       |
| `○`    |         | not present or not applicable here            |

In the data-directory list, `·` marks a missing directory and `!` one that is
not writable.

### CLI blocks

Each CLI gets a block like this one, from a real run:

```text
✓ Claude CLI
  Version: 2.1.292 (supported)
  Auth: CLI auth
  Capacity: unknown (no usage observed this session)
  Auth evidence: artifact (claude credentials file)
```

| Header | Meaning                                                     |
| ------ | ----------------------------------------------------------- |
| `✓`    | installed, authenticated, and not on an unsupported version |
| `⚠`    | installed but outdated or not verifiably authenticated      |
| `✗`    | not installed, unsupported, or not authenticated            |

| `Auth:` value                                | Meaning                                               |
| -------------------------------------------- | ----------------------------------------------------- |
| `CLI auth` (`ADC/CLI auth` for Gemini)       | the CLI is signed in                                  |
| `unverified (no non-interactive auth check)` | the CLI has no way to check sign-in without prompting |
| `Not authenticated`                          | the CLI is not signed in, or not installed            |

`Version:` reads `supported`, `outdated`, `unsupported` or `breaking`.

### Other lines

| Line                          | Meaning                                                               |
| ----------------------------- | --------------------------------------------------------------------- |
| `API keys configured: N of 3` | how many of the three provider keys are set; zero is a warning        |
| `Configuration file`          | `Not found` is a warning; defaults apply                              |
| `MCP Server mode: Ready`      | `nexus-agents --mode=server` can start                                |
| `Voter transport`             | how voters are run: CLI subprocesses, or in-process through a gateway |
| `Data directory layout`       | the resolved per-repo and cross-repo state directories                |

### Exit code and summary

`doctor` exits 0 and prints `Status: Ready` only when every check passes,
including every detected CLI. Otherwise it exits 1 and prints
`Summary: N issue(s) found (...)` naming the failing checks, for example:

```text
Summary: 2 issue(s) found (CLI gemini, CLI opencode)
```

A failing CLI you do not use still makes the exit code 1. To use nexus-agents
you need at least one working route from the table above, not a clean
summary.

| Flag        | Effect                                                                 |
| ----------- | ---------------------------------------------------------------------- |
| `--live`    | one bounded model call per configured adapter; a failure exits nonzero |
| `--deep`    | learning-loop, data-sufficiency and routing diagnostics                |
| `--fix`     | fixes correctable issues (data directories, config)                    |
| `--gateway` | gateway report; add `--probe` for one model call per family            |
| `--verbose` | detailed check output                                                  |

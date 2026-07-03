---
title: 'Configuration Guide'
description: Configure nexus-agents with YAML files, environment variables, and programmatic options
tier: 2
keywords: [configuration, yaml, environment, settings, options, getting-started]
---

# Configuration

Configure nexus-agents with YAML files, environment variables, and programmatic options.

## Configuration Precedence

The loader selects **one** config file — the **first match wins**, it does NOT merge multiple files:

1. `NEXUS_CONFIG_PATH` (explicit path), else
2. **Project config** — `./.nexus-agents/nexus-agents.yaml` or `./nexus-agents.yaml` (current directory), else
3. **User config** — `~/.nexus-agents/nexus-agents.yaml`

Whatever single file is selected is layered over the built-in **defaults**. Then **environment variables** (`NEXUS_*`) overlay the result **per-setting at consumption time** — so an env var overrides just that one key, and env vars (not a second config file) are the right tool for machine-local overrides. See [Configuration for Reusable Pipelines](#configuration-for-reusable-pipelines) for the project-vs-local split.

## Quick Setup

Generate a starter configuration file:

```bash
nexus-agents config init
```

This creates `nexus-agents.yaml` with sensible defaults.

## Configuration File

The main configuration file is `nexus-agents.yaml`:

> **Note:** Model IDs below come from the in-tree ModelRegistry — they are what nexus-agents recognises out of the box. The full list lives in `packages/nexus-agents/src/config/in-tree-data.ts`; supported IDs include `claude-opus` / `claude-sonnet` / `claude-haiku`, `gemini-3-pro` / `gemini-3-flash`, `codex-5.3` / `codex-5.2` / `codex-5.1-mini`, plus `opencode-*` and `openrouter-*` variants. To use a model outside this set (e.g. an OpenAI-compatible gateway), see the `NEXUS_CUSTOM_MODEL` env var below.

```yaml
# nexus-agents.yaml

# Model configuration — use latest models from each provider
models:
  # Default model for general tasks
  default: claude-sonnet

  # Model tiers for routing
  tiers:
    fast:
      - claude-haiku
      - codex-5.1-mini
      - gemini-3-flash
    balanced:
      - claude-sonnet
      - codex-5.2
      - gemini-3-pro
    powerful:
      - claude-opus
      - codex-5.3
      - gemini-3-pro

# Expert configuration
experts:
  # Enable built-in experts (code, architecture, security, performance, research)
  builtin: true

  # Custom expert definitions
  custom:
    rust_expert:
      prompt: |
        You are a Rust expert specializing in systems programming,
        memory safety, and performance optimization. You follow the
        Rust API Guidelines and prefer idiomatic solutions.
      tier: powerful
      tools:
        - read_file
        - write_file
        - execute_command

    react_expert:
      prompt: |
        You are a React expert specializing in modern React patterns,
        hooks, and performance optimization. You follow React best
        practices and prefer functional components.
      tier: balanced

# Routing configuration
routing:
  # Enable three-stage routing pipeline
  enableBudgetFilter: true
  enableTopsisRanking: true
  enableLinUCBSelection: true

  # Budget constraints
  budget:
    tokenBudget: 1000000 # Session token limit
    costBudgetUsd: 10.0 # Session cost limit
    resetIntervalMs: 3600000 # 1 hour reset

  # TOPSIS multi-criteria weights
  topsis:
    qualityWeight: 0.5
    costWeight: 0.3
    latencyWeight: 0.2

  # LinUCB bandit configuration
  linucb:
    alpha: 1.0 # Exploration parameter

# Memory configuration
memory:
  # Session memory
  session:
    maxEntries: 1000
    ttlMs: 86400000 # 24 hours

  # Graph memory
  graph:
    enabled: true
    maxNodes: 10000
    maxEdges: 50000

  # Typed memory (MIRIX six-type system)
  typed:
    enabled: true
    pruneThreshold: 0.3

# Security configuration
security:
  # Allowed paths for file operations
  allowedPaths:
    - ./
    - /tmp

  # Sandbox execution mode: none, policy, container
  sandbox:
    mode: policy
    fallbackMode: none
    resourceLimits:
      memory: 512m
      cpu: 2
      timeout: 300s
      maxProcesses: 10

  # Rate limiting
  rateLimit:
    enabled: true
    requestsPerMinute: 60

# Workflow configuration
workflows:
  # Directory containing workflow templates
  templateDir: ./workflows

  # Maximum parallel steps
  maxParallelSteps: 5

  # Step timeout
  stepTimeoutMs: 300000 # 5 minutes

# Logging configuration
logging:
  level: info # debug, info, warn, error
  format: json # json, pretty
  file: null # Optional log file path
```

## Environment Variables

All configuration can be overridden with environment variables:

### Core Variables

| Variable                         | Description                                                                                                                                                                                                                                                                                                     | Default                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `NEXUS_CONFIG_PATH`              | Path to config file                                                                                                                                                                                                                                                                                             | `./nexus-agents.yaml`     |
| `NEXUS_LOG_LEVEL`                | Logging level (`debug` / `info` / `warn` / `error`)                                                                                                                                                                                                                                                             | `info`                    |
| `NEXUS_CONSOLE`                  | Force `console.*` on/off. `0` always off; `1` always on; unset → on for CLI, off for stdio-MCP, on for HTTP-MCP                                                                                                                                                                                                 | unset                     |
| `NEXUS_DATA_DIR`                 | Explicit runtime data root. Overrides the per-repo/cross-repo split (#2872)                                                                                                                                                                                                                                     | per-repo `.nexus-agents/` |
| `NEXUS_REPO_PREFERRED`           | `0` opts out of the per-repo data dir (epic #2872)                                                                                                                                                                                                                                                              | `1`                       |
| `NEXUS_PORTABLE_MODE`            | Force portable (sandbox-friendly) data dir. `0` opts out of auto-detect; `1` forces on; unset → heuristic (writable home, container env vars)                                                                                                                                                                   | unset (heuristic)         |
| `NEXUS_GITIGNORE_AUTO`           | `0` silences the auto-append of `.nexus-agents/` to the repo's `.gitignore`                                                                                                                                                                                                                                     | `1`                       |
| `NEXUS_NO_SCAFFOLD`              | `1` disables scaffolding of missing `docs/` registry files on read                                                                                                                                                                                                                                              | unset                     |
| `NEXUS_CONTEXT_RETRIEVER_INJECT` | Inject `priorMemorySummary` from `ContextRetriever` into `orchestrate` inputs (#2792, #2921)                                                                                                                                                                                                                    | `0`                       |
| `NEXUS_CONTEXT_RANKED`           | `1` renders the unified cross-ranked memory prefix (`rankedMemories`) instead of per-backend sections; flag-off output is byte-identical (#3236)                                                                                                                                                                | `0`                       |
| `NEXUS_META_SHADOW_TRAIN`        | `1` feeds live `run` dispatch outcomes into the MetaOrchestrator shadow selector and persists them to `learning/meta-outcomes.jsonl` (feature values only, no task text) for cross-process learning; stays shadow-only — never alters what runs or feeds enforce. Requires learning persistence enabled (#3593) | `0`                       |
| `NEXUS_VERSION_CHECK`            | Startup warning if the build lags the latest published version (#3283); one npm-registry call. `0` disables; skips dev + CI                                                                                                                                                                                     | `1`                       |

### Model Provider Keys

| Variable                    | Description                                                                                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`         | Claude API key                                                                                                                                                              |
| `OPENAI_API_KEY`            | OpenAI API key                                                                                                                                                              |
| `GOOGLE_AI_API_KEY`         | Google AI (Gemini) API key                                                                                                                                                  |
| `GEMINI_API_KEY`            | Alias for `GOOGLE_AI_API_KEY` (checked by the Gemini auth probe when `GOOGLE_AI_API_KEY` is unset)                                                                          |
| `OPENROUTER_API_KEY`        | OpenRouter API key (for free-model adapters; also a path to Bedrock/Vertex/Azure — see [CLOUD_PROVIDERS.md](../guides/CLOUD_PROVIDERS.md))                                  |
| `OLLAMA_HOST`               | Ollama server URL (default: `http://localhost:11434`)                                                                                                                       |
| `NEXUS_CUSTOM_API_BASE_URL` | Custom OpenAI-compatible gateway base URL                                                                                                                                   |
| `NEXUS_CUSTOM_API_KEY`      | API key for the custom gateway                                                                                                                                              |
| `NEXUS_CUSTOM_MODEL`        | Model id for the custom gateway (default: `gpt-4o`, see #2208)                                                                                                              |
| `NEXUS_OPENAI_COMPAT_URL`   | Sandbox-mode OpenAI-compatible gateway URL (epic #2500, child #2503). Wins over `NEXUS_OPENCODE_CONFIG` when paired with `NEXUS_OPENAI_COMPAT_KEY`                          |
| `NEXUS_OPENAI_COMPAT_KEY`   | API key for the sandbox OpenAI-compat gateway (paired with `NEXUS_OPENAI_COMPAT_URL` — both required)                                                                       |
| `NEXUS_OPENCODE_CONFIG`     | Path to an `opencode.json` whose `providers.openai-compat.options.{baseURL,apiKey}` configures the OpenAI-compat adapter (fallback when the `_URL`/`_KEY` pair is unset)    |
| `SEMANTIC_SCHOLAR_API_KEY`  | Optional. Lifts research_discover's semantic_scholar source past the unauthenticated 429 ceiling (#2234). Apply at https://www.semanticscholar.org/product/api#api-key-form |

### Security Variables

| Variable                         | Description                                                                                                                                                                               | Default              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `NEXUS_SANDBOX`                  | Sandbox flavor; passed through to subprocess adapters (epic #2500)                                                                                                                        | unset                |
| `NEXUS_SANDBOX_ROOT`             | Sandbox root directory for the sandbox executor                                                                                                                                           | unset                |
| `NEXUS_SUBPROCESS_ENV_ALLOWLIST` | `0` disables the spawned-CLI env allowlist (#2865) entirely — full passthrough (minus `CLAUDECODE`). Blunt escape hatch; re-leaks cross-vendor keys. Prefer `NEXUS_SUBPROCESS_EXTRA_ENV`. | unset (allowlist on) |
| `NEXUS_SUBPROCESS_EXTRA_ENV`     | Comma/space-separated list of additional env-var **names** to forward to spawned CLIs, e.g. a custom gateway key (#4037). Keeps cross-vendor isolation; forwards only the named vars.     | unset                |
| `NEXUS_SENSITIVE_REFS`           | Comma/space-separated org/gov reference **terms** scrubbed from auto-filed issue text (#3382 opsec). Intentionally not hardcoded — set your org's terms here. Unset ⇒ no scrubbing.       | unset                |
| `NEXUS_RATE_LIMIT`               | Requests per minute                                                                                                                                                                       | `60`                 |
| `NEXUS_AUTH_ENABLED`             | Enable MCP auth (applies only to network transports; no effect on the default stdio MCP)                                                                                                  | `true`               |
| `NEXUS_AUTH_METHOD`              | Auth method                                                                                                                                                                               | `token`              |
| `NEXUS_DRIFT_ADVISORY`           | Model-string drift CI gate: any value except `0` (incl. unset) = advisory (warn); `0` = blocking (#2199). CI sets `0` to enforce.                                                         | unset (advisory)     |

### Orchestration Variables

| Variable                         | Description                                                                                                                                                                         | Default             |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `NEXUS_V2_MODE`                  | V2 pipeline mode (`off`/`partial`/`full`)                                                                                                                                           | `full`              |
| `NEXUS_AORCHESTRA`               | AOrchestra dynamic agent planning                                                                                                                                                   | `true`              |
| `NEXUS_AORCHESTRA_DISPATCH`      | AOrchestra worker dispatch                                                                                                                                                          | `true`              |
| `NEXUS_WORKER_MAX_CALLS`         | Max model calls per orchestrate invocation                                                                                                                                          | `6`                 |
| `NEXUS_MAX_CONCURRENT_EXPERTS`   | Expert pool semaphore capacity                                                                                                                                                      | `6`                 |
| `NEXUS_ALLOW_MOCK_ORCHESTRATION` | Allow mock orchestration (test/CI only)                                                                                                                                             | `false`             |
| `NEXUS_ALLOW_SIMULATE`           | Explicit opt-in (`1`) for `simulateVotes: true` outside test runners (demos only — simulated votes are random, #4170). Unset = such requests are rejected with a `permission` error | unset (fail closed) |

**`NEXUS_ALLOW_SIMULATE` scope notes (#4170).** Test-runner detection trusts `VITEST=true` / `NODE_ENV=test` — a server started with an inherited test environment therefore disables the ban. The gate covers the MCP tool surface (`consensus_vote`, `run_pipeline`, `run_dev_pipeline`, `pr_review`, `supply_chain_tradeoff_panel`); programmatic library consumers (e.g. `createAgentStages` / `executeVoting` via the package exports) sit below the gate by design.

**Scheduled `improvement_review` (#3229).** Periodically runs `improvement_review` server-side so its `signal.fitness_declined` fires without manual invocation, feeding the self-tuning loop:

| Variable                               | Description                                                                   | Default   |
| -------------------------------------- | ----------------------------------------------------------------------------- | --------- |
| `NEXUS_IMPROVEMENT_REVIEW_INTERVAL_MS` | Poll interval in ms. `0`/unset disables. Suggested opt-in: `21600000` (6h)    | `0` (off) |
| `NEXUS_IMPROVEMENT_REVIEW_FILE_ISSUES` | Whether the scheduled run files GitHub issues (separate opt-in — avoids spam) | `false`   |

The scheduled run is **analysis-only by default** (emits signals, files no issues); `NEXUS_IMPROVEMENT_REVIEW_FILE_ISSUES=true` is a deliberate, separate opt-in (the tool's 5-issues/run rate-limit + open-issue dedup are backstops, not the primary guard).

### Learning & Memory Variables

| Variable                  | Description                                               | Default  |
| ------------------------- | --------------------------------------------------------- | -------- |
| `NEXUS_PERSIST_LEARNING`  | Cross-session routing persistence                         | `true`   |
| `NEXUS_REFLECTIVE_MEMORY` | Reflective memory retrieval (`shadow`/`true`/`false`)     | `shadow` |
| `NEXUS_BILLING_MODE`      | Cost mode (`plan`=strongest model wins, `api`=cost-aware) | `plan`   |
| `NEXUS_TUNE_ENFORCE`      | Self-tuning loop: apply bounded routing demotions         | `true`   |

Outcomes and distilled routing rules persist to `~/.nexus-agents/learning/` — this is **cross-repo** state (shared across all your projects) and is not affected by the per-repo data dir (epic #2872). When persistence is enabled, `routingMemory`, `strategyDistillation`, and `preferenceRouting` also auto-enable (no separate config needed). Opt out with `NEXUS_PERSIST_LEARNING=false`.

**`NEXUS_TUNE_ENFORCE` — the self-tuning routing loop (epic #3143 / #3147).** The loop reacts to health signals (`signal.swarm_unhealthy` from SwarmObserver bottlenecks and adapter circuit-breaker failovers) by **demoting** an unhealthy CLI in routing. The same flag gates both the write (the `TuneStage` applies the demotion) and the read (the `CompositeRouter` folds it into candidate scoring), so the loop is **either fully live or fully shadow — never half-wired**.

- `true` (**enforce**, default since v2.96) — a `signal.swarm_unhealthy` applies a **bounded** routing demotion via the provenance-tagged `TuneAdjustmentStore`. Every demotion is recorded to the tamper-evident append-only audit chain as a `tune.demote` event (verify with `verify_audit_chain`; tamper-evident, not tamper-proof — see the [audit hash-chain threat model](../security/audit-hash-chain-threat-model.md)).
- `false` (**shadow**, opt-out) — the loop logs the demotion it _would_ apply and records it to the `intended` counter, but **routing is untouched**. Use this to disable auto-tuning fleet-wide, or to observe the would-be behavior first: `nexus-agents health` shows `applied` vs `intended` per CLI under "Self-Tuning Demotions".

The demotion is bounded by hard safety invariants so the loop is self-correcting, never a ratchet: **demotion-only** (a CLI is slowed, never boosted), **floored** at `0.5` (never zeroed out of routing — a sole-viable CLI is always still selectable), **capped** at `0.2` per step, and **time-decaying** linearly back to neutral over 30 minutes (a transient health blip auto-reverses). The channel is separate from the LinUCB real-outcome bandit. **Opt out** with `NEXUS_TUNE_ENFORCE=false`. See [Self-Tuning Loop](../architecture/EVENT_BUS_BOUNDARIES.md#the-self-tuning-loop-3143).

Files stored:

- `outcomes.jsonl` — Append-only JSONL of task outcomes
- `rules.json` — Atomic JSON snapshot of distilled routing rules

### Security & Governance Variables

| Variable                       | Description                                                                      | Default          |
| ------------------------------ | -------------------------------------------------------------------------------- | ---------------- |
| `NEXUS_ACCESS_POLICY_MODE`     | ClawGuard mode: `off` / `audit` / `confirm_risky` / `enforce` (#1977, #2279)     | `audit` (v2.50+) |
| `NEXUS_REPUTATION_GATING`      | Author-reputation tier gating: `off` / `audit` / `enforce` (#3122, epic #3118)   | `audit`          |
| `NEXUS_TASK_STATE_ENABLED`     | Structured task-state log + Magentic-One ledgers (`0`/`false` to disable, #2278) | enabled (v2.50+) |
| `NEXUS_CONTEXT_WARN_THRESHOLD` | Per-expert context-warning threshold (0..1]                                      | `0.85`           |

**`NEXUS_ACCESS_POLICY_MODE` graduation path:**

- `off` — bypass entirely; no policy enforcement, no audit logging
- `audit` (default since v2.50) — log every violation, block nothing. Collects telemetry to size the violation rate before flipping to a stricter mode
- `confirm_risky` (added v2.58) — graduated middle tier. Block violations on tools classified as risky (write/exec/network); log-and-allow violations on read-only tools. Use this to graduate from `audit` to `enforce` without breaking read-heavy workflows. Risky violations come back with a structured "would have required human approval" reason
- `enforce` — block every violation, regardless of risk classification

**`NEXUS_REPUTATION_GATING` graduation path:** mirrors the mode above for author-reputation tier demotion in `issue_triage` (epic #3118).

- `off` — reputation never affects the enforced trust tier
- `audit` (default) — reputation is computed and the would-be demotion is logged + surfaced (`trustAssessment.effectiveTrustTier`/`gatingMode`), but the **classifier** tier is enforced. Collects telemetry on the demotion rate before enforcing
- `enforce` — apply the reputation demotion at the policy gate (a suspicious author's tier-gated actions are blocked)

**Escape hatch:** in every mode the maintainer allowlist (Tier 1) is authoritative — reputation can never demote an allowlisted/owner author. To clear a false-positive demotion for a specific user, add them to the allowlist; to disable gating fleet-wide, set `off`.

### Timeout Variables

| Variable                  | Description                                                                                                                                                                                                                 | Default                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `NEXUS_VOTE_TIMEOUT_MS`   | Per-vote consensus timeout (ms). Clamped to `[30000, 600000]` (raised to 300s in #1640 — experts averaged 315s on complex proposals)                                                                                        | `300000`                             |
| `NEXUS_EXPERT_TIMEOUT_MS` | Expert handler timeout (ms). Clamped to `[30000, 900000]`; `execute_expert` floors at `120000`. Picked per-category — complex (architecture/security_review/planning/devops/documentation) override defaults to `complexMs` | `300000` standard / `600000` complex |
| `NEXUS_WORKER_TIMEOUT_MS` | Worker subprocess timeout (ms)                                                                                                                                                                                              | `60000`                              |

#### Central timeout authority (#3734)

Timeouts are **runaway-guards, not SLAs** — each MCP tool maps to an operation class with a generous upper bound (the historical 60s MCP default was accidental + punitive). The class an unclassified tool falls back to is `single-llm` (300s).

| Class             | Guard (default) | Covers                                                        |
| ----------------- | --------------- | ------------------------------------------------------------- |
| `interactive`     | `60000`         | fast local reads/writes (memory/query/list/get)               |
| `single-llm`      | `300000`        | one expert/delegate call; CPU-heavy local (extract/search)    |
| `multi-llm-panel` | `900000`        | parallel voters/reviewers (consensus_vote, pr_review, …)      |
| `pipeline`        | `1800000`       | multi-stage orchestration (run, orchestrate, run_pipeline, …) |
| `network-fetch`   | `120000`        | external discovery/catalog/repo fetches                       |
| `async-job-body`  | `3600000`       | the body of a backgrounded job (no request timeout)           |

| Variable                                 | Description                                                                                | Default   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ | --------- |
| `NEXUS_TIMEOUT_MULTIPLIER`               | Float scaling EVERY class guard. Clamped `[0.25, 10]`. `2` doubles every guard.            | `1`       |
| `NEXUS_TIMEOUT_CLASS_INTERACTIVE_MS`     | Override the `interactive` class guard (ms). Clamped `[1000, 7200000]`, then × multiplier. | `60000`   |
| `NEXUS_TIMEOUT_CLASS_SINGLE_LLM_MS`      | Override the `single-llm` class guard (ms).                                                | `300000`  |
| `NEXUS_TIMEOUT_CLASS_MULTI_LLM_PANEL_MS` | Override the `multi-llm-panel` class guard (ms).                                           | `900000`  |
| `NEXUS_TIMEOUT_CLASS_PIPELINE_MS`        | Override the `pipeline` class guard (ms).                                                  | `1800000` |
| `NEXUS_TIMEOUT_CLASS_NETWORK_FETCH_MS`   | Override the `network-fetch` class guard (ms).                                             | `120000`  |
| `NEXUS_TIMEOUT_CLASS_ASYNC_JOB_BODY_MS`  | Override the `async-job-body` class guard (ms).                                            | `3600000` |

Resolution: `clamp(envClassOverride ?? base, 1000, 7200000) * multiplier`, re-clamped to `MCP_TIMEOUTS.maxMs` (`3600000`). Explicit per-call and `security.perToolTimeout` overrides still win over the class guard.

### Infrastructure Variables

| Variable                          | Description                                                                                                                                                                             | Default   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `NEXUS_EVENTBUS_ENABLED`          | EventBus A2A bridge                                                                                                                                                                     | `true`    |
| `NEXUS_RATE_LIMIT_ENABLED`        | Token-bucket rate limiter                                                                                                                                                               | `true`    |
| `NEXUS_CIRCUIT_BREAKER_THRESHOLD` | Circuit breaker failure threshold                                                                                                                                                       | `5`       |
| `NEXUS_V2_POLICY_MODE`            | Policy enforcement (`off`/`warn`/`block`)                                                                                                                                               | `block`   |
| `NEXUS_AUTO_REMEDIATE`            | Autonomous remediation cycle (`off`/`audit`/`enforce`, #3653; default `audit` zero-write soak, #3769)                                                                                   | `audit`   |
| `NEXUS_POLICY_GATE_MODE`          | Stage-boundary policy gate (`off`/`warn`/`block`, #3177)                                                                                                                                | `warn`    |
| `NEXUS_JOB_RESULT_SOURCE`         | Async job-result reader source (`sidecar`/`task_state`, #3090/#3693): `task_state` prefers+unions the Stage-2 task-state log; reader half of the sidecar→Stage-2 migration (epic #2631) | `sidecar` |
| `NEXUS_MODELS_OVERLAY_PATH`       | Path to a model-registry overlay manifest (#3185 hot-reload)                                                                                                                            | _(unset)_ |
| `NEXUS_DISABLE_SESSIONS`          | Disable session tracking                                                                                                                                                                | `false`   |
| `NEXUS_DISABLE_METRICS`           | Disable metrics tracking                                                                                                                                                                | `false`   |

### Code-PR adapter activation (#3670) — ARMED but DORMANT

The autonomous code-PR adapter (#3670) is **built and owner-approved (2026-06-19)
but DORMANT**. It is "armed", not "active": the owner approval satisfies the
human-authorization gate, but it does **not** activate the push path. Activation
is **earned** through conjunctive, falsifiable, evidence-based gates — every one
must hold, and each is an independently checkable operational fact (never model
output, never "the owner said so").

A push is **impossible** unless ALL of the following conjunctive gates hold:

- **Enable flag** — the explicit OFF→on flag. There is **no enable env var** yet:
  the flag is passed in as the `flagEnabled` boolean on the readiness evidence
  (`CodePrEnableReadinessEvidence` / `CodePrPushReadiness.flagEnabled`), supplied by
  the operator wiring point that constructs the push input. The gate stays pure and
  reads no env for the flag.
- **Enable-vote ref** — a recorded enable-vote ref (`enableVoteRef`, non-empty),
  supplied on the readiness evidence alongside the named `owner` acknowledgement.
- **`NEXUS_CODEPR_TOKEN`** — a **least-privilege** scoped credential that may open a
  feature-branch PR ONLY. It **cannot** merge, push to `main`/`master`, force-push,
  or alter branch protections. It is an operator-provisioned env var read directly by
  the push seam (`CODEPR_TOKEN_ENV`), not part of the validated `validateNexusEnv`
  set; absent or empty ⇒ a hard `no_credentials` refusal.
- **`guardsGreenSoak ≥ 50`** — at least 50 **consecutive** clean (zero guard-denial)
  dry-run plans, accrued automatically by the `NEXUS_AUTO_REMEDIATE=audit` soak
  consumer. The streak is read from the durable soak store at push time, **not** from
  caller input — it cannot be forged.

> **Warning — setting the flag alone does NOT activate the adapter.** Flipping
> `flagEnabled` true (or recording the enable-vote, or provisioning the token) is
> necessary but **never sufficient**: every evidence gate above still applies, and
> any unmet gate fails closed. This is deliberate (per the DevX vote condition) so
> there is no "enabled but does nothing" confusion — the adapter is dormant until
> the soak is earned AND the scoped token is present AND the flag/vote/owner-ack are
> all recorded. Owner approval authorizes activation; it does not perform it.

See #3670 for the staged rollout (the push path is the gated capability; nothing
here wires it to a live runtime trigger).

### Removed in 2.82.0 (#2977)

These 8 env vars were declared but never read by any production code (silent
no-ops). They have been removed from the env-schema; setting them is now an
error from `validateNexusEnv`. If you had any of them set, just unset them:

`NEXUS_WORKERS_MAX`, `NEXUS_WORKERS_POOL_SIZE`, `NEXUS_WORKERS_IDLE_TIMEOUT`,
`NEXUS_WORKFLOW_MAX_PARALLEL`, `NEXUS_TEST_PARALLELISM`,
`NEXUS_EVALUATION_MAX_WORKERS`, `NEXUS_EVENTBUS_MAX_HISTORY`,
`NEXUS_SWARM_OBSERVER_MAX_EVENTS`.

The matching `WORKER_DEFAULTS.*` config-set keys are also gone; `config set
WORKER_DEFAULTS.foo X` now returns "key not found" instead of a false success.

### Removed (#4180)

Three more env vars from the same silent-no-op class, missed by the #2977 sweep,
were declared in the env-schema but never read by any production code. They have
been removed; `validateNexusEnv` now flags them as unknown. If you had any of
them set, just unset them:

`NEXUS_TEST_TIMEOUT_MS`, `NEXUS_TIMEOUT_CLISIMPLE`, `NEXUS_TIMEOUT_CLICOMPLEX`.

The matching (equally unread) `TIMEOUT_DEFAULTS.cliSimpleMs` /
`TIMEOUT_DEFAULTS.cliComplexMs` defaults keys are also gone. Per-complexity CLI
timeouts were never driven by these knobs — they flow through the internal
per-CLI `TIMEOUT_PROFILES` (`getTimeoutForCli`).

## Model Configuration

### Default Model

The default model is used when no specific model is requested:

```yaml
models:
  default: claude-sonnet
```

### Model Tiers

Models are organized into tiers for automatic routing:

```yaml
models:
  tiers:
    fast:
      - claude-haiku # Quick, simple tasks
      - codex-5.1-mini
    balanced:
      - claude-sonnet # Most tasks
      - codex-5.2
    powerful:
      - claude-opus # Complex reasoning
      - codex-5.3
```

The router selects the appropriate tier based on task complexity.

### Model-Specific Settings

Override settings for specific models:

```yaml
models:
  settings:
    claude-opus:
      temperature: 0.7
      maxTokens: 8192
    codex-5.3:
      temperature: 0.5
      maxTokens: 4096
```

## Expert Configuration

### Built-in Experts

Enable or disable built-in experts:

```yaml
experts:
  builtin: true # Enable code, architecture, security, performance, research
```

### Custom Experts

Define domain-specific experts:

```yaml
experts:
  custom:
    database_expert:
      prompt: |
        You are a database expert specializing in PostgreSQL,
        query optimization, and schema design. You follow
        database normalization principles and prefer
        efficient, maintainable solutions.
      tier: balanced
      tools:
        - read_file
        - execute_command
      capabilities:
        - sql_analysis
        - schema_design
        - query_optimization
```

### Expert Prompt Templates

> **Planned feature:** Variable interpolation in expert prompts (`{{variable}}` syntax) is not yet implemented. The `variables` key shown below is not currently processed by the runtime. This section describes the intended configuration shape.

```yaml
experts:
  custom:
    project_expert:
      prompt: |
        You are an expert for the {{project_name}} project.
        The project uses {{language}} and follows {{style_guide}}.
      variables:
        project_name: nexus-agents
        language: TypeScript
        style_guide: Google TypeScript Style Guide
```

## Routing Configuration

### Budget Constraints

Control cost and resource usage:

```yaml
routing:
  budget:
    tokenBudget: 1000000 # Max tokens per session
    costBudgetUsd: 10.0 # Max cost per session
    resetIntervalMs: 3600000 # Reset every hour
```

### TOPSIS Weights

Adjust multi-criteria optimization:

```yaml
routing:
  topsis:
    qualityWeight: 0.5 # Prioritize quality
    costWeight: 0.3 # Consider cost
    latencyWeight: 0.2 # Some latency tolerance
```

For cost-sensitive deployments:

```yaml
routing:
  topsis:
    qualityWeight: 0.3
    costWeight: 0.5
    latencyWeight: 0.2
```

### LinUCB Bandit

Control exploration vs exploitation:

```yaml
routing:
  linucb:
    alpha: 1.0 # Higher = more exploration
```

- `alpha: 0.5` - Conservative, prefer known-good models
- `alpha: 1.0` - Balanced exploration (default)
- `alpha: 2.0` - Aggressive exploration, try new combinations

### Advanced Routing Stages (Optional)

Enable optional routing stages for specialized use cases:

```yaml
routing:
  stages:
    # Confidence-based cascade routing (SATER-style escalation)
    confidenceCascade: false

    # Task capability matching (matches task requirements to model capabilities)
    capabilityMatch: false

    # Quality-constrained routing (RouteLLM-style cost/quality tradeoff)
    qualityConstraint: false
```

These stages are disabled by default for backward compatibility. Enable them to add additional routing intelligence:

| Stage               | Purpose                                            | Use When                   |
| ------------------- | -------------------------------------------------- | -------------------------- |
| `confidenceCascade` | Escalate to more powerful models on low confidence | Quality-sensitive tasks    |
| `capabilityMatch`   | Match task type to model capabilities              | Diverse task workloads     |
| `qualityConstraint` | Enforce quality thresholds with cost awareness     | Balancing quality and cost |

## Memory Configuration

### Session Memory

Configure conversation context:

```yaml
memory:
  session:
    maxEntries: 1000 # Max memories per session
    ttlMs: 86400000 # 24 hour TTL
    pruneStrategy: lru # Least recently used
```

### Graph Memory

Configure relationship tracking:

```yaml
memory:
  graph:
    enabled: true
    maxNodes: 10000
    maxEdges: 50000
    similarityThreshold: 0.6
```

### Typed Memory (MIRIX)

Configure six-type memory system:

```yaml
memory:
  typed:
    enabled: true
    types:
      core: true # Agent identity
      episodic: true # Task experiences
      semantic: true # Domain knowledge
      procedural: true # Learned workflows
      resource: true # External references
      vault: true # Persistent storage
    pruneThreshold: 0.3
```

## Security Configuration

### Sandbox Mode

Choose execution isolation level:

```yaml
security:
  sandbox:
    mode: policy # none, policy, container
    fallbackMode: none
```

| Mode        | Description       | Security         |
| ----------- | ----------------- | ---------------- |
| `none`      | No sandboxing     | Development only |
| `policy`    | Command allowlist | Medium           |
| `container` | Docker isolation  | High             |

### Resource Limits

For container mode:

```yaml
security:
  sandbox:
    resourceLimits:
      memory: 512m
      cpu: 2
      timeout: 300s
      maxProcesses: 10
```

### Rate Limiting

Protect against abuse:

```yaml
security:
  rateLimit:
    enabled: true
    requestsPerMinute: 60
    burstLimit: 10
```

### Authentication (Network Transport)

Configure authentication for network-exposed MCP transports:

```yaml
security:
  auth:
    enabled: true # Enable authentication
    method: token # 'token' or 'oauth2'
    tokenHeader: Authorization # Header name for bearer token
    tokenFile: ~/.nexus-agents/auth/server-token # Token file path (auth/ is cross-repo)
```

Generate and manage auth tokens with CLI commands:

```bash
# Generate initial token
nexus-agents auth init

# Show token status
nexus-agents auth show

# Rotate token (invalidate old, generate new)
nexus-agents auth rotate
```

> **Note:** Authentication is for network-exposed transports (HTTP, WebSocket). Stdio transport is inherently secure as it only communicates with the parent process.

## Workflow Configuration

### Template Directory

Specify where workflows are stored:

```yaml
workflows:
  templateDir: ./workflows
```

### Execution Limits

Control workflow behavior:

```yaml
workflows:
  maxParallelSteps: 5
  stepTimeoutMs: 300000
  maxRetries: 3
  retryDelayMs: 1000
```

## Programmatic Configuration

When using nexus-agents as a library:

```typescript
import { createServer, startStdioServer } from 'nexus-agents';

const result = await startStdioServer({
  name: 'my-server',
  version: '1.0.0',
  config: {
    models: {
      default: 'claude-sonnet',
    },
    routing: {
      enableLinUCBSelection: true,
      budget: {
        tokenBudget: 500000,
      },
    },
    security: {
      sandbox: {
        mode: 'policy',
      },
    },
  },
});
```

## Inspecting Configuration

View the resolved configuration (merging defaults, file, and environment variables):

```bash
nexus-agents config show
```

Read a specific key:

```bash
nexus-agents config get models.default
```

Set a key in the config file:

```bash
nexus-agents config set models.default claude-haiku
```

> **Note:** `nexus-agents config validate` does not exist. The valid subcommands are: `init`, `show`, `get`, `set`, `import`.

## Configuration Examples

### Cost-Optimized

Minimize API costs:

```yaml
models:
  default: claude-haiku

routing:
  budget:
    costBudgetUsd: 1.0
  topsis:
    qualityWeight: 0.3
    costWeight: 0.6
    latencyWeight: 0.1
```

### Quality-Focused

Maximize output quality:

```yaml
models:
  default: claude-opus

routing:
  budget:
    costBudgetUsd: 50.0
  topsis:
    qualityWeight: 0.7
    costWeight: 0.1
    latencyWeight: 0.2
```

### CI/CD Pipeline

Fast, secure, cost-aware:

```yaml
models:
  default: claude-sonnet

security:
  sandbox:
    mode: container
  rateLimit:
    enabled: true
    requestsPerMinute: 100

routing:
  budget:
    tokenBudget: 500000
    costBudgetUsd: 5.0

logging:
  level: warn
  format: json
```

## Configuration for Reusable Pipelines

A composed pipeline (research → vote → plan → run → review) inherits the same resolved config at every stage, so a single knob changes behavior fleet-wide. Three high-impact knobs and what they do across stages:

- **`NEXUS_BILLING_MODE`** — `plan` (default) zeroes model cost in scoring, so routing's `ZeroRouter`/TOPSIS stages pick the strongest model regardless of price; every voter, planner, and worker in the pipeline trends toward `claude-opus`-tier. `api` keeps cost-aware routing, so the same pipeline shifts toward cheaper tiers under the session budget. Verified in `decision-cost-recording.ts` (default `'plan'`) and `defaults.ts:298`.
- **`NEXUS_DATA_DIR` / `NEXUS_REPO_PREFERRED`** — per-repo state (`sessions`, `checkpoints`, `traces`, `runs`, `audit`, `pipeline`, `tasks`, `jobs`, `ci-health`, `governance`) lands in `<repo>/.nexus-agents/` when `NEXUS_REPO_PREFERRED=1` (default), so two checkouts keep independent run/audit history. `NEXUS_DATA_DIR` overrides the split entirely. Cross-repo state — `learning/`, `memory`, `voting`, `research`, `auth` — always resolves to `~/.nexus-agents/`, so the routing-feedback loop is shared across projects regardless (`nexus-data-dir.ts`). **Under the MCP server** the "repo" is the workspace the client declares via the MCP `roots` capability (no env var needed): a globally-installed server learns the active workspace root from the connected editor/agent at handshake time, so per-repo state still lands in `<repo>/.nexus-agents/` even though the server's own working directory is the npm global bin. Clients that don't advertise `roots` fall back to the server's working directory, then `~/.nexus-agents/` (`mcp/workspace-roots.ts`, #3991).
- **Model tiers + sandbox** — `models.tiers` (`fast`/`balanced`/`powerful`) and `models.default` feed the router at every stage; `security.sandbox.mode` (`none`/`policy`/`container`) bounds every `execute_command` the pipeline issues.

### Project-level vs user-level

The loader selects **one** config file (first match wins): `NEXUS_CONFIG_PATH`, then `./.nexus-agents/nexus-agents.yaml` or `./nexus-agents.yaml`, then `~/.nexus-agents/nexus-agents.yaml`. It does not merge a project file with a user file. Per-setting **environment variables** overlay the loaded file at consumption time, so use them — not a second file — for local overrides.

Commit the **project file** for shared, reproducible choices: `models.tiers`/`default`, `routing` weights, gate modes (`NEXUS_ACCESS_POLICY_MODE`, `NEXUS_POLICY_GATE_MODE`), and `security.sandbox.mode`. Keep **machine-specific** settings out of the repo and set them per-user via env: API keys (`ANTHROPIC_API_KEY`, …), `NEXUS_DATA_DIR`, `NEXUS_SANDBOX_ROOT`, and `NEXUS_BILLING_MODE`. Committed config defines the team's pipeline; each env var wins over it locally.

```yaml
# nexus-agents.yaml (committed)
models:
  default: claude-sonnet
  tiers:
    powerful: [claude-opus, codex-5.3]
security:
  sandbox: { mode: policy }
```

```bash
# each teammate, locally (not committed)
export ANTHROPIC_API_KEY=...
export NEXUS_BILLING_MODE=api   # cost-aware on a personal key
export NEXUS_DATA_DIR=/scratch/nexus
```

## Related Documentation

- [CLI Usage](../ENTRYPOINTS.md) - Use configuration in CLI commands
- [Workflow Templates](../guides/WORKFLOW_TEMPLATES.md) - Create custom workflows
- [Architecture Overview](../architecture/README.md) - Understand system design

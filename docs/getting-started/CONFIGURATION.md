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

  # TOPSIS multi-criteria ranking
  topsis:
    minQualityThreshold: 5 # 0-10; candidates below this are not ranked
    criteria: # weights must sum to 1.0
      - { name: quality, weight: 0.5, beneficial: true }
      - { name: cost, weight: 0.3, beneficial: false }
      - { name: latency, weight: 0.2, beneficial: false }

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

  # Coordinated decay across belief / agentic / adaptive / MobiMem (#5097)
  decay:
    enabled: true
    decayIntervalMs: 3600000 # 1 hour
    agenticMaxEntries: 10000

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

**Every `NEXUS_*` variable is validated at startup** against
`packages/nexus-agents/src/config/env-schema.ts`. A name the schema does not
recognize is reported as unknown, with a typo suggestion — including a name
that is correct and documented here but absent from the schema, which is how
`NEXUS_DATA_DIR` came to be flagged (#4722). A variable added to this document
must be added to the schema in the same change, and a test now cross-checks the
two lists so they cannot drift apart again.

### Core Variables

| Variable                         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Default                   |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `NEXUS_CONFIG_PATH`              | Path to config file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `./nexus-agents.yaml`     |
| `NEXUS_LOG_LEVEL`                | Logging level (`debug` / `info` / `warn` / `error`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `info`                    |
| `NEXUS_CONSOLE`                  | Force `console.*` on/off. `0` always off; `1` always on; unset → on for CLI, off for stdio-MCP, on for HTTP-MCP                                                                                                                                                                                                                                                                                                                                                                                                                              | unset                     |
| `NEXUS_DATA_DIR`                 | Explicit runtime data root. Overrides the per-repo/cross-repo split (#2872)                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | per-repo `.nexus-agents/` |
| `NEXUS_REPO_PREFERRED`           | Boolean: `false`/`0` opts out of the per-repo data dir (epic #2872). One accept-set since #5464 — `0` alone opted out before                                                                                                                                                                                                                                                                                                                                                                                                                 | `1`                       |
| `NEXUS_TMPDIR`                   | Scratch root for short-lived working files — throwaway worktrees, generated MCP configs, system-prompt files (#4412). Unset resolves to `<dataDir>/tmp`, inside the already-gitignored `.nexus-agents/` tree; falls back to `os.tmpdir()` if neither can be created                                                                                                                                                                                                                                                                          | `<dataDir>/tmp`           |
| `NEXUS_PORTABLE_MODE`            | Force portable (sandbox-friendly) data dir. `0` opts out of auto-detect; `1` forces on; unset → heuristic (writable home, container env vars)                                                                                                                                                                                                                                                                                                                                                                                                | unset (heuristic)         |
| `NEXUS_GITIGNORE_AUTO`           | Boolean (`true`/`1`, `false`/`0`); `false` silences the auto-append of `.nexus-agents/` to the repo's `.gitignore` (#5155)                                                                                                                                                                                                                                                                                                                                                                                                                   | `1`                       |
| `NEXUS_BUDGET_ENFORCE`           | Boolean (`true`/`1`/`false`/`0`): caps per-run token spend for `run_pipeline` (estimate-relative ceiling) and, since #4754, `run_workflow` (only when the call sets `maxTokens` — no estimated default, which would sit far below real step spend; otherwise `budget.status` is `not_enforced`. Checked before each phase and before each step is dispatched — steps already running are not halted, and a run where any step reported no usage is reported `unmeasured`). Previously only `1` was read; `=true` was a silent no-op (#5155). | `0`                       |
| `NEXUS_BUDGET_TOLERANCE`         | Overrun-tolerance multiplier for routing budget capping (`resolveBudgetTolerance`, #3262). Must be a float >= `1.0` (e.g. `1.5` allows up to 150% of nominal budget).                                                                                                                                                                                                                                                                                                                                                                        | `1.5`                     |
| `NEXUS_DYNAMIC_MODELS`           | Boolean (`true`/`1`/`false`/`0`): enable live model discovery as a registry source. Previously only `true` was read; `=1` was a silent no-op (#5155).                                                                                                                                                                                                                                                                                                                                                                                        | `0`                       |
| `NEXUS_NO_SCAFFOLD`              | `1` disables scaffolding of missing `docs/` registry files on read                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | unset                     |
| `NEXUS_CONTEXT_RETRIEVER_INJECT` | Boolean (`true`/`1` enables); inject `priorMemorySummary` from `ContextRetriever` into `orchestrate` / `execute_expert` inputs (#2792, #2921, #5155)                                                                                                                                                                                                                                                                                                                                                                                         | `0`                       |
| `NEXUS_CONTEXT_RANKED`           | `1` renders the unified cross-ranked memory prefix (`rankedMemories`) instead of per-backend sections; flag-off output is byte-identical (#3236)                                                                                                                                                                                                                                                                                                                                                                                             | `0`                       |
| `NEXUS_REPO_MAP`                 | `1` attaches a ranked, token-budgeted repo-map (module import graph, PageRank centrality) for structural tasks only; pull-shaped/rank-gated (never pushed onto every call), import-graph-only (no call-site data), flag-off output is byte-identical (#4254)                                                                                                                                                                                                                                                                                 | `0`                       |
| `NEXUS_LLM_CLASSIFICATION`       | Boolean: `true`/`1` permits an LLM call to classify a pipeline task when keyword scoring finds no evidence at all. Off by default: the gate guarding this call was unreachable until #4677 (a `Math.max(…, 1)` floor pinned confidence at 1/3 against a `< 0.2` gate), and measurement put the newly-reachable rate at ~60% of realistic goals — one LLM call each. Enabling it is a cost decision, not a restoration                                                                                                                        | `0`                       |
| `NEXUS_META_SHADOW_TRAIN`        | Boolean: `true`/`1` feeds live `run` dispatch outcomes into the MetaOrchestrator shadow selector and persists them to `learning/meta-outcomes.jsonl` (feature values only, no task text) for cross-process learning; stays shadow-only — never alters what runs or feeds enforce. Requires learning persistence enabled (#3593)                                                                                                                                                                                                              | `0`                       |
| `NEXUS_ROUTE_MODEL_SELECTION`    | Boolean: `true`/`1` lets the CompositeRouter resolve a concrete model from the computed difficulty tier at route time (`resolveModelForTier`, #3394)                                                                                                                                                                                                                                                                                                                                                                                         | `false`                   |
| `NEXUS_ROUTE_MODEL_SHADOW`       | Boolean: `true`/`1` records, per outcome-joined routing decision, the model the tier resolver WOULD have picked vs the model actually used, to `learning/model-selection-shadow.jsonl` (CLI slot, tier, model ids, success only — no task text) for the offline flip eval; shadow-only — never alters routing. The log is append-only/unbounded; readers apply a 30-day lookback (matches `meta-outcomes.jsonl`). Requires learning persistence enabled (#4197)                                                                              | `0`                       |
| `NEXUS_VERSION_CHECK`            | Startup warning if the build lags the latest published version (#3283); one npm-registry call. `0` disables; skips dev + CI                                                                                                                                                                                                                                                                                                                                                                                                                  | `1`                       |

### Model Provider Keys

| Variable                       | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`            | Claude API key                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `OPENAI_API_KEY`               | OpenAI API key                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `GOOGLE_AI_API_KEY`            | Google AI (Gemini) API key                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `GEMINI_API_KEY`               | Alias for `GOOGLE_AI_API_KEY` (checked by the Gemini auth probe when `GOOGLE_AI_API_KEY` is unset)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `OPENROUTER_API_KEY`           | OpenRouter API key (for free-model adapters; also a path to Bedrock/Vertex/Azure — see [CLOUD_PROVIDERS.md](../guides/CLOUD_PROVIDERS.md))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `OLLAMA_HOST`                  | Ollama server URL (default: `http://localhost:11434`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `NEXUS_CUSTOM_API_BASE_URL`    | **Deprecated** alias for `NEXUS_OPENAI_COMPAT_URL` (#4392); read only when the replacement is unset, and only by the single-model `custom-openai` path — see [Deprecated (#4392 increment 3)](#deprecated-4392-increment-3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `NEXUS_CUSTOM_API_KEY`         | **Deprecated** alias for `NEXUS_OPENAI_COMPAT_KEY` (#4392); read only when the replacement is unset, and only by the single-model `custom-openai` path                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `NEXUS_CUSTOM_MODEL`           | Model id for the single-model custom gateway path (default: `gpt-5.5`, `CUSTOM_API_DEFAULT_MODEL` in `config/defaults.ts`, #4408). Not deprecated. With a discovered gateway, the `claude`/`codex`/`gemini` slots no longer fall back to it: see `NEXUS_GATEWAY_MODEL_<FAMILY>` (#6604)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `NEXUS_GATEWAY_MODEL_<FAMILY>` | `NEXUS_GATEWAY_MODEL_ANTHROPIC`, `NEXUS_GATEWAY_MODEL_OPENAI`, `NEXUS_GATEWAY_MODEL_GOOGLE` (#6604). When the gateway (`NEXUS_OPENAI_COMPAT_URL`/`KEY`) was discovered, a `claude`, `codex` or `gemini` slot whose CLI is not installed is served by a gateway model of its own family: Anthropic, OpenAI or Google. By default the family's best model is used: models the registry has quality scores for first (highest `reasoning + codeGeneration`), then the rest by newest version. This variable pins the family's model instead. It must be a model id in the discovered catalogue that is not classified as another family; otherwise a warning is logged once and the default order applies. A slot whose family the gateway does not serve is unavailable (no router arm, no fallback to another family or to `NEXUS_CUSTOM_MODEL`), as with `NEXUS_DISABLED_CLIS`. The mapping is logged at startup. Without a discovered gateway nothing changes                                                                                                                                                                    |
| `NEXUS_GATEWAY_COST`           | What a gateway arm costs (#4392): `free` \| `local` \| `priced` \| `priced:<inputPer1M>,<outputPer1M>`, optionally endpoint-scoped as `endpoint=decl[;endpoint=decl]` with at most one bare declaration applying to every gateway. `free`/`local` price at $0; bare `priced` uses the registry rate of the model the gateway lists first, or of `NEXUS_CUSTOM_MODEL` for `api:custom-openai` — with neither it is fail-closed like UNDECLARED, never the display slot's rate (#6404); `priced:<in>,<out>` is a flat per-1M rate. **Unset or invalid means UNDECLARED**: the task-class cost ceiling and the per-task budget (`checkBudget`, #6393) both exclude the gateway (fail-closed) and `doctor` warns; the exclusion is recorded on `BudgetRoutingResult.unpricedArms` with its reason. `nexus-agents init --opencode` writes `openai-compat=free` into the MCP block it generates — scoped to the `providers.openai-compat` gateway the bridge reads, not a bare `free`; edit the value in `mcp.nexus-agents.environment` to override (`openai-compat=priced:<in>,<out>` for a metered proxy) and a re-run keeps the edit |
| `NEXUS_OPENAI_COMPAT_URL`      | OpenAI-compatible gateway URL (epic #2500, child #2503). Paired with `NEXUS_OPENAI_COMPAT_KEY` it configures BOTH the single-model `custom-openai` path (formerly `NEXUS_CUSTOM_API_BASE_URL`, #4392 increment 3) and the gateway path — model discovery, in-process voter transport, the `api:<endpoint>` arm. Wins over `NEXUS_OPENCODE_CONFIG`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `NEXUS_OPENAI_COMPAT_ENDPOINT` | Endpoint identity the OpenAI-compat gateway registers as (#4392 step 2): the `<endpoint>` of its `api:<endpoint>` arm in the adapter registry and the circuit breaker, and the key a scoped `NEXUS_GATEWAY_COST` entry names it by (`<endpoint>=free`). Lowercase alphanumerics plus `.` `_` `-`, 1–64 chars, never the URL, and never a built-in vendor segment (`anthropic`, `openai`, `google`) — that would register the gateway as a vendor arm, where its `NEXUS_GATEWAY_COST` declaration is unreachable (#6409). Default `openai-compat` (the `providers.openai-compat` key of `opencode.json`); an invalid value is reported at startup and the default applies                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `NEXUS_OPENAI_COMPAT_KEY`      | API key for the OpenAI-compat gateway (paired with `NEXUS_OPENAI_COMPAT_URL` — both required); replaces `NEXUS_CUSTOM_API_KEY` (#4392 increment 3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `NEXUS_OPENAI_COMPAT_MODELS`   | Allowlist of gateway model ids (#6600): comma-separated, `*` is a wildcard (`anthropic/*,gemini-2.5-pro`). Applied after duplicate and non-chat models (embedding, TTS, image, moderation, audio, rerank) are removed and BEFORE the 256-model adapter cap, so a gateway listing more models than the cap serves the ones named here instead of refusing discovery. An entry that matches no listed chat model is warned. Unset or empty means no allowlist; a catalogue over the cap is then refused with an error naming this variable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `NEXUS_OPENCODE_CONFIG`        | Path to an `opencode.json` whose `providers.openai-compat.options.{baseURL,apiKey}` configures the OpenAI-compat adapter (fallback when the `_URL`/`_KEY` pair is unset)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `SEMANTIC_SCHOLAR_API_KEY`     | Optional. Lifts research_discover's semantic_scholar source past the unauthenticated 429 ceiling (#2234). Apply at https://www.semanticscholar.org/product/api#api-key-form                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### Security Variables

| Variable                         | Description                                                                                                                                                                                                                             | Default              |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `NEXUS_SANDBOX`                  | Sandbox **flavor string** (e.g. `docker-opencode`) set by the host image; a signal for sandbox-detection and doctor, it restricts nothing (#5026, #5695)                                                                                | unset                |
| `NEXUS_SANDBOX_ROOT`             | Sandbox root directory for the sandbox executor                                                                                                                                                                                         | unset                |
| `NEXUS_SUBPROCESS_ENV_ALLOWLIST` | Boolean (`true`/`1`, `false`/`0`); `false` disables the spawned-CLI env allowlist (#2865, #5155) entirely — full passthrough (minus `CLAUDECODE`). Blunt escape hatch; re-leaks cross-vendor keys. Prefer `NEXUS_SUBPROCESS_EXTRA_ENV`. | unset (allowlist on) |
| `NEXUS_SUBPROCESS_EXTRA_ENV`     | Comma/space-separated list of additional env-var **names** to forward to spawned CLIs, e.g. a custom gateway key (#4037). Keeps cross-vendor isolation; forwards only the named vars.                                                   | unset                |
| `NEXUS_SENSITIVE_REFS`           | Comma/space-separated org/gov reference **terms** scrubbed from auto-filed issue text (#3382 opsec). Intentionally not hardcoded — set your org's terms here. Unset ⇒ no scrubbing.                                                     | unset                |
| `NEXUS_AUTH_ENABLED`             | Enable MCP auth (applies only to network transports; no effect on the default stdio MCP)                                                                                                                                                | `true`               |
| `NEXUS_CUSTOM_API_ALLOW_PRIVATE` | Boolean (`true`/`1`, `false`/`0`): SSRF guard escape hatch allowing custom/OpenAI-compat gateway URLs to target private or loopback IP addresses (#4392)                                                                                | unset (fail closed)  |
| `NEXUS_DRIFT_ADVISORY`           | Model-string drift CI gate: any value except `0` (incl. unset) = advisory (warn); `0` = blocking (#2199). CI sets `0` to enforce.                                                                                                       | unset (advisory)     |

`NEXUS_DRIFT_ADVISORY` is **script-scoped**: it is read by
`scripts/check-model-string-drift.ts` and never by the server, so it is
deliberately absent from the runtime env-schema, which validates the server's
own process env. Setting it affects the CI gate, not a running server (#5159).

### Orchestration Variables

| Variable                         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Default               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `NEXUS_V2_MODE`                  | V2 pipeline mode (`off`/`partial`/`full`)                                                                                                                                                                                                                                                                                                                                                                                                                                              | `full`                |
| `NEXUS_AORCHESTRA`               | AOrchestra dynamic agent planning                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `true`                |
| `NEXUS_AORCHESTRA_DISPATCH`      | AOrchestra worker dispatch                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `true`                |
| `NEXUS_WORKER_MAX_CALLS`         | Max model calls per orchestrate invocation                                                                                                                                                                                                                                                                                                                                                                                                                                             | `6`                   |
| `NEXUS_MAX_CONCURRENT_EXPERTS`   | Expert pool semaphore capacity                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `6`                   |
| `NEXUS_ALLOW_MOCK_ORCHESTRATION` | Allow mock orchestration (test/CI only)                                                                                                                                                                                                                                                                                                                                                                                                                                                | `false`               |
| `NEXUS_ALLOW_SIMULATE`           | Explicit opt-in (`1`) for `simulateVotes: true` outside test runners (demos only — simulated votes are random, #4170). Unset = such requests are rejected with a `permission` error                                                                                                                                                                                                                                                                                                    | unset (fail closed)   |
| `NEXUS_DISABLED_CLIS`            | Comma-separated CLIs to take out of service (`claude`, `gemini`, `codex`, `opencode`; trimmed, case-insensitive), e.g. `codex,gemini` when a plan is out of quota (#6590). A disabled CLI gets no voter seat, no router arm, no fallback slot and no `delegate_to_model` recommendation; `doctor` lists it and skips its probe. An unknown name warns once and is ignored. Disabling every CLI leaves no CLI adapter, so callers get the usual no-adapter error rather than a fallback | unset (none disabled) |

**`NEXUS_ALLOW_SIMULATE` scope notes (#4170).** Test-runner detection trusts `VITEST=true` / `NODE_ENV=test` — a server started with an inherited test environment therefore disables the ban. The gate covers the MCP tool surface (`consensus_vote`, `run_pipeline`, `run_dev_pipeline`, `pr_review`, `supply_chain_tradeoff_panel`); programmatic library consumers (e.g. `createAgentStages` / `executeVoting` via the package exports) sit below the gate by design.

**Scheduled `improvement_review` (#3229).** Periodically runs `improvement_review` server-side so its `signal.fitness_declined` fires without manual invocation, feeding the self-tuning loop:

| Variable                               | Description                                                                   | Default   |
| -------------------------------------- | ----------------------------------------------------------------------------- | --------- |
| `NEXUS_IMPROVEMENT_REVIEW_INTERVAL_MS` | Poll interval in ms. `0`/unset disables. Suggested opt-in: `21600000` (6h)    | `0` (off) |
| `NEXUS_IMPROVEMENT_REVIEW_FILE_ISSUES` | Whether the scheduled run files GitHub issues (separate opt-in — avoids spam) | `false`   |

The scheduled run is **analysis-only by default** (emits signals, files no issues); `NEXUS_IMPROVEMENT_REVIEW_FILE_ISSUES=true` is a deliberate, separate opt-in (the tool's 5-issues/run rate-limit + open-issue dedup are backstops, not the primary guard).

### Learning & Memory Variables

| Variable                      | Description                                                       | Default  |
| ----------------------------- | ----------------------------------------------------------------- | -------- |
| `NEXUS_PERSIST_LEARNING`      | Cross-session routing persistence (boolean; `false`/`0` disables) | `true`   |
| `NEXUS_STRATEGY_DISTILLATION` | Strategy distillation only (boolean; `false`/`0` disables)        | `true`   |
| `NEXUS_REFLECTIVE_MEMORY`     | Reflective memory retrieval (`shadow`/`true`/`false`)             | `shadow` |
| `NEXUS_BILLING_MODE`          | Cost mode (`plan`=strongest model wins, `api`=cost-aware)         | `plan`   |
| `NEXUS_TUNE_ENFORCE`          | Self-tuning loop: apply bounded routing demotions                 | `true`   |

Outcomes and distilled routing rules persist to `~/.nexus-agents/learning/` — this is **cross-repo** state (shared across all your projects) and is not affected by the per-repo data dir (epic #2872). When persistence is enabled, `routingMemory`, `strategyDistillation`, and `preferenceRouting` also auto-enable (no separate config needed). Opt out with `NEXUS_PERSIST_LEARNING=false`.

**`NEXUS_STRATEGY_DISTILLATION` — distilled routing rules (#6512).** When it is on (the default), the first route in each process distills rules from the persisted outcome store if at least 50 eligible outcomes are newer than the last `rules.json` snapshot. Only `delegate` outcomes marked `cliSource: 'executed'`, with a positive duration and a real CLI name, are eligible. `false`/`0` turns distillation off without touching outcome persistence: the router builds no distiller, and it reads or applies no distilled rule. It overrides a config that enables `routing.stages.strategyDistillation`. `nexus-agents doctor` reports `Distilled rules: N (A active; trained on E eligible outcomes; last distill: …)`.

**`NEXUS_TUNE_ENFORCE` — the self-tuning routing loop (epic #3143 / #3147).** The loop reacts to health signals (`signal.swarm_unhealthy` from SwarmObserver bottlenecks and adapter circuit-breaker failovers) by **demoting** an unhealthy CLI in routing. The same flag gates both the write (the `TuneStage` applies the demotion) and the read (the `CompositeRouter` folds it into candidate scoring), so the loop is **either fully live or fully shadow — never half-wired**.

- `true` (**enforce**, default since v2.96) — a `signal.swarm_unhealthy` applies a **bounded** routing demotion via the provenance-tagged `TuneAdjustmentStore`. Every demotion is recorded to the tamper-evident append-only audit chain as a `tune.demote` event (verify with `verify_audit_chain`; tamper-evident, not tamper-proof — see the [audit hash-chain threat model](../security/audit-hash-chain-threat-model.md)).
- `false` (**shadow**, opt-out) — the loop logs the demotion it _would_ apply and records it to the `intended` counter, but **routing is untouched**. Use this to disable auto-tuning fleet-wide, or to observe the would-be behavior first: `nexus-agents health` shows `applied` vs `intended` per CLI under "Self-Tuning Demotions".

The demotion is bounded by hard safety invariants so the loop is self-correcting, never a ratchet: **demotion-only** (a CLI is slowed, never boosted), **floored** at `0.5` (never zeroed out of routing — a sole-viable CLI is always still selectable), **capped** at `0.2` per step, and **time-decaying** linearly back to neutral over 30 minutes (a transient health blip auto-reverses). The channel is separate from the LinUCB real-outcome bandit. **Opt out** with `NEXUS_TUNE_ENFORCE=false`. See [Self-Tuning Loop](../architecture/EVENT_BUS_BOUNDARIES.md#the-self-tuning-loop-3143).

Files stored:

- `outcomes.jsonl` — Append-only JSONL of task outcomes
- `rules.json` — Atomic JSON snapshot of distilled routing rules

### Security & Governance Variables

| Variable                       | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Default                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `NEXUS_ACCESS_POLICY_MODE`     | ClawGuard reporting mode: `off` / `audit` / `confirm_risky` / `enforce` (#1977, #2279). **No reader since #5108** — the access-constraint deriver that read it was deleted; the secret-path denylist it carried is now the PolicyFirewall `secret-paths` rule (warn today, enforce behind #4988). Still accepted by the startup validator so a value set from the AGENTS.md table is not reported as a typo; row and schema entry retire together under #6303                                                                                                                                                                                                                                                                                                                                                                                                                                  | unset (no effect)       |
| `NEXUS_REPUTATION_GATING`      | Author-reputation tier gating: `off` / `audit` / `enforce` (#3122, epic #3118). Default flipped `audit` -> `enforce` in #4667 after measurement; this column said `audit` until #5382 corrected it. Read once per process at first use since #4992; a running MCP server needs a restart to pick up a change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `enforce`               |
| `NEXUS_FIREWALL_POLICY`        | `HostileInputFirewall` rollout gate: `off` / `audit` / `enforce` (#5382, epic #5281). `off` is pre-#5382 behaviour exactly; `audit` reports `wouldRefuse` without refusing; `enforce` returns `POLICY_REFUSED` on a blocking violation. Defaults `off` — unlike the row above — because the firewall is a **published** API whose external callers would see a stricter default as a silent breaking change. Since #4992 the `issue_triage` and `pr_review` paths route through the firewall and honour this mode: `audit` logs a would-be refusal for the caller's real access posture, `enforce` refuses the triage/review outright, and since #6309 also refuses an uncorroborated per-action decision at the firewall's corroboration stage (recorded as refused, never dropped). Read once per process at first use since #4992; a running MCP server needs a restart to pick up a change | `off`                   |
| `NEXUS_MCP_POLICY_ENFORCE`     | Runs the MCP `PolicyFirewall` in `enforce` instead of the rollout default `warn` (#6431; the per-operator opt-in #4987/#4988 described before it had a reader). Same accept-set as every boolean flag: `true`/`1` on, `false`/`0` off, anything else reported invalid at startup and treated as off. In `warn` every rule is evaluated and every would-be denial is logged, none is applied; in `enforce` a denial fails the tool call. Overrides `security.policy.policyMode`, which is not read for the effective mode. The startup line reports the mode in effect and why: `policyMode: enforce (NEXUS_MCP_POLICY_ENFORCE)` or `warn (rollout default)`. Whether enforce becomes the default is #4988                                                                                                                                                                                      | unset (enforce off)     |
| `NEXUS_TASK_STATE_ENABLED`     | Structured task-state log + Magentic-One ledgers (`0`/`false` to disable, #2278)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | enabled (v2.50+)        |
| `NEXUS_CONTEXT_WARN_THRESHOLD` | Per-expert context-warning threshold (0..1]                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `0.85`                  |
| `NEXUS_PR_REVIEW_RECORDS_PATH` | Forces the `pr_review` governance-record ledger path to an explicit absolute file. Escape hatch for MCP server processes whose `process.cwd()` has no `.git` ancestor, where cwd-based auto-detection silently fails to persist the record (#4278). Takes precedence over the per-call `pr_review({ repoPath })` input and over cwd auto-detection.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | unset (cwd auto-detect) |

**`NEXUS_REPUTATION_GATING` graduation path:** `off` bypasses entirely; `audit` logs every violation and blocks nothing; `enforce` blocks. Author-reputation tier demotion in `issue_triage` (epic #3118). (The `NEXUS_ACCESS_POLICY_MODE` ladder that used to sit here — `audit` → `confirm_risky` → `enforce` — was retired with the ClawGuard deriver in #5108; the secret-path control it fronted is the PolicyFirewall `secret-paths` rule, whose enforce rollout is #4988.)

- `off` — reputation never affects the enforced trust tier
- `audit` — reputation is computed and the would-be demotion is logged + surfaced (`trustAssessment.effectiveTrustTier`/`gatingMode`), but the **classifier** tier is enforced. Collects telemetry on the demotion rate before enforcing
- `enforce` (default) — apply the reputation demotion at the policy gate (a suspicious author's tier-gated actions are blocked)

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

| Variable                                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Default   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| `NEXUS_TIMEOUT_MULTIPLIER`               | Float scaling EVERY class guard. Clamped `[0.25, 10]`. `2` doubles every guard, subject to each class's ceiling.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `1`       |
| `NEXUS_TIMEOUT_CLASS_INTERACTIVE_MS`     | Override the `interactive` class guard (ms). Floored at `1000`, × multiplier, then ceilinged at `3600000` (the MCP request ceiling).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `60000`   |
| `NEXUS_TIMEOUT_CLASS_SINGLE_LLM_MS`      | Override the `single-llm` class guard (ms). Ceiling `3600000`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `300000`  |
| `NEXUS_TIMEOUT_CLASS_MULTI_LLM_PANEL_MS` | Override the `multi-llm-panel` class guard (ms). Ceiling `3600000`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `900000`  |
| `NEXUS_TIMEOUT_CLASS_PIPELINE_MS`        | Override the `pipeline` class guard (ms). Ceiling `3600000`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `1800000` |
| `NEXUS_TIMEOUT_CLASS_NETWORK_FETCH_MS`   | Override the `network-fetch` class guard (ms). Ceiling `3600000`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `120000`  |
| `NEXUS_TIMEOUT_CLASS_ASYNC_JOB_BODY_MS`  | Override the `async-job-body` class guard (ms). Ceiling `7200000` (2h), not the MCP request ceiling — a backgrounded job has no MCP request (#5995). The default is unchanged; raising it is opt-in. Above the `3600000` MCP ceiling the body must prove liveness (#6162): `runAsJob` hands it a `progress()` heartbeat, and a body silent for 3 heartbeat intervals (interval = guard / 8, so 3/8 of the guard — 22.5 min at just over 3.6M, 45 min at 7.2M) is failed as `wedged (no progress for N ms)` exactly that long after its last heartbeat (a lazy watchdog measured from the record, not a poll tick) and its concurrency slot released before the guard fires. Every in-tree async body heartbeats (panels per settled seat, pipelines through the stage events they emit, orchestrate per stage transition and per agent model call, graph and workflow bodies per node or phase); a custom `runAsJob` body that never heartbeats is wedged by definition. At or under the ceiling nothing is watched and a wedged job still holds its slot for the whole guard. | `3600000` |

Resolution, one order for every class (#6162): `max(envClassOverride ?? base, 1000) × multiplier`, clamped once to the class ceiling — `MCP_TIMEOUTS.maxMs` (`3600000`) for every class that runs inside an MCP request, `7200000` for `async-job-body`, which runs outside any MCP request (#5995). The ceiling is applied to the product, so an override above it is reported as reduced rather than trimmed before the multiplier sees it; an override above `7200000` with a multiplier below `1` on a request-bound class resolves to `min(override × multiplier, 3600000)` and is attributed to the override. A value clamped away is reported at startup (`Environment variable … had no effect`). The near-timeout WARN for a backgrounded job fires at 0.5 of whatever guard it runs under, and the effective guard is logged once at job start; `get_job_result` and `list_jobs` expose a pending job's `lastProgressAt` (its last heartbeat, absent when it never sent one) so a poller can tell slow from stuck. Explicit per-call and `security.perToolTimeout` overrides still win over the class guard.

> **Rate limiting, retries and circuit breakers are configured in the config
> file, not by environment variable.** `NEXUS_RATE_LIMIT_*`, `NEXUS_RETRY_*` and
> `NEXUS_CIRCUIT_BREAKER_*` were removed in #5903 — they were registered and
> documented but read by nothing that runs, so setting one changed nothing while
> `config get` reported it as `Source: (env)`. Use `security.rateLimit` (see the
> config-file example above); retry and circuit-breaker behaviour is currently
> code-level, not operator-configurable.

### Infrastructure Variables

| Variable                    | Description                                                                                                                                                                                                                                         | Default   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `NEXUS_EVENTBUS_ENABLED`    | EventBus A2A bridge                                                                                                                                                                                                                                 | `true`    |
| `NEXUS_V2_POLICY_MODE`      | Policy enforcement (`off`/`warn`/`block`); governs the V2 orchestrate pre-execution check (`checkPipelinePolicy(task, 'execute')`)                                                                                                                  | `block`   |
| `NEXUS_AUTO_REMEDIATE`      | Autonomous remediation cycle (`off`/`audit`/`enforce`, #3653; default `audit` zero-write soak, #3769)                                                                                                                                               | `audit`   |
| `NEXUS_POLICY_GATE_MODE`    | Stage-boundary policy gate (`off`/`warn`/`block`, #3177): dev-pipeline's consensus→execute gate, and any compiled gate node whose caller supplies a `policyEnforcement` bundle (none in-tree today); the V2 delegate graph declares no gate (#4657) | `warn`    |
| `NEXUS_JOB_RESULT_SOURCE`   | Async job-result reader source (`sidecar`/`task_state`, #3090/#3693): `task_state` prefers+unions the Stage-2 task-state log; reader half of the sidecar→Stage-2 migration (epic #2631)                                                             | `sidecar` |
| `NEXUS_MODELS_OVERLAY_PATH` | Path to a model-registry overlay manifest (#3185 hot-reload)                                                                                                                                                                                        | _(unset)_ |
| `NEXUS_DISABLE_SESSIONS`    | Disable session tracking                                                                                                                                                                                                                            | `false`   |
| `NEXUS_DISABLE_METRICS`     | Disable metrics tracking                                                                                                                                                                                                                            | `false`   |

### Runtime internals, record paths and nesting guards (#5142)

These are read by production code and are registered in `config/env-schema.ts`.
They were previously unregistered, so setting one produced an "unknown variable"
warning at startup with a typo suggestion, even though the value was honoured.

| Variable                         | Description                                                                                                                                                                                                                                                                                   | Default                 |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `NEXUS_MCP_DEPTH`                | Nesting depth stamped on a child Codex MCP process; the adapter refuses to recurse past its limit. Set by the parent, not normally by a user                                                                                                                                                  | `0` (top level)         |
| `NEXUS_SUBPROCESS_DEPTH`         | Same idea for spawned CLI subprocesses (`subprocess-env.ts`), guarding runaway self-invocation                                                                                                                                                                                                | `0` (top level)         |
| `NEXUS_JOB_MAX_CONCURRENT_TOTAL` | Global cap on in-flight async MCP jobs across all tools. **`0` is meaningful** — it disables async dispatch entirely                                                                                                                                                                          | built-in cap            |
| `NEXUS_CI_HEALTH_MAX_BYTES`      | Byte cap on the log slice `ci_health_check` reads before truncating                                                                                                                                                                                                                           | built-in cap            |
| `NEXUS_VOTE_RECORDS_PATH`        | Overrides where consensus vote records are written. Relative paths resolve against the repo data dir and must not escape it                                                                                                                                                                   | `<dataDir>/governance/` |
| `NEXUS_VOTE_SIGNING_KEY`         | SSH key `scripts/append-ratification-record.ts` signs a committed vote record's hash with (#3927 item 4); `--signing-key` overrides. Unset: the agent key at `<dataDir>/auth/vote-record-signing.key` if generated (#6257), else appended unsigned. An owner-principal key needs `--as-owner` | unset                   |
| `NEXUS_MODEL_REGISTRY_OVERLAY`   | Path to a model-registry overlay manifest layered over the in-tree model data                                                                                                                                                                                                                 | unset                   |

**Dynamic families.** Two variable names are constructed at runtime, so they are
matched by prefix rather than listed individually:

| Pattern                           | Description                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `NEXUS_VOTER_MODEL_<ROLE>`        | Pins the model for one voter role, e.g. `NEXUS_VOTER_MODEL_ARCHITECT=claude-opus`. `<ROLE>` is a `VOTER_ROLES` key, upper-cased |
| `NEXUS_JOB_MAX_CONCURRENT_<TOOL>` | Per-tool async job cap, e.g. `NEXUS_JOB_MAX_CONCURRENT_ORCHESTRATE=2`. `<TOOL>` is an MCP tool name, upper-cased                |

A `<ROLE>` that is not a real voter role is still reported as an unknown
variable — the prefix match is checked against the canonical role list, not
accepted blindly.

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

### Audit-mode remediation soak: the operator store is the evidence path (#4224, #4279)

The enforce-readiness soak (`learning/remediation-soak.jsonl`, read by
`remediation-readiness-collector.ts`) only accrues when someone runs
`nexus-agents auto-remediate`. It is **not** a byproduct of normal work, so
without a scheduler the evidence the enforce gate depends on cannot accumulate —
it flatlined on 2026-06-17 despite heavy repo activity, and again at one record
for the five weeks before #4279 was re-verified. There is ONE evidence path (the
local operator cycle below) and one CI job that is deliberately **not** one:

**1. The CI job is a smoke test, not evidence
(`.github/workflows/remediation-audit-soak.yml`, display name
"Remediation Audit Smoke (no readiness evidence)").** It runs the build then
`nexus-agents auto-remediate` in **audit** mode daily (`cron: '17 7 * * *'`)
plus `workflow_dispatch`, and proves the audit path — collect → research → vote
→ append — runs end to end on the built CLI. It exports `NEXUS_AUTO_REMEDIATE=audit`
and asserts it before running, and the cycle entry point structurally withholds
`repoRoot`, so `enforce` cannot engage from CI. It keeps `permissions: contents: read`.

> **A green run is not progress toward #3769.** The #4279 panel (5–2, Option B)
> declared the CI soak non-evidence, for three reasons that hold independently:
>
> - **Disjoint store.** The job appends under a workspace `NEXUS_DATA_DIR` that
>   lives only in `actions/cache` (evicted after 7 idle days). The readiness gate
>   reads the operator store (`~/.nexus-agents/learning/remediation-soak.jsonl`);
>   nothing bridges the two, and 43 green runs moved the gate by zero records.
> - **Un-judged by construction.** Readiness requires a NAMED evaluator and owner
>   (`remediation-review mark` / `sign-off`) — human acts. A bridged CI corpus
>   would arrive with `judgedSelections: 0` and fail `judged-coverage`,
>   `named-evaluator` and `named-owner` regardless of its volume.
> - **Self-authorship.** Letting the job commit its records would widen the
>   cron-triggered token to `contents: write` so the automation seeking enforce
>   authority could author the evidence that grants it.
>
> The job also wires no model/gateway secrets, so its per-signal vote degrades to
> `no_quorum` at zero LLM cost and its records carry no `voteOutcome` — thin even
> as smoke coverage. Treat it as an alarm that the audit path still runs, nothing more.

**2. LOCAL cron / systemd timer — the evidence path.** Readiness evidence comes
from **your real `~/.nexus-agents` telemetry**, not a clean CI runner: a fresh
checkout has little of your outcome/decision-cost telemetry, so the
`improvement_review` signals it collects are thin and near-identical day to day.
If you operate nexus-agents day-to-day, schedule the audit cycle _locally_ where
that telemetry lives. Audit mode is the default, so a bare invocation is soak-only
with zero writes:

```cron
# crontab -e — daily audit-mode soak against your real ~/.nexus-agents telemetry
17 7 * * * cd /path/to/your/repo && NEXUS_AUTO_REMEDIATE=audit nexus-agents auto-remediate >/dev/null 2>&1
```

Or as a systemd timer (`~/.config/systemd/user/nexus-soak.service` +
`nexus-soak.timer` with `OnCalendar=daily`) running the same command.

After a soak window, judge a batch with `nexus-agents remediation-review` and the
readiness gate reflects **genuine** soundness over real, plan-bearing selections.
Every tier's record is judgeable — `mark` keys on the soak ref, never on whether a
dry-run was captured (#4279 Gap 2).

**Watch the store, not the CI job.** `nexus-agents remediation-review readiness`
prints a `Soak store:` line beside the verdict (#4279): `UNMEASURED` when the
store is empty, `ALARM` when it holds ≤1 record or has had no new record for
14 days (each cause named), `fresh` otherwise; `--format json` carries the same
signal as `soakStore`. A flatlined operator store is a stalled evidence path and
this is the only place it is reported — the CI smoke job cannot see it.

> **Known limitation — `dryRunResult` (plan content) is not captured in the
> scheduled/local audit cycle.** The p0 `dry-run` audit event that populates a
> soak record's `dryRunResult` only fires when a `dryRun` capability is wired into
> the deps — `buildAutoRemediationDeps` does not wire one, and there is **no
> config/flag/env** to enable it from the CLI. So accrued records carry the real
> `signalKey`, `category`, `priority`, `planStepCount`, and `reason` (plus
> `voteOutcome` only where LLM credentials are present — i.e. the local path, not
> credential-less CI, per the note above), a large improvement over the prior
> synthetic, uniform volume — but not the full dry-run plan text. This limits what
> an evaluator has to read; it does not limit what they can mark. Wiring a `dryRun`
> adapter into the audit cycle so the accrued selections are fully plan-bearing is
> tracked as follow-up to #4224 (and would also need the dry-run audit `detail` to
> carry plan content rather than just `ok`/error).

### On-demand MetaOrchestrator shadow-training soak (#4310)

The shadow-training MECHANISM has worked since #3593: with
`NEXUS_META_SHADOW_TRAIN=1`, `executeGoal` (the `run{execute:true}` engine)
feeds every live dispatch outcome into the MetaOrchestrator shadow selector
and appends a sanitized record — bandit feature values + a success flag only,
**never task text** — to `learning/meta-outcomes.jsonl`. But nothing ever
TRIGGERED it: training only fires on a live `run` call, and no CI/cron/CLI
ever made one, so the shadow-agreement evidence the #3552 shadow→route flip
decision depends on could not accumulate. `.github/workflows/meta-shadow-soak.yml`
and `scripts/meta-shadow-soak.ts` give it an organic feed, mirroring the #4224
remediation-audit-soak precedent above.

> **This is a FEEDER, not a router.** `NEXUS_META_SHADOW_TRAIN=1` is the only
> lever this soak pulls. It never alters which strategy `run` actually
> dispatches, and it never feeds the enforce/routing path — the #3552
> shadow→route flip stays a separate, human-gated change. The workflow asserts
> this invariant explicitly before running.

**Goal sourcing (ratified for #4310): REAL backlog issues, not synthetic.**
The script fetches open issues from the repo via `gh issue list`, formats
each as `#<number>: <title>` plus its first body paragraph, and deterministically
selects a bounded set (default 12, most-recent-first by issue number — a
reproducible proxy for recency). Synthetic goals would exercise the router on
a distribution that doesn't resemble what `run` actually sees in production,
undermining the shadow-agreement evidence the flip decision depends on. The
selection/formatting logic is pure and unit-tested
(`scripts/meta-shadow-soak-core.ts`); the `gh` fetch and the live `executeGoal`
dispatch are the thin, untested-by-unit I/O edge (`scripts/meta-shadow-soak.ts`),
mirroring the curate-pr-review-harvest.ts / mine-pr-review-candidates-core.ts
split (#3847).

**1. `workflow_dispatch` only — deliberately NO `schedule:` trigger.** The #4224
audit-mode cycle costs zero LLM spend without credentials (`createAutoAdapter`
throws before any network call), but this soak dispatches REAL strategies
(dev-pipeline / pipeline / research / consensus) through real model gateways
when credentials are present, so a recurring cron would recur real API cost
with no CI-cost mandate to justify it. An owner triggers it manually from the
Actions tab as the evidence window needs topping up.

**Secret-gated — skips cleanly, never fails, when no model-gateway credential
is configured.** A `check-secrets` step inspects `ANTHROPIC_API_KEY` /
`OPENAI_API_KEY` / `GOOGLE_AI_API_KEY` / `OPENROUTER_API_KEY` (the same set
`pr-review.yml` checks) and every downstream step is conditioned on at least
one being present. Without one, the job reports "skipped" in the step summary
and exits green — this workflow is safe to leave present even before model
credentials are configured as repo secrets.

**2. LOCAL on-demand run (no CI cost, uses your own credentials/telemetry):**

```bash
NEXUS_META_SHADOW_TRAIN=1 pnpm exec tsx scripts/meta-shadow-soak.ts --count 12 --repo nexus-substrate/nexus-agents
```

Requires `gh` authenticated against the target repo (`gh auth status`) and
model-gateway credentials for whichever strategies the router selects. A goal
that routes to an unwired strategy (`graph-workflow` / `spec` / `orchestrate` /
`single-shot`) still accrues a **failure** shadow-training record — the
dispatcher records an outcome even for a `no_executor` dispatch — so even
those goals are not wasted soak volume. The script prints a summary: goals
run, `meta-outcomes.jsonl` record count before/after, and file size.

> **Stub vs. live:** goal selection/formatting (`meta-shadow-soak-core.ts`) is
> pure and fully unit-tested against fixtures — no network, no live models.
> The `gh` fetch and the `executeGoal` dispatch are real I/O with no stub or
> mock path; there is no `simulateVotes`/synthetic-outcome mode by design (a
> mocked evidence trail would be worse than no evidence trail for a decision
> #3552 depends on).

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

### Removed (#4939)

The last four variables of the `getTimeout()` family — `NEXUS_TIMEOUT_CLI`,
`NEXUS_TIMEOUT_API`, `NEXUS_TIMEOUT_WORKFLOW`, `NEXUS_TIMEOUT_MCP` — were
registered in the env-schema and read by nothing that runs: `getTimeout()` had
zero production callers, and the only observable effect of setting one was
`config get TIMEOUT_DEFAULTS.cliMs` answering `Source: (env)` for a value no code
consumed (the same false-positive #5903 removed for the rate-limit, retry and
circuit-breaker families). They are gone from the schema; `validateNexusEnv` now
reports them as unknown. If you had any of them set, just unset them. The
timeout knobs that ARE read are `NEXUS_VOTE_TIMEOUT_MS`, `NEXUS_EXPERT_TIMEOUT_MS`,
`NEXUS_WORKER_TIMEOUT_MS`, `NEXUS_TIMEOUT_MULTIPLIER` and the
`NEXUS_TIMEOUT_CLASS_*_MS` family documented above.

### Deprecated (#4392 increment 3)

`NEXUS_CUSTOM_API_BASE_URL` and `NEXUS_CUSTOM_API_KEY` are deprecated aliases of
`NEXUS_OPENAI_COMPAT_URL` and `NEXUS_OPENAI_COMPAT_KEY`. Each is resolved
`new ?? old` per variable (the `GEMINI_API_KEY` → `GOOGLE_AI_API_KEY` precedent),
trimmed, with an empty value meaning unset. Both stay registered in the
env-schema — setting one is not reported as a typo — and both are dropped in the
next major (#6291). `NEXUS_CUSTOM_MODEL` is **not** deprecated.

What the legacy names still do, and what they do not (panel decision, option C):

- They configure **only** the single-model `custom-openai` path — the
  `SdkAdapter` behind `createAutoAdapter` and the `api:custom-openai` routing
  arm under `NEXUS_BILLING_MODE=api`, pinned to `NEXUS_CUSTOM_MODEL`.
- They do **not** configure the gateway path. Model discovery
  (`GET /v1/models`), in-process voter transport and the `api:<endpoint>` arm
  are reached through `NEXUS_OPENAI_COMPAT_URL` / `NEXUS_OPENAI_COMPAT_KEY`
  only. **Renaming is what opts you in** — an operator who keeps the legacy
  names gets exactly the behaviour they had before.

How you find out: one startup warning names each deprecated variable that is
set, whether it is honoured or ignored because the replacement is also set, and
the replacement — never a value. `nexus-agents doctor` prints the same per
variable under _Voter transport_ (`⚠ … is deprecated — use … (alias until the
next major, #6291)`); it is a warning, not a failure. `validateNexusEnv` returns
them in `deprecatedVars` without logging (the resolver already did).
`nexus-agents setup --custom-api` writes the new names.

### Removed (#5665)

`NEXUS_AUTH_METHOD` was registered and documented (default `token`) but never
reached enforcement: `initializeAuth` reads `security.auth.method` from the
config file only, and the variable's sole reader was the startup log line
(#5663). It has been removed from the env-schema by panel decision (3/3,
remove rather than wire — same reasoning as #2977 / #4180); `validateNexusEnv`
now reports it as unknown. Set `security.auth.method` in the config file
instead.

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

### Per-Task-Class Cost Ceilings

Cap the per-task USD cost by task class (#4196, #4214). Each key is a
`TaskCategory` (`architecture`, `code_generation`, `code_review`, `research`,
`security_review`, `planning`, `documentation`, `testing`, `devops`,
`exploration`); a typo'd key fails config validation instead of silently
configuring nothing:

```yaml
routing:
  budget:
    taskClassMaxCostUsd:
      code_generation: 0.25 # Max $0.25 per code-generation task
      research: 1.00 # Research tasks may spend more
```

Two things to know before relying on ceilings:

- **`NEXUS_BILLING_MODE=api` is required.** Ceilings are only enforced in
  cost-aware (`api`) billing mode. Under the default `plan` mode they are an
  annotated no-op — the routing decision reason carries
  `cost weighting disabled: plan mode` and no candidate is ever filtered.
- **Unpriced candidates fail closed.** When a ceiling is configured for the
  task's detected class, any candidate whose model has no registry pricing is
  excluded — an unknown cost is never allowed to slip under a configured
  ceiling. If every candidate exceeds the ceiling (or is unpriced), routing
  fails at the budget-filter stage rather than falling back to
  all-candidates.

Omit `taskClassMaxCostUsd` (or leave it empty) to disable ceilings entirely
(the default).

### TOPSIS Weights

Adjust multi-criteria optimization:

```yaml
routing:
  topsis:
    criteria: # weights must sum to 1.0
      - { name: quality, weight: 0.5, beneficial: true } # prioritise quality
      - { name: cost, weight: 0.3, beneficial: false } # consider cost
      - { name: latency, weight: 0.2, beneficial: false } # some latency tolerance
```

For cost-sensitive deployments:

```yaml
routing:
  topsis:
    criteria:
      - { name: quality, weight: 0.3, beneficial: true }
      - { name: cost, weight: 0.5, beneficial: false }
      - { name: latency, weight: 0.2, beneficial: false }
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

### Coordinated Decay

Configure the FADE-style decay sweep that `MemoryDecayManager` runs across the
belief, agentic, adaptive and MobiMem stores. Every key is optional; an unset
key falls through to the default in `DEFAULT_DECAY_CONFIG`
(`packages/nexus-agents/src/mcp/tools/memory-decay.ts`) — the schema carries no
second copy of the defaults. Before #5097 this manager was constructed with a
hardcoded `{}`, so none of these keys could reach it.

```yaml
memory:
  decay:
    enabled: true # false disables the sweep entirely
    decayIntervalMs: 3600000 # ms between automatic runs (default: 1 hour; minimum 1000)
    beliefMaxAgeDays: 30 # prune superseded beliefs older than this
    agenticMaxEntries: 10000 # importance-based eviction starts above this
    agenticImportanceThreshold: 0.3 # 0-1; agentic entries below are evicted
    adaptivePriorityThreshold: 0.2 # 0-1; adaptive entries below are evicted
    mobimemEvictOnDecay: true # run MobiMem TTL eviction on each sweep
    checkCrossReferences: true # keep cross-referenced items past the sweep
    crossReferenceGracePeriodMs: 604800000 # 7 days
```

Validation happens at config load: counts and durations must be positive safe
integers (`crossReferenceGracePeriodMs` may be `0`; `decayIntervalMs` has a
1000 ms floor because sweeps are not re-entrant and a sub-second cadence would
let them overlap), thresholds must lie in `[0, 1]`, and a bad value fails
startup with the offending path named (`memory.decay.decayIntervalMs`, for
example). The server logs one line at activation —
`MemoryDecayManager activated (Phase 5 #746)` — carrying the effective value of
every key, read back from the manager, plus a `source` field: `config` when the
MCP server applied `nexus-agents.yaml`, or
`defaults (configureToolMemory never called)` on CLI paths (composite-router,
dev-pipeline, graph-executor) that build the memory singleton without loading
the file. Defaults on those paths are therefore labelled as such rather than
passing for a file that happened to say the default.

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

### Policy Firewall

Every locally registered MCP tool call is evaluated by the `PolicyFirewall` (`src/mcp/middleware/policy.ts`) under an execution mode:

```yaml
security:
  policy:
    defaultMode: read-write # default; read-only is the operator's lock (see below)
    policyMode: enforce # default, but NOT the effective mode — see NEXUS_MCP_POLICY_ENFORCE
```

| Key           | Values                      | Effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defaultMode` | `read-write` (default)      | The mode every tool call is evaluated under. Mutation tools (the manifest entries with `readOnlyHint: false` — `consensus_vote`, `run_dev_pipeline`, `memory_write`, …) are allowed; the path rules (`safe-paths`, `secret-paths`) still apply.                                                                                                                                                                                                                                                                                                                                                                                           |
|               | `read-only`                 | An operator opt-in lock: the `deny-mutations-without-mode` rule forbids **every** tool the manifest classifies as a mutation, any unclassified tool, and `run { execute: true }` as its selected strategy's tool (`run_dev_pipeline`, `run_pipeline`, `consensus_vote`, …), for this host. In the default `warn` mode each such call is logged as a would-be denial and still runs; once the firewall enforces (`NEXUS_MCP_POLICY_ENFORCE=1`) the calls fail. Set this only on a host that should never mutate anything through MCP. Default was `read-only` before #6431, which would have denied all mutation tools on enforcement day. |
| `policyMode`  | `enforce` (default), `warn` | Accepted but **not read** for the effective mode: `NEXUS_MCP_POLICY_ENFORCE` is the one switch (rollout default `warn`). Whether this key should govern the default is #4988's decision.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

The startup `Security configuration` line reports both: `policyMode` (effective mode and its reason) and `defaultExecutionMode`.

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
    method: token # 'token' is the only implemented method; 'oauth2' is accepted but behaves as 'token' and warns (#5678)
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
    criteria:
      - { name: quality, weight: 0.3, beneficial: true }
      - { name: cost, weight: 0.6, beneficial: false }
      - { name: latency, weight: 0.1, beneficial: false }
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
    criteria:
      - { name: quality, weight: 0.7, beneficial: true }
      - { name: cost, weight: 0.1, beneficial: false }
      - { name: latency, weight: 0.2, beneficial: false }
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

Commit the **project file** for shared, reproducible choices: `models.tiers`/`default`, `routing` weights, gate modes (`NEXUS_POLICY_GATE_MODE`, `NEXUS_FIREWALL_POLICY`), and `security.sandbox.mode`. Keep **machine-specific** settings out of the repo and set them per-user via env: API keys (`ANTHROPIC_API_KEY`, …), `NEXUS_DATA_DIR`, `NEXUS_SANDBOX_ROOT`, and `NEXUS_BILLING_MODE`. Committed config defines the team's pipeline; each env var wins over it locally.

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

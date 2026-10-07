---
title: 'Environment Variable Reference'
description: 'Registered NEXUS environment variables, accepted values, schema defaults and descriptions.'
diataxis: reference
tier: 2
keywords: [environment, configuration, reference]
related_files: [packages/nexus-agents/src/config/env-schema.ts]
---

# Environment Variable Reference

> Generated from packages/nexus-agents/src/config/env-schema.ts — do not edit by hand

Regenerate with `pnpm exec tsx scripts/generate-env-reference.ts`.

This table describes the registered schema entries. All are optional. Schema
defaults are shown only when declared with `.default()`; runtime defaults
are defined by each consuming module. Descriptions come from `.describe()`
or source comments. Custom validation may impose additional restrictions.

| Name | Type / accepted values | Default | Description |
| ---- | ---------------------- | ------- | ----------- |
| `NEXUS_ALLOW_MOCK_ORCHESTRATION` | true \| false | Not declared in schema | Not described in schema |
| `NEXUS_ALLOW_SIMULATE` | 0 \| 1 | Not declared in schema | Explicit opt-in for simulateVotes outside test runners (#4170) — read by checkSimulationAllowed (mcp/tools/simulation-guard.ts). Unset = fail closed. |
| `NEXUS_AORCHESTRA` | true \| false | Not declared in schema | Not described in schema |
| `NEXUS_AORCHESTRA_DISPATCH` | true \| false | Not declared in schema | Not described in schema |
| `NEXUS_AUTH_ENABLED` | true \| false | Not declared in schema | Not described in schema |
| `NEXUS_AUTO_REMEDIATE` | off \| audit \| enforce | Not declared in schema | Drives the auto-remediation cycle (resolveAutoRemediateMode); default audit (zero-write soak, #3769) when unset, explicit `off` disables. |
| `NEXUS_BILLING_MODE` | plan \| api | Not declared in schema | Not described in schema |
| `NEXUS_BUDGET_ENFORCE` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | #5155: these five each read a single private literal (`=== '1'`, `=== 'true'`, `=== '0'`) so the other spelling was a silent no-op. They now go through the same helper, so the schema tells the truth about them. |
| `NEXUS_BUDGET_TOLERANCE` | string; pattern /^\\d+(\\.\\d+)?$/ | Not declared in schema | Former debt variables registered to burn down coverage baseline (#6457) |
| `NEXUS_CAPABILITY_GAP_INFERRED` | 0 \| 1 | Not declared in schema | Exact opt-in: inferred gaps otherwise remain report-only (#6930). |
| `NEXUS_CI_HEALTH_MAX_BYTES` | string; pattern /^\\d+$/ | Not declared in schema | parseIntEnv / parseInt consumers: a non-integer is discarded in favour of the default, so reporting it as invalid tells the user their setting was ignored rather than letting it fail silently. |
| `NEXUS_CODEPR_TOKEN` | string | Not declared in schema | Paths, URLs, tokens and term lists: any non-empty string is legal, so z.string() is the accurate type rather than a permissive stand-in. |
| `NEXUS_CONFIG_PATH` | string | Not declared in schema | Not described in schema |
| `NEXUS_CONSENSUS_ENFORCE` | off \| audit \| enforce | Not declared in schema | Run-layer consensus verdict enforcement (#4464); default audit. |
| `NEXUS_CONSOLE` | string; custom validation (Must be one of: true, false, 1, 0, on, off) | Not declared in schema | Not described in schema |
| `NEXUS_CONTEXT_RANKED` | 0 \| 1 | Not declared in schema | Render the unified cross-ranked memory prefix instead of per-backend sections (#3236); off by default. |
| `NEXUS_CONTEXT_RETRIEVER_INJECT` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_CONTEXT_WARN_THRESHOLD` | string; pattern /^\\d+(\\.\\d+)?$/ | Not declared in schema | Not described in schema |
| `NEXUS_CUSTOM_API_ALLOW_PRIVATE` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_CUSTOM_API_SURFACE` | string; custom validation (Must be one of: responses, chat) | Not declared in schema | #6645: the OpenAI API surface the single-model custom-openai adapter calls. Default `chat` (/chat/completions); `responses` opts into /responses. The reader (adapters/sdk/gateway-env.ts) trims and lower-cases, then refuses anything else at construction. |
| `NEXUS_CUSTOM_MODEL` | string | Not declared in schema | Not described in schema |
| `NEXUS_DATA_DIR` | string | Not declared in schema | Explicit runtime data root; overrides the per-repo/cross-repo split. In CLAUDE.md's most-used table since it shipped, and absent from this schema until #4722 — so setting the documented variable made `validateNexusEnv` report it as an UNKNOWN NEXUS\_\* var, typo suggestion and all. |
| `NEXUS_DISABLE_METRICS` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_DISABLE_SESSIONS` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_DISABLED_CLIS` | string | Not declared in schema | #6590: comma-separated CliNames to take out of service. A plain string on purpose: an unknown name is warned about and ignored by the one reader (cli-adapters/disabled-clis.ts), so a stricter schema would turn one typo into an invalid-value report for the whole variable. |
| `NEXUS_DYNAMIC_MODELS` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_EVENTBUS_ENABLED` | true \| false | Not declared in schema | Not described in schema |
| `NEXUS_EXPERT_TIMEOUT_MS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_FIREWALL_POLICY` | string; custom validation (Must be one of: off, audit, enforce) | Not declared in schema | #5382: rollout gate for HostileInputFirewall behaviour changes. Defaults to `off` — unlike NEXUS\_REPUTATION\_GATING, which defaults to `enforce` — because the firewall is a PUBLISHED API with external callers, so a stricter default would be a silent breaking change. Same tri-state and same coercion as its two sibling flags; see security/firewall/firewall-policy-mode.ts. |
| `NEXUS_GATEWAY_COST` | string; custom validation | Not declared in schema | #4392 increment 2: what a gateway arm costs (GATEWAY\_COST\_ENV; spelled out because scripts/check-env-schema-coverage.ts reads keys by regex). Validated by the same parser every runtime reader uses, so "invalid" here means UNDECLARED there — the task-class cost ceiling and the per-task budget exclude the gateway (#6393) and `doctor` warns. The parser's own reason is forwarded (superRefine, not a fixed message): "duplicate endpoint key" and "more than one bare declaration" are different fixes, and a grammar reminder names neither. |
| `NEXUS_GATEWAY_MODEL_ANTHROPIC` | string | Not declared in schema | #6604: pin the gateway model a family slot (claude/codex/gemini) uses. Any model id is legal here; the one reader (adapters/gateway-family-slots.ts) validates it against the discovered catalogue and warns on a miss. |
| `NEXUS_GATEWAY_MODEL_GOOGLE` | string | Not declared in schema | Not described in schema |
| `NEXUS_GATEWAY_MODEL_OPENAI` | string | Not declared in schema | Not described in schema |
| `NEXUS_GITIGNORE_AUTO` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_GRAPH_TIMEOUT_MS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_HOOK_VERBOSE` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | All three are read via parseBoolEnv in cli/hooks/handlers/handler-utils.ts (`1`/`0` work at runtime); strict boolStr reported them invalid (#5155). |
| `NEXUS_IMPROVEMENT_REVIEW_FILE_ISSUES` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | parseBoolEnv consumers (config/defaults-env.ts:50). The helper accepts exactly true\|1\|false\|0, case-insensitively — NOT yes/no/on/off, which fall through to the default. Accepting a wider set here would tell the user `yes` works when the code silently ignores it. |
| `NEXUS_IMPROVEMENT_REVIEW_INTERVAL_MS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_JOB_MAX_CONCURRENT_TOTAL` | string; pattern /^\\d+$/ | Not declared in schema | `0` is meaningful here — it disables async job dispatch entirely — so this is non-negative, not positive (job-concurrency.ts:106 accepts `>= 0`). |
| `NEXUS_JOB_RESULT_SOURCE` | sidecar \| task_state | Not declared in schema | Async job-result reader source (#3090/#3693): `task_state` prefers/unions the Stage-2 task-state log; default (unset) is sidecar-only. Reader half of the sidecar→Stage-2 migration (epic #2631). |
| `NEXUS_LLM_CLASSIFICATION` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Allow LLM-based pipeline classification when keyword scoring finds no evidence (#4677). Off by default: fixing the confidence floor made the enrichment gate reachable for the first time, and measurement put that at ~60% of realistic goals — one LLM call each. Opt in deliberately. |
| `NEXUS_LOG_LEVEL` | trace \| debug \| info \| warn \| error \| fatal \| silent | Not declared in schema | Not described in schema |
| `NEXUS_MAX_CONCURRENT_EXPERTS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_MCP_CHILD` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | #6795: set by the generated child MCP config (cli-adapters/child-mcp-config.ts). A nexus-agents server spawned for an expert CLI serves model-driven calls, so `connectTransport` records its stdio caller as unmeasured, not tier 1. |
| `NEXUS_MCP_DEPTH` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_MCP_POLICY_ENFORCE` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | #6431: the per-operator opt-in that runs the MCP PolicyFirewall in enforce (mcp/middleware/policy-registry.ts). Default off = warn: rules evaluate and log would-be denials, none is applied. #4987/#4988 described this flag before it had a reader. |
| `NEXUS_MCP_TIMEOUT_MS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_META_SHADOW_TRAIN` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Feed live dispatch outcomes into the MetaOrchestrator shadow selector + persist them (#3593); off by default. |
| `NEXUS_MODEL_REGISTRY_OVERLAY` | string | Not declared in schema | Not described in schema |
| `NEXUS_MODELS_OVERLAY_PATH` | string | Not declared in schema | Path to a model-registry overlay manifest (buildDefaultRegistry / #3185 hot-reload). |
| `NEXUS_NO_SCAFFOLD` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_OPENAI_COMPAT_AUTH_HEADER` | string | Not declared in schema | #6608: the header carrying the gateway key instead of `Authorization: Bearer` (OPENAI\_COMPAT\_AUTH\_HEADER\_ENV), e.g. `api-key`. The runtime reader warns on an illegal header name and keeps the bearer default. |
| `NEXUS_OPENAI_COMPAT_ENDPOINT` | string; custom validation | Not declared in schema | #4392 increment 2 step 2: the `<endpoint>` of the `api:<endpoint>` arm the voter gateway registers as (OPENAI\_COMPAT\_ENDPOINT\_ENV; spelled out for the coverage script). Same shape rule as a scoped NEXUS\_GATEWAY\_COST key, so a URL — or a credential inside one — can never become an arm id, and never a built-in vendor segment, which would make the gateway a VENDOR arm (#6409). The rule is `gatewayEndpointRejection`, shared with the runtime reader; an invalid value is reported here and that reader falls back to the default endpoint (`openai-compat`). |
| `NEXUS_OPENAI_COMPAT_EXTRA_HEADERS` | string; custom validation | Not declared in schema | #6608: extra static gateway headers, `Name=value,Name2=value2` (OPENAI\_COMPAT\_EXTRA\_HEADERS\_ENV). Validated by the runtime parser; a value can be a credential, so an invalid one is logged redacted. |
| `NEXUS_OPENAI_COMPAT_KEY` | string | Not declared in schema | Not described in schema |
| `NEXUS_OPENAI_COMPAT_MODELS` | string | Not declared in schema | #6600: gateway model-id allowlist (OPENAI\_COMPAT\_MODELS\_ENV), applied before the per-gateway adapter cap. Comma-separated; `*` is a wildcard. |
| `NEXUS_OPENAI_COMPAT_URL` | string | Not declared in schema | Not described in schema |
| `NEXUS_OPENCODE_CONFIG` | string | Not declared in schema | Not described in schema |
| `NEXUS_PERSIST_LEARNING` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_POLICY_GATE_MODE` | off \| warn \| block | Not declared in schema | Stage-boundary policy gate enforcement mode (getGateEnforcementMode); warn by default. Read by dev-pipeline's consensus→execute gate, and by any compiled gate node whose caller supplies a `policyEnforcement` bundle without a mode (no in-tree caller supplies a bundle today). The V2 delegate graph declares no gate (#4657); v2-orchestrate's execute check reads the V2 policy-mode variable instead (its own entry below; see CONFIGURATION.md). |
| `NEXUS_PORTABLE_MODE` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_PR_REVIEW_RECORDS_PATH` | string | Not declared in schema | Not described in schema |
| `NEXUS_REFLECTIVE_MEMORY` | true \| false \| shadow | Not declared in schema | Not described in schema |
| `NEXUS_REPO_MAP` | 0 \| 1 | Not declared in schema | Attach a ranked, budgeted repo-map (module import graph, PageRank-centrality) to context for structural tasks (#4254, getRepoMapForTask); pull-shaped + rank-gated, off by default. |
| `NEXUS_REPO_PREFERRED` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | `0` opts out of the per-repo data dir (epic #2872; default ON). |
| `NEXUS_REPUTATION_GATING` | string; custom validation (Must be one of: off, audit, enforce) | Not declared in schema | Lowercased before parsing, so mixed case is genuinely accepted. |
| `NEXUS_ROUTE_GATEWAY_ARMS` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | #7151 OPTION B: endpoint router arms are opt-in in every billing mode. |
| `NEXUS_ROUTE_MODEL_SELECTION` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Resolve a concrete model from the difficulty tier at route time (#3394, isRouteModelSelectionEnabled); off by default. Registered here in #4197 — the reader predates this schema entry. |
| `NEXUS_ROUTE_MODEL_SHADOW` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Record would-be tier model selections (shadow) + join them with outcomes for the offline flip eval (#4197, isRouteModelShadowEnabled); off by default. |
| `NEXUS_SANDBOX` | string | Not declared in schema | Sandbox FLAVOR string (`docker-opencode`, `codex`, …), set by the host image so sandbox-detection knows it is inside one (epic #2500, #5026). It was registered as a boolean while every producer and reader used a flavor string, so the documented value warned as invalid at startup (#5695). Empty is the POSIX idiom for "override the image's export and turn it off"; sandbox-detection reads empty as unset, so the validator accepts it too. |
| `NEXUS_SANDBOX_ROOT` | string | Not declared in schema | Not described in schema |
| `NEXUS_SENSITIVE_REFS` | string | Not declared in schema | Not described in schema |
| `NEXUS_SESSIONS_DB` | string | Not declared in schema | Not described in schema |
| `NEXUS_STRATEGY_DISTILLATION` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | #6512: off switch for strategy distillation only (read by isStrategyDistillationEnabled). |
| `NEXUS_SUBPROCESS_DEPTH` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_SUBPROCESS_ENV_ALLOWLIST` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_SUBPROCESS_EXTRA_ENV` | string | Not declared in schema | Not described in schema |
| `NEXUS_TASK_STATE_ENABLED` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_TIMEOUT_CLASS_ASYNC_JOB_BODY_MS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_TIMEOUT_CLASS_INTERACTIVE_MS` | string; pattern /^\\d+$/ | Not declared in schema | Per-operation-class guard overrides (ms). One per OperationClassName; env-schema can't match dynamic names, so the six are registered explicitly. |
| `NEXUS_TIMEOUT_CLASS_MULTI_LLM_PANEL_MS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_TIMEOUT_CLASS_NETWORK_FETCH_MS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_TIMEOUT_CLASS_PIPELINE_MS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_TIMEOUT_CLASS_SINGLE_LLM_MS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_TIMEOUT_MULTIPLIER` | string; pattern /^\\d+(\\.\\d+)?$/ | Not declared in schema | Global scale applied to every operation-class runaway-guard (clamped 0.25–10). |
| `NEXUS_TMPDIR` | string | Not declared in schema | Scratch root for short-lived working files (#4412, getNexusTmpDir). Unset resolves to `<dataDir>/tmp`; set it to relocate scratch off the repo. |
| `NEXUS_TUNE_ENFORCE` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_V2_DELEGATE` | true \| false | Not declared in schema | Not described in schema |
| `NEXUS_V2_MODE` | off \| partial \| full | Not declared in schema | Not described in schema |
| `NEXUS_V2_ORCHESTRATE` | true \| false | Not declared in schema | Not described in schema |
| `NEXUS_V2_POLICY_MODE` | off \| warn \| block | Not declared in schema | Not described in schema |
| `NEXUS_VERSION_CHECK` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_VOTE_RECORDS_PATH` | string | Not declared in schema | Not described in schema |
| `NEXUS_VOTE_SIGNING_KEY` | string | Not declared in schema | #3927 item 4: the SSH key `scripts/append-ratification-record.ts` signs a committed vote record's hash with (`--signing-key` overrides it). A path; unset ⇒ the agent key at `<dataDir>/auth/vote-record-signing.key` when it exists (#6257), else the record is appended unsigned and the script says so. |
| `NEXUS_VOTE_TIMEOUT_MS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_WORKER_MAX_CALLS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_WORKER_TIMEOUT_MS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_WORKFLOW_TIMEOUT_MS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |

---
title: 'Environment Variable Reference'
description: 'Registered NEXUS environment variables, accepted values, schema defaults and descriptions.'
diataxis: reference
audience: user
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
| `NEXUS_ALLOW_MOCK_ORCHESTRATION` | `true` \| `false` | Not declared in schema | Not described in schema |
| `NEXUS_ALLOW_SIMULATE` | `0` \| `1` | Not declared in schema | Explicit opt-in for simulateVotes outside test runners (#4170) — read by checkSimulationAllowed (mcp/tools/simulation-guard.ts). Unset = fail closed. |
| `NEXUS_AORCHESTRA` | `true` \| `false` | Not declared in schema | Not described in schema |
| `NEXUS_AORCHESTRA_DISPATCH` | `true` \| `false` | Not declared in schema | Not described in schema |
| `NEXUS_AUTH_ENABLED` | `true` \| `false` | Not declared in schema | Not described in schema |
| `NEXUS_AUTO_REMEDIATE` | `off` \| `audit` \| `enforce` | Not declared in schema | Not described in schema |
| `NEXUS_BILLING_MODE` | `plan` \| `api` | Not declared in schema | Not described in schema |
| `NEXUS_BUDGET_ENFORCE` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_BUDGET_TOLERANCE` | string; pattern /^\\d+(\\.\\d+)?$/ | Not declared in schema | Not described in schema |
| `NEXUS_CAPABILITY_GAP_INFERRED` | `0` \| `1` | Not declared in schema | Not described in schema |
| `NEXUS_CI_HEALTH_MAX_BYTES` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_CODEPR_TOKEN` | string | Not declared in schema | Not described in schema |
| `NEXUS_CONFIG_PATH` | string | Not declared in schema | Not described in schema |
| `NEXUS_CONSENSUS_ENFORCE` | `off` \| `audit` \| `enforce` | Not declared in schema | Not described in schema |
| `NEXUS_CONSOLE` | string; custom validation (Must be one of: true, false, 1, 0, on, off) | Not declared in schema | Not described in schema |
| `NEXUS_CONTEXT_RANKED` | `0` \| `1` | Not declared in schema | Not described in schema |
| `NEXUS_CONTEXT_RETRIEVER_INJECT` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_CONTEXT_WARN_THRESHOLD` | string; pattern /^\\d+(\\.\\d+)?$/ | Not declared in schema | Not described in schema |
| `NEXUS_CUSTOM_API_ALLOW_PRIVATE` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_CUSTOM_API_SURFACE` | string; custom validation (Must be one of: responses, chat) | Not declared in schema | Not described in schema |
| `NEXUS_CUSTOM_MODEL` | string | Not declared in schema | Not described in schema |
| `NEXUS_DATA_DIR` | string | Not declared in schema | Not described in schema |
| `NEXUS_DISABLED_CLIS` | string | Not declared in schema | #6590: comma-separated CliNames to take out of service. A plain string on purpose: an unknown name is warned about and ignored by the one reader (cli-adapters/disabled-clis.ts), so a stricter schema would turn one typo into an invalid-value report for the whole variable. |
| `NEXUS_DISABLE_METRICS` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_DISABLE_SESSIONS` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_DYNAMIC_MODELS` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_EVENTBUS_ENABLED` | `true` \| `false` | Not declared in schema | Not described in schema |
| `NEXUS_EXPERT_TIMEOUT_MS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_FIREWALL_POLICY` | string; custom validation (Must be one of: off, audit, enforce) | Not declared in schema | #5382: rollout gate for HostileInputFirewall behaviour changes. Defaults to `off` — unlike NEXUS\_REPUTATION\_GATING, which defaults to `enforce` — because the firewall is a PUBLISHED API with external callers, so a stricter default would be a silent breaking change. Same tri-state and same coercion as its two sibling flags; see security/firewall/firewall-policy-mode.ts. |
| `NEXUS_GATEWAY_COST` | string; custom validation | Not declared in schema | Not described in schema |
| `NEXUS_GATEWAY_MODEL_ANTHROPIC` | string | Not declared in schema | Not described in schema |
| `NEXUS_GATEWAY_MODEL_GOOGLE` | string | Not declared in schema | Not described in schema |
| `NEXUS_GATEWAY_MODEL_OPENAI` | string | Not declared in schema | Not described in schema |
| `NEXUS_GITIGNORE_AUTO` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_GRAPH_TIMEOUT_MS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_HOOK_VERBOSE` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_IMPROVEMENT_REVIEW_FILE_ISSUES` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_IMPROVEMENT_REVIEW_INTERVAL_MS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_JOB_MAX_CONCURRENT_TOTAL` | string; pattern /^\\d+$/ | Not declared in schema | `0` is meaningful here — it disables async job dispatch entirely — so this is non-negative, not positive (job-concurrency.ts:106 accepts `>= 0`). |
| `NEXUS_JOB_RESULT_SOURCE` | `sidecar` \| `task_state` | Not declared in schema | Async job-result reader source (#3090/#3693): `task_state` prefers/unions the Stage-2 task-state log; default (unset) is sidecar-only. Reader half of the sidecar→Stage-2 migration (epic #2631). |
| `NEXUS_LLM_CLASSIFICATION` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_LOG_LEVEL` | `trace` \| `debug` \| `info` \| `warn` \| `error` \| `fatal` \| `silent` | Not declared in schema | Not described in schema |
| `NEXUS_MAX_CONCURRENT_EXPERTS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_MCP_CHILD` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_MCP_DEPTH` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_MCP_POLICY_ENFORCE` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_MCP_TIMEOUT_MS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_META_SHADOW_TRAIN` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_MODELS_OVERLAY_PATH` | string | Not declared in schema | Not described in schema |
| `NEXUS_MODEL_REGISTRY_OVERLAY` | string | Not declared in schema | Not described in schema |
| `NEXUS_NO_SCAFFOLD` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_OPENAI_COMPAT_AUTH_HEADER` | string | Not declared in schema | Not described in schema |
| `NEXUS_OPENAI_COMPAT_ENDPOINT` | string; custom validation | Not declared in schema | Not described in schema |
| `NEXUS_OPENAI_COMPAT_EXTRA_HEADERS` | string; custom validation | Not declared in schema | Not described in schema |
| `NEXUS_OPENAI_COMPAT_KEY` | string | Not declared in schema | Not described in schema |
| `NEXUS_OPENAI_COMPAT_MODELS` | string | Not declared in schema | Not described in schema |
| `NEXUS_OPENAI_COMPAT_URL` | string | Not declared in schema | Not described in schema |
| `NEXUS_OPENCODE_CONFIG` | string | Not declared in schema | Not described in schema |
| `NEXUS_PERSIST_LEARNING` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_POLICY_GATE_MODE` | `off` \| `warn` \| `block` | Not declared in schema | Not described in schema |
| `NEXUS_PORTABLE_MODE` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_PR_REVIEW_RECORDS_PATH` | string | Not declared in schema | Not described in schema |
| `NEXUS_REFLECTIVE_MEMORY` | `true` \| `false` \| `shadow` | Not declared in schema | Not described in schema |
| `NEXUS_REPO_MAP` | `0` \| `1` | Not declared in schema | Not described in schema |
| `NEXUS_REPO_PREFERRED` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_REPUTATION_GATING` | string; custom validation (Must be one of: off, audit, enforce) | Not declared in schema | Lowercased before parsing, so mixed case is genuinely accepted. |
| `NEXUS_ROUTE_GATEWAY_ARMS` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_ROUTE_MODEL_SELECTION` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_ROUTE_MODEL_SHADOW` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_SANDBOX` | string | Not declared in schema | Not described in schema |
| `NEXUS_SANDBOX_ROOT` | string | Not declared in schema | Not described in schema |
| `NEXUS_SENSITIVE_REFS` | string | Not declared in schema | Not described in schema |
| `NEXUS_SESSIONS_DB` | string | Not declared in schema | Not described in schema |
| `NEXUS_STRATEGY_DISTILLATION` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_SUBPROCESS_DEPTH` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_SUBPROCESS_ENV_ALLOWLIST` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_SUBPROCESS_EXTRA_ENV` | string | Not declared in schema | Not described in schema |
| `NEXUS_TASK_STATE_ENABLED` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_TIMEOUT_CLASS_ASYNC_JOB_BODY_MS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_TIMEOUT_CLASS_INTERACTIVE_MS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_TIMEOUT_CLASS_MULTI_LLM_PANEL_MS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_TIMEOUT_CLASS_NETWORK_FETCH_MS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_TIMEOUT_CLASS_PIPELINE_MS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_TIMEOUT_CLASS_SINGLE_LLM_MS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_TIMEOUT_MULTIPLIER` | string; pattern /^\\d+(\\.\\d+)?$/ | Not declared in schema | Not described in schema |
| `NEXUS_TMPDIR` | string | Not declared in schema | Not described in schema |
| `NEXUS_TUNE_ENFORCE` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_V2_DELEGATE` | `true` \| `false` | Not declared in schema | Not described in schema |
| `NEXUS_V2_MODE` | `off` \| `partial` \| `full` | Not declared in schema | Not described in schema |
| `NEXUS_V2_ORCHESTRATE` | `true` \| `false` | Not declared in schema | Not described in schema |
| `NEXUS_V2_POLICY_MODE` | `off` \| `warn` \| `block` | Not declared in schema | Not described in schema |
| `NEXUS_VERSION_CHECK` | string; custom validation (Must be one of: true, false, 1, 0) | Not declared in schema | Not described in schema |
| `NEXUS_VOTE_RECORDS_PATH` | string | Not declared in schema | Not described in schema |
| `NEXUS_VOTE_SIGNING_KEY` | string | Not declared in schema | #3927 item 4: the SSH key `scripts/append-ratification-record.ts` signs a committed vote record's hash with (`--signing-key` overrides it). A path; unset ⇒ the agent key at `<dataDir>/auth/vote-record-signing.key` when it exists (#6257), else the record is appended unsigned and the script says so. |
| `NEXUS_VOTE_TIMEOUT_MS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_WORKER_MAX_CALLS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_WORKER_TIMEOUT_MS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |
| `NEXUS_WORKFLOW_TIMEOUT_MS` | string; pattern /^\\d+$/ | Not declared in schema | Not described in schema |

## Variable families

Family names combine a registered prefix with a suffix accepted by its source rule.
Suffix expressions below are shown from `DYNAMIC_FAMILIES` without evaluation.

| Prefix | Suffix rule |
| ------ | ----------- |
| `NEXUS_JOB_MAX_CONCURRENT_` | `any-identifier` |
| `NEXUS_VOTER_MODEL_` | `Object.keys(VOTER_ROLES).map((r) => r.toUpperCase())` |

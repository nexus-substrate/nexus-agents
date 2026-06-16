/**
 * nexus-agents/orchestration - Strategy manifest registry (the live 8 manifests).
 *
 * The runtime source of truth for the eight routable execution strategies. This
 * REPLACES the former hardcoded `STRATEGY_ENTRYPOINT_TOOL` map in run-tool.ts
 * (#3835): the entrypoint-tool and executor-availability lookups the run path
 * needs are now DATA, read from a validated manifest registry rather than a
 * literal map embedded in the tool layer.
 *
 * The manifests are embedded here as a typed constant (no disk I/O on the MCP
 * hot path) and validated through {@link parseStrategyManifestRegistry} AT MODULE
 * LOAD — a malformed registry fails closed at import time, exactly as the
 * disk-loaded path would. The companion `governance/strategy-manifests.yaml` is
 * the human-facing / docs source of truth (#3838) and the drift-gate target
 * (#3837); `strategy-manifest-registry.test.ts` asserts the two are equal so
 * they cannot diverge.
 *
 * Out of scope (deferred): the selection-logic refactor that routes PURELY over
 * this data — `decideStrategy` in meta-orchestrator.ts — is #3836. This module
 * only relocates the entrypoint/executor lookups off the hardcoded map.
 *
 * @module orchestration/strategy-manifest-registry
 * (Source: Issue #3833, #3835 — schema landed via #3834)
 */

import {
  StrategyManifestRegistrySchema,
  STRATEGY_MANIFEST_SCHEMA_VERSION,
  type StrategyManifest,
  type StrategyManifestRegistry,
} from './strategy-manifest.js';
import type { ExecutionStrategy } from './meta-orchestrator.js';

/**
 * The eight live strategy manifests. MIRRORS `governance/strategy-manifests.yaml`
 * byte-for-byte (enforced by the registry test). Forward-compat `authorityTier`
 * (Epic D) / `costProfile` (Epic G) are intentionally omitted until those epics
 * populate them.
 */
const RAW_REGISTRY: StrategyManifestRegistry = {
  version: 1,
  manifests: [
    {
      id: 'single-shot',
      schemaVersion: STRATEGY_MANIFEST_SCHEMA_VERSION,
      strategy: 'single-shot',
      entrypointTool: 'delegate_to_model',
      executorAvailable: false,
      description: 'Trivial single-step task delegated to one model.',
      whenToForce:
        'Force when the goal is a one-shot ask that needs no pipeline, gate, or multi-step plan.',
      maturityTier: 'stable',
      latencyClass: 'single-llm',
    },
    {
      id: 'dev-pipeline',
      schemaVersion: STRATEGY_MANIFEST_SCHEMA_VERSION,
      strategy: 'dev-pipeline',
      entrypointTool: 'run_dev_pipeline',
      executorAvailable: true,
      description: 'Code change run through the dev gate (test / lint / typecheck).',
      whenToForce:
        'Force when the goal is a code change that must pass the dev quality gate before it counts as done.',
      maturityTier: 'stable',
      latencyClass: 'pipeline',
    },
    {
      id: 'pipeline',
      schemaVersion: STRATEGY_MANIFEST_SCHEMA_VERSION,
      strategy: 'pipeline',
      entrypointTool: 'run_pipeline',
      executorAvailable: true,
      description: 'Multi-stage templated work (audit / general) via the pipeline engine.',
      whenToForce:
        'Force when the work fits a templated multi-stage pipeline rather than a single model call.',
      maturityTier: 'stable',
      latencyClass: 'pipeline',
    },
    {
      id: 'graph-workflow',
      schemaVersion: STRATEGY_MANIFEST_SCHEMA_VERSION,
      strategy: 'graph-workflow',
      entrypointTool: 'run_graph_workflow',
      executorAvailable: false,
      description: 'DAG / conditional-edge workflow execution.',
      whenToForce:
        'Force when the work is an explicit dependency graph with conditional edges (a predefined workflow template).',
      maturityTier: 'beta',
      latencyClass: 'pipeline',
    },
    {
      id: 'orchestrate',
      schemaVersion: STRATEGY_MANIFEST_SCHEMA_VERSION,
      strategy: 'orchestrate',
      entrypointTool: 'orchestrate',
      executorAvailable: false,
      description: 'Pattern-based multi-agent orchestration (wave / aflow / puppeteer).',
      whenToForce:
        'Force when the work needs multi-agent orchestration patterns rather than a single linear pipeline.',
      maturityTier: 'beta',
      latencyClass: 'async-job-body',
    },
    {
      id: 'consensus',
      schemaVersion: STRATEGY_MANIFEST_SCHEMA_VERSION,
      strategy: 'consensus',
      entrypointTool: 'consensus_vote',
      executorAvailable: true,
      description: 'Multi-perspective decision routed to a consensus vote.',
      whenToForce: 'Force when a decision needs N independent voters rather than one model.',
      maturityTier: 'stable',
      latencyClass: 'multi-llm-panel',
    },
    {
      id: 'spec',
      schemaVersion: STRATEGY_MANIFEST_SCHEMA_VERSION,
      strategy: 'spec',
      entrypointTool: 'execute_spec',
      executorAvailable: false,
      description: 'Greenfield project built from a markdown spec document.',
      whenToForce:
        'Force when building a greenfield project from a written spec, not a plain goal string.',
      maturityTier: 'beta',
      latencyClass: 'async-job-body',
    },
    {
      id: 'research',
      schemaVersion: STRATEGY_MANIFEST_SCHEMA_VERSION,
      strategy: 'research',
      entrypointTool: 'run_pipeline',
      executorAvailable: true,
      description: 'Research-heavy work routed through the research pipeline.',
      whenToForce:
        'Force when the goal is research-led (gather, synthesize, compare) rather than a code change or decision.',
      maturityTier: 'stable',
      latencyClass: 'pipeline',
    },
  ],
};

/**
 * The validated live registry. Parsed through the Zod schema at module load so a
 * malformed embedded manifest fails closed at import time (same discipline as the
 * disk loader). The `.strict()` schema also rejects a typo'd field.
 */
export const STRATEGY_MANIFEST_REGISTRY: StrategyManifestRegistry =
  StrategyManifestRegistrySchema.parse(RAW_REGISTRY);

/** Index manifests by strategy for O(1) lookups; built once at module load. */
const BY_STRATEGY: ReadonlyMap<ExecutionStrategy, StrategyManifest> = new Map(
  STRATEGY_MANIFEST_REGISTRY.manifests.map((m) => [m.strategy, m])
);

/** Returns the manifest fronting a strategy, or undefined if none is registered. */
export function getStrategyManifest(strategy: ExecutionStrategy): StrategyManifest | undefined {
  return BY_STRATEGY.get(strategy);
}

/**
 * The concrete MCP tool / engine that fronts a strategy — the manifest-sourced
 * replacement for the former `STRATEGY_ENTRYPOINT_TOOL[strategy]` lookup. Throws
 * if the strategy has no manifest: every {@link ExecutionStrategy} MUST be
 * registered, and a missing one is a programming error caught fail-closed (the
 * registry test asserts full coverage).
 */
export function entrypointToolFor(strategy: ExecutionStrategy): string {
  const manifest = BY_STRATEGY.get(strategy);
  if (manifest === undefined) {
    throw new Error(`No strategy manifest registered for strategy '${strategy}'`);
  }
  return manifest.entrypointTool;
}

/**
 * Whether a wired inline executor exists for a strategy (the fail-closed routing
 * key) — the manifest-sourced replacement for the implicit "is this strategy a
 * key of buildDefaultExecutors" check. Throws on an unregistered strategy for the
 * same reason as {@link entrypointToolFor}.
 */
export function executorAvailableFor(strategy: ExecutionStrategy): boolean {
  const manifest = BY_STRATEGY.get(strategy);
  if (manifest === undefined) {
    throw new Error(`No strategy manifest registered for strategy '${strategy}'`);
  }
  return manifest.executorAvailable;
}

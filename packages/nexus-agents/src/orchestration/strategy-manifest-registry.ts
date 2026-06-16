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
  type SelectionRule,
} from './strategy-manifest.js';
import type { ExecutionStrategy } from './meta-orchestrator.js';
import type { WorkflowPattern } from './workflow-router-types.js';
import type { PipelineType } from '../pipeline/adaptive-orchestrator.js';
import type { TaskAnalysisResult } from '../core/task-analysis/shared-task-analyzer.js';

/**
 * The eight live strategy manifests. MIRRORS `governance/strategy-manifests.yaml`
 * byte-for-byte (enforced by the registry test). `authorityTier` is now DECLARED
 * and machine-enforced (Epic D, #3841 — semantics in ADR-0017): work-producing
 * strategies are `suggest` (output inert until a human/governor acts), `consensus`
 * is `advisory` (non-blocking votes). None are `enforce` — that requires an earned
 * evidence record + ratification, never a default flip. `costProfile` (Epic G)
 * stays omitted until that epic populates it.
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
      authorityTier: 'suggest',
      // Sequential + trivial complexity collapses to the lightest engine.
      selectionRules: [{ priority: 40, patterns: ['sequential'], complexities: ['simple'] }],
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
      authorityTier: 'suggest',
      // The default for any non-trivial sequential task (single-shot outranks it
      // only at `simple` complexity; the audit/template overrides outrank both).
      selectionRules: [{ priority: 30, patterns: ['sequential'] }],
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
      authorityTier: 'suggest',
      // The audit template is more specific than the plain sequential default:
      // it upgrades a sequential single-shot/dev-pipeline choice to the pipeline.
      selectionRules: [{ priority: 80, pipelineTypes: ['audit'], patterns: ['sequential'] }],
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
      authorityTier: 'suggest',
      selectionRules: [{ priority: 50, patterns: ['graph'] }],
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
      authorityTier: 'suggest',
      selectionRules: [{ priority: 50, patterns: ['wave', 'aflow', 'puppeteer'] }],
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
      authorityTier: 'advisory',
      // An explicit consensus requirement outranks every template/pattern choice.
      selectionRules: [{ priority: 100, patterns: ['consensus'] }],
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
      authorityTier: 'suggest',
      // A greenfield template outranks the structural pattern fallback.
      selectionRules: [{ priority: 90, pipelineTypes: ['greenfield'] }],
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
      authorityTier: 'suggest',
      // A research template outranks the structural pattern fallback.
      selectionRules: [{ priority: 90, pipelineTypes: ['research'] }],
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

/** The routing signals a manifest selection rule is matched against (#3836). */
export interface RoutingSignals {
  readonly pattern: WorkflowPattern;
  readonly pipelineType: PipelineType;
  readonly complexity: TaskAnalysisResult['complexity'];
}

/** A manifest matched by the router, plus the rule that won. */
export interface ManifestSelection {
  readonly strategy: ExecutionStrategy;
  readonly manifest: StrategyManifest;
  readonly rule: SelectionRule;
}

/** Whether one selection rule matches the routing signals (all predicates AND). */
function ruleMatches(rule: SelectionRule, signals: RoutingSignals): boolean {
  if (rule.patterns !== undefined && !rule.patterns.includes(signals.pattern)) return false;
  if (rule.pipelineTypes !== undefined && !rule.pipelineTypes.includes(signals.pipelineType)) {
    return false;
  }
  if (rule.complexities !== undefined && !rule.complexities.includes(signals.complexity)) {
    return false;
  }
  return true;
}

/** Raised when two DIFFERENT strategies match the same signals at equal priority. */
export class AmbiguousManifestSelectionError extends Error {
  constructor(
    readonly priority: number,
    readonly strategies: readonly ExecutionStrategy[],
    readonly signals: RoutingSignals
  ) {
    super(
      `Ambiguous manifest selection: strategies [${strategies.join(', ')}] match ` +
        `signals ${JSON.stringify(signals)} at equal priority ${String(priority)}. ` +
        `Resolve by giving exactly one rule a higher priority or a disjoint predicate ` +
        `(routing must never be decided by strategy name — #3888).`
    );
    this.name = 'AmbiguousManifestSelectionError';
  }
}

/**
 * Computes the best matching rule per strategy for the given signals. Returns the
 * winners ordered best-first by matching-rule priority. The single source of truth
 * shared by {@link selectStrategyByManifest} (takes the head) and
 * {@link rankStrategiesByManifest} (takes the full ordered list), so the SELECTION
 * path and the transparency ALTERNATIVES path can never drift (#3888).
 *
 * FAIL-FAST on ambiguity: if two DIFFERENT strategies tie at the top priority for
 * these signals, this throws {@link AmbiguousManifestSelectionError} rather than
 * silently breaking the tie by strategy name (the #3888 fix). No reachable tie
 * exists on the live 8 manifests today, so this is dead-but-defensive now and
 * surfaces a future overlapping same-priority rule loudly.
 *
 * Names ZERO strategies (the #3836 invariant): adding a strategy is registering a
 * manifest with rules, never editing this matcher.
 */
function matchingSelections(
  signals: RoutingSignals,
  manifests: readonly StrategyManifest[]
): ManifestSelection[] {
  // Best (highest-priority) matching rule per strategy.
  const bestPerStrategy = new Map<ExecutionStrategy, ManifestSelection>();
  for (const manifest of manifests) {
    if (manifest.selectionRules === undefined) continue;
    for (const rule of manifest.selectionRules) {
      if (!ruleMatches(rule, signals)) continue;
      const prev = bestPerStrategy.get(manifest.strategy);
      if (prev === undefined || rule.priority > prev.rule.priority) {
        bestPerStrategy.set(manifest.strategy, { strategy: manifest.strategy, manifest, rule });
      }
    }
  }

  const selections = [...bestPerStrategy.values()].sort(
    (a, b) => b.rule.priority - a.rule.priority
  );

  // Guard the TOP priority: two distinct strategies tied for first place means the
  // winner would otherwise be decided by name. Surface it instead of hiding it.
  const [first, second] = selections;
  if (first !== undefined && first.rule.priority === second?.rule.priority) {
    const topPriority = first.rule.priority;
    const tied = selections.filter((s) => s.rule.priority === topPriority).map((s) => s.strategy);
    throw new AmbiguousManifestSelectionError(topPriority, tied, signals);
  }

  return selections;
}

/**
 * The manifest-driven router core (#3836). Evaluates every registered manifest's
 * {@link SelectionRule}s against the routing signals and returns the strategy
 * whose matching rule has the HIGHEST priority. Returns `undefined` only if NO
 * rule across the whole registry matches — the caller decides the fallback.
 *
 * Equal-priority collisions between two strategies FAIL FAST
 * ({@link AmbiguousManifestSelectionError}, #3888) instead of the former silent
 * alphabetical-name tie-break, so a future overlapping same-priority rule surfaces
 * loudly rather than letting a rename quietly change routing.
 *
 * Crucially this function names ZERO strategies: adding a strategy is registering
 * a manifest with rules, never editing this matcher (the #3836 invariant, proven
 * by the synthetic-9th-manifest test).
 */
export function selectStrategyByManifest(
  signals: RoutingSignals,
  manifests: readonly StrategyManifest[] = STRATEGY_MANIFEST_REGISTRY.manifests
): ManifestSelection | undefined {
  return matchingSelections(signals, manifests)[0];
}

/**
 * Ranks every strategy whose selection rules MATCH the signals, best-first by
 * matching-rule priority (#3888). This is the manifest-derived source of truth for
 * the transparency "alternatives" list: it replaces the former hardcoded
 * `strategyFrom*` table so the alternatives can never drift from the selection
 * path. Shares ambiguity-detection with {@link selectStrategyByManifest}, so an
 * equal-priority collision throws here too. The head of this list is exactly what
 * {@link selectStrategyByManifest} returns.
 */
export function rankStrategiesByManifest(
  signals: RoutingSignals,
  manifests: readonly StrategyManifest[] = STRATEGY_MANIFEST_REGISTRY.manifests
): ExecutionStrategy[] {
  return matchingSelections(signals, manifests).map((s) => s.strategy);
}

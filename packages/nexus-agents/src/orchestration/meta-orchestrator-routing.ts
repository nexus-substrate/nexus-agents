/**
 * nexus-agents/orchestration - MetaOrchestrator manifest-driven routing core (#3836).
 *
 * The selection logic the MetaOrchestrator routes over. Extracted from
 * `meta-orchestrator.ts` so the orchestrator file stays a thin wiring layer
 * (CODING_STANDARDS ≤400 lines) and so the router is a single cohesive unit.
 *
 * The router routes PURELY over strategy-manifest data: {@link decideStrategy}
 * matches the registry's {@link selectStrategyByManifest} rules and names ZERO
 * strategies itself. Adding a routable strategy is "register a manifest with
 * selection rules", not "edit this router" — the #3836 invariant, proven by the
 * synthetic-9th-manifest test. The two `strategyFrom*` helpers remain for the
 * best-first ALTERNATIVES list (a transparency aid, not the selection path) and
 * for the existing parity tests.
 *
 * @module orchestration/meta-orchestrator-routing
 * (Source: Issue #3836 — router refactor over the manifest registry)
 */

import type { ExecutionStrategy } from './meta-orchestrator.js';
import { selectStrategyByManifest, type ManifestSelection } from './strategy-manifest-registry.js';
import type { TaskClassification, PipelineType } from '../pipeline/adaptive-orchestrator.js';
import type { RoutingDecision, WorkflowPattern } from './workflow-router-types.js';
import type { TaskAnalysisResult } from '../core/task-analysis/shared-task-analyzer.js';

/** The chosen strategy plus the transparency fields a decision carries. */
export interface SelectionCore {
  readonly strategy: ExecutionStrategy;
  readonly reasoning: string;
  readonly confidence: number;
  /** The manifest id that won the selection (audit trail, AC #3836). */
  readonly manifestId: string;
  /** The schema version of the winning manifest (audit trail, AC #3836). */
  readonly manifestSchemaVersion: number;
}

/**
 * Maps a workflow pattern (+ complexity) to the execution strategy that engine
 * fronts. `sequential` collapses to the lightest engine that fits the
 * complexity. Retained for the alternatives list + parity tests; the SELECTION
 * path is manifest-driven via {@link decideStrategy}.
 */
export function strategyFromPattern(
  pattern: WorkflowPattern,
  complexity: TaskAnalysisResult['complexity']
): ExecutionStrategy {
  switch (pattern) {
    case 'consensus':
      return 'consensus';
    case 'graph':
      return 'graph-workflow';
    case 'wave':
    case 'aflow':
    case 'puppeteer':
      return 'orchestrate';
    case 'sequential':
      return complexity === 'simple' ? 'single-shot' : 'dev-pipeline';
    default: {
      // Exhaustiveness guard — a new pattern must be mapped explicitly.
      const _exhaustive: never = pattern;
      return _exhaustive;
    }
  }
}

/** Maps a pipeline template to the execution strategy that fronts it. */
export function strategyFromPipelineType(pipelineType: PipelineType): ExecutionStrategy {
  switch (pipelineType) {
    case 'greenfield':
      return 'spec';
    case 'research':
      return 'research';
    case 'audit':
      return 'pipeline';
    case 'dev':
      return 'dev-pipeline';
    case 'general':
      return 'pipeline';
    default: {
      const _exhaustive: never = pipelineType;
      return _exhaustive;
    }
  }
}

/** Human-readable reasoning for a manifest-driven selection. */
function reasoningFor(selection: ManifestSelection, routing: RoutingDecision): string {
  const { manifest, rule } = selection;
  const cause =
    rule.pipelineTypes !== undefined && rule.patterns === undefined
      ? `pipeline template "${rule.pipelineTypes.join('/')}"`
      : rule.pipelineTypes !== undefined
        ? `pipeline template "${rule.pipelineTypes.join('/')}" under pattern "${routing.pattern}"`
        : `pattern "${routing.pattern}"`;
  return `${cause} → ${manifest.strategy} (manifest ${manifest.id}; ${routing.reasoning})`;
}

/**
 * The core selection rule — now fully data-driven (#3836). It matches the
 * routing signals (pattern, pipeline template, complexity) against the strategy
 * manifests' declarative {@link SelectionRule}s and picks the highest-priority
 * match. No strategy names appear here. The fallback (no rule matched — not
 * reachable today since every workflow pattern is claimed by a manifest) routes
 * to the structural-pattern strategy so selection never throws.
 */
export function decideStrategy(
  routing: RoutingDecision,
  classification: TaskClassification
): SelectionCore {
  const { pattern, analysis } = routing;
  const { pipelineType } = classification;

  const selection = selectStrategyByManifest({
    pattern,
    pipelineType,
    complexity: analysis.complexity,
  });

  if (selection === undefined) {
    // Defensive: every pattern is claimed by a manifest today, so this is
    // unreachable, but selection must never throw on a novel signal combo.
    const fallback = strategyFromPattern(pattern, analysis.complexity);
    return {
      strategy: fallback,
      reasoning: `No manifest rule matched pattern "${pattern}" — structural fallback to ${fallback}`,
      confidence: routing.confidence,
      manifestId: fallback,
      manifestSchemaVersion: 0,
    };
  }

  // A pipeline-template match (greenfield/research/audit) reflects the
  // classifier's confidence; a pure structural-pattern match reflects the
  // router's. This preserves the pre-#3836 confidence sourcing exactly.
  const fromTemplate = selection.rule.pipelineTypes !== undefined;
  return {
    strategy: selection.strategy,
    reasoning: reasoningFor(selection, routing),
    confidence: fromTemplate ? classification.confidence : routing.confidence,
    manifestId: selection.manifest.id,
    manifestSchemaVersion: selection.manifest.schemaVersion,
  };
}

/** Builds the best-first alternatives list, excluding the chosen strategy. */
export function buildAlternatives(
  chosen: ExecutionStrategy,
  routing: RoutingDecision,
  classification: TaskClassification
): ExecutionStrategy[] {
  const candidates: ExecutionStrategy[] = [
    strategyFromPattern(routing.pattern, routing.analysis.complexity),
    strategyFromPipelineType(classification.pipelineType),
    'orchestrate',
  ];
  const seen = new Set<ExecutionStrategy>([chosen]);
  const alternatives: ExecutionStrategy[] = [];
  for (const c of candidates) {
    if (!seen.has(c)) {
      seen.add(c);
      alternatives.push(c);
    }
  }
  return alternatives;
}

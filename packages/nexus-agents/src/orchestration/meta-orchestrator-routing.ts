/**
 * nexus-agents/orchestration - MetaOrchestrator manifest-driven routing core (#3836).
 *
 * The selection logic the MetaOrchestrator routes over. Extracted from
 * `meta-orchestrator.ts` so the orchestrator file stays a thin wiring layer
 * (CODING_STANDARDS <=400 lines) and so the router is a single cohesive unit.
 *
 * The router routes PURELY over strategy-manifest data: {@link decideStrategy}
 * matches the registry's {@link selectStrategyByManifest} rules and names ZERO
 * strategies itself. Adding a routable strategy is "register a manifest with
 * selection rules", not "edit this router" -- the #3836 invariant, proven by the
 * synthetic-9th-manifest test. The best-first ALTERNATIVES list is ALSO derived
 * from the manifest `selectionRules` (via {@link rankStrategiesByManifest}), so
 * the transparency path can no longer drift from the selection path (#3888 -- the
 * former hardcoded `strategyFromPattern`/`strategyFromPipelineType` table is gone).
 *
 * @module orchestration/meta-orchestrator-routing
 * (Source: Issue #3836 -- router refactor over the manifest registry; #3888 hardening)
 */

import type { ExecutionStrategy } from './meta-orchestrator.js';
import {
  selectStrategyByManifest,
  rankStrategiesByManifest,
  type ManifestSelection,
} from './strategy-manifest-registry.js';
import type { TaskClassification } from '../pipeline/adaptive-orchestrator.js';
import type { RoutingDecision } from './workflow-router-types.js';

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
 * The core selection rule -- now fully data-driven (#3836). It matches the
 * routing signals (pattern, pipeline template, complexity) against the strategy
 * manifests' declarative {@link SelectionRule}s and picks the highest-priority
 * match. No strategy names appear here. The fallback (no rule matched -- not
 * reachable today since every workflow pattern is claimed by a manifest) routes
 * to the multi-agent `orchestrate` catch-all so selection never throws and the
 * router still names zero strategies in a structural table.
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
    // unreachable, but selection must never throw on a novel signal combo. The
    // `orchestrate` strategy is the multi-agent catch-all; we keep this a single
    // literal (not a structural table) so the #3836 "zero strategies named" intent
    // holds for the selection path.
    const fallback: ExecutionStrategy = 'orchestrate';
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

/**
 * Builds the best-first alternatives list, excluding the chosen strategy. Derived
 * from the SAME manifest `selectionRules` the selection path uses (#3888): it ranks
 * every OTHER strategy whose rules match the current signals best-first by their
 * matching-rule priority. This closes the former split-brain where the alternatives
 * came from a hardcoded `strategyFrom*` table that could drift from the manifest.
 */
export function buildAlternatives(
  chosen: ExecutionStrategy,
  routing: RoutingDecision,
  classification: TaskClassification
): ExecutionStrategy[] {
  const ranked = rankStrategiesByManifest({
    pattern: routing.pattern,
    pipelineType: classification.pipelineType,
    complexity: routing.analysis.complexity,
  });
  return ranked.filter((s) => s !== chosen);
}

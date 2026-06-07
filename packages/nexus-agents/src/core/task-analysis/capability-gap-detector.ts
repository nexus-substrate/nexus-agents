/**
 * Capability Gap Detector (Issue #906)
 *
 * Cross-checks required capabilities from SharedTaskAnalyzer against
 * available system capabilities (MCP tools, expert roles, workflows).
 *
 * Deterministic — no external calls needed. Uses static registries.
 *
 * @module core/task-analysis/capability-gap-detector
 */

import type { RequiredCapabilities } from './task-analysis-advocate.js';
import { TOOL_MANIFEST } from '../../mcp/tools/tool-manifest.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of capability gap analysis.
 */
export interface CapabilityGapReport {
  /** Capabilities that exist and can fulfill the request */
  readonly available: AvailableCapabilities;
  /** Capabilities needed but not available */
  readonly gaps: readonly CapabilityGap[];
  /** Whether all required capabilities are available */
  readonly allSatisfied: boolean;
}

/**
 * Available capabilities that matched requirements.
 */
export interface AvailableCapabilities {
  readonly tools: readonly string[];
  readonly experts: readonly string[];
}

/**
 * A single capability gap with suggestion.
 */
export interface CapabilityGap {
  readonly type: 'tool' | 'expert';
  readonly name: string;
  readonly suggestion: string;
}

// ============================================================================
// Static Registries — kept in sync with canonical sources
// ============================================================================

/**
 * All registered MCP tool names — derived directly from the canonical
 * {@link TOOL_MANIFEST} (#3566). Previously a hand-maintained copy guarded by a
 * freshness test (#3553); now a one-way derivation. `tool-manifest.ts` is a
 * pure-data leaf (imports nothing), so deriving from it keeps this hot-path,
 * low-level analyzer module free of the MCP tool dependency graph — no cycle.
 * Drift is impossible by construction.
 */
const AVAILABLE_TOOLS: ReadonlySet<string> = new Set(TOOL_MANIFEST);

/**
 * All built-in expert role names (`{type}_expert`).
 *
 * Kept in lockstep with `BuiltInExpertTypeSchema` (`src/agents/experts/expert-config.ts`);
 * enforced by the freshness assertions in `capability-gap-detector.test.ts` (#3553).
 */
const AVAILABLE_EXPERTS: ReadonlySet<string> = new Set([
  'code_expert',
  'architecture_expert',
  'security_expert',
  'documentation_expert',
  'testing_expert',
  'devops_expert',
  'research_expert',
  'pm_expert',
  'ux_expert',
  'infrastructure_expert',
  'qa_expert',
  'data-visualization_expert',
]);

/** Suggestions for common gaps */
const TOOL_SUGGESTIONS: Readonly<Record<string, string>> = {
  code_analysis: 'Use create_expert with code_expert role instead',
  deploy: 'Use run_graph_workflow with a custom deployment template',
  monitor: 'Use weather_report for CLI performance monitoring',
};

const EXPERT_SUGGESTIONS: Readonly<Record<string, string>> = {
  data_expert: 'Use research_expert for data analysis tasks',
  ml_expert: 'Use code_expert with ML-focused system prompt',
  frontend_expert: 'Use ux_expert for UI concerns, code_expert for implementation',
};

// ============================================================================
// Gap Detection
// ============================================================================

/**
 * Detect capability gaps by comparing required vs available.
 */
export function detectCapabilityGaps(required: RequiredCapabilities): CapabilityGapReport {
  const availableTools: string[] = [];
  const availableExperts: string[] = [];
  const gaps: CapabilityGap[] = [];

  for (const tool of required.tools) {
    if (AVAILABLE_TOOLS.has(tool)) {
      availableTools.push(tool);
    } else {
      gaps.push({
        type: 'tool',
        name: tool,
        suggestion:
          TOOL_SUGGESTIONS[tool] ?? 'No direct equivalent — consider orchestrate for complex tasks',
      });
    }
  }

  for (const expert of required.experts) {
    if (AVAILABLE_EXPERTS.has(expert)) {
      availableExperts.push(expert);
    } else {
      gaps.push({
        type: 'expert',
        name: expert,
        suggestion: EXPERT_SUGGESTIONS[expert] ?? 'Use create_expert with a custom configuration',
      });
    }
  }

  return {
    available: { tools: availableTools, experts: availableExperts },
    gaps,
    allSatisfied: gaps.length === 0,
  };
}

/**
 * Get the count of available tools.
 */
export function getAvailableToolCount(): number {
  return AVAILABLE_TOOLS.size;
}

/**
 * Get the count of available experts.
 */
export function getAvailableExpertCount(): number {
  return AVAILABLE_EXPERTS.size;
}

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

/** All 20 registered MCP tools */
const AVAILABLE_TOOLS: ReadonlySet<string> = new Set([
  'orchestrate',
  'create_expert',
  'execute_expert',
  'run_workflow',
  'delegate_to_model',
  'list_experts',
  'list_workflows',
  'consensus_vote',
  'research_query',
  'research_add',
  'research_discover',
  'research_analyze',
  'research_catalog_review',
  'memory_query',
  'memory_stats',
  'weather_report',
  'issue_triage',
  'run_graph_workflow',
  'execute_spec',
  'registry_import',
]);

/** All 9 expert role names */
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

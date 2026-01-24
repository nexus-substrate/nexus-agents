/**
 * nexus-agents/mcp/safety - STPA Analysis Helpers
 *
 * Helper functions for analyzing tool descriptions and input schemas.
 * Extracted from stpa-helpers.ts to maintain file size limits.
 *
 * @module mcp/safety/stpa-analysis-helpers
 * (Source: Issue #339)
 */

import type { Hazard, ToolDefinition } from './stpa-types.js';
import { HazardCategory, HazardSeverity, HazardLikelihood } from './stpa-types.js';
import { generateId } from './stpa-id-generator.js';

// =============================================================================
// Description Analysis
// =============================================================================

/** Dangerous patterns to check in tool descriptions. */
const DESCRIPTION_PATTERNS: ReadonlyArray<{ pattern: RegExp; hazard: Partial<Hazard> }> = [
  {
    pattern: /delet/i,
    hazard: {
      category: HazardCategory.DATA_LOSS,
      severity: HazardSeverity.HIGH,
      likelihood: HazardLikelihood.POSSIBLE,
    },
  },
  {
    pattern: /execut|run|command|shell/i,
    hazard: {
      category: HazardCategory.UNAUTHORIZED_EXECUTION,
      severity: HazardSeverity.CRITICAL,
      likelihood: HazardLikelihood.LIKELY,
    },
  },
  {
    pattern: /modif|updat|chang|writ/i,
    hazard: {
      category: HazardCategory.INTEGRITY_VIOLATION,
      severity: HazardSeverity.MEDIUM,
      likelihood: HazardLikelihood.POSSIBLE,
    },
  },
  {
    pattern: /password|credential|secret|token|key/i,
    hazard: {
      category: HazardCategory.INFORMATION_DISCLOSURE,
      severity: HazardSeverity.CRITICAL,
      likelihood: HazardLikelihood.LIKELY,
    },
  },
  {
    pattern: /network|http|request|fetch|api/i,
    hazard: {
      category: HazardCategory.INFORMATION_DISCLOSURE,
      severity: HazardSeverity.HIGH,
      likelihood: HazardLikelihood.POSSIBLE,
    },
  },
];

/**
 * Analyzes tool description for additional hazard indicators.
 */
export function analyzeDescription(tool: ToolDefinition): Hazard[] {
  const hazards: Hazard[] = [];
  const desc = tool.description.toLowerCase();

  for (const { pattern, hazard } of DESCRIPTION_PATTERNS) {
    if (pattern.test(desc)) {
      const category = hazard.category ?? HazardCategory.INJECTION;
      const severity = hazard.severity ?? HazardSeverity.MEDIUM;
      const likelihood = hazard.likelihood ?? HazardLikelihood.POSSIBLE;

      hazards.push({
        id: generateId('H-DESC', tool.name, hazards.length + 1),
        description: `Tool description indicates ${category} risk: "${desc.substring(0, 50)}..."`,
        category,
        severity,
        likelihood,
        triggerConditions: ['Identified from tool description'],
        consequences: [`Potential ${category} based on tool functionality`],
      });
    }
  }

  return hazards;
}

// =============================================================================
// Input Schema Analysis
// =============================================================================

/** Dangerous parameter patterns. */
const PARAM_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  category: HazardCategory;
  severity: HazardSeverity;
}> = [
  {
    pattern: /path|file|dir/i,
    category: HazardCategory.INFORMATION_DISCLOSURE,
    severity: HazardSeverity.HIGH,
  },
  {
    pattern: /command|cmd|exec/i,
    category: HazardCategory.UNAUTHORIZED_EXECUTION,
    severity: HazardSeverity.CRITICAL,
  },
  {
    pattern: /url|uri|endpoint/i,
    category: HazardCategory.INFORMATION_DISCLOSURE,
    severity: HazardSeverity.HIGH,
  },
  { pattern: /query|sql/i, category: HazardCategory.INJECTION, severity: HazardSeverity.CRITICAL },
  {
    pattern: /password|secret|token|key/i,
    category: HazardCategory.INFORMATION_DISCLOSURE,
    severity: HazardSeverity.CRITICAL,
  },
];

/**
 * Analyzes input schema for hazard indicators.
 */
export function analyzeInputSchema(tool: ToolDefinition): Hazard[] {
  const hazards: Hazard[] = [];
  const { properties } = tool.inputSchema;

  if (!properties) return hazards;

  for (const [paramName] of Object.entries(properties)) {
    for (const { pattern, category, severity } of PARAM_PATTERNS) {
      if (pattern.test(paramName)) {
        hazards.push({
          id: generateId('H-PARAM', tool.name, hazards.length + 1),
          description: `Parameter '${paramName}' may allow ${category}`,
          category,
          severity,
          likelihood: HazardLikelihood.POSSIBLE,
          triggerConditions: [`Malicious input to '${paramName}' parameter`],
          consequences: [`${category} through parameter manipulation`],
        });
        break; // One hazard per parameter
      }
    }
  }

  return hazards;
}

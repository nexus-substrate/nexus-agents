/**
 * nexus-agents/mcp/safety - STPA Helper Functions
 *
 * Helper functions for STPA analysis including risk calculation,
 * constraint generation, and description analysis.
 */

import type {
  Hazard,
  UnsafeControlAction,
  HazardInteraction,
  AnalysisSummary,
  ToolAnalysisResult,
} from './stpa-types.js';
import {
  HazardCategory,
  HazardSeverity,
  HazardLikelihood,
  UnsafeControlActionType,
  ConstraintEnforcement,
  ConstraintPriority,
  RiskLevel,
} from './stpa-types.js';
import { classifyTool, ToolCategory } from './hazard-catalog.js';

// =============================================================================
// Constants
// =============================================================================

/** Risk score weights by severity. */
export const SEVERITY_WEIGHTS: Record<HazardSeverity, number> = {
  [HazardSeverity.CRITICAL]: 40,
  [HazardSeverity.HIGH]: 30,
  [HazardSeverity.MEDIUM]: 20,
  [HazardSeverity.LOW]: 10,
};

/** Risk score weights by likelihood. */
export const LIKELIHOOD_WEIGHTS: Record<HazardLikelihood, number> = {
  [HazardLikelihood.ALMOST_CERTAIN]: 1.0,
  [HazardLikelihood.LIKELY]: 0.8,
  [HazardLikelihood.POSSIBLE]: 0.6,
  [HazardLikelihood.UNLIKELY]: 0.4,
  [HazardLikelihood.RARE]: 0.2,
};

// =============================================================================
// ID Generation
// =============================================================================

/**
 * Generates a unique ID for hazards, UCAs, and constraints.
 */
export function generateId(prefix: string, toolName: string, index: number): string {
  const sanitized = toolName.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  return `${prefix}-${sanitized}-${String(index).padStart(3, '0')}`;
}

// =============================================================================
// Risk Calculation
// =============================================================================

/**
 * Calculates risk score from severity and likelihood.
 */
export function calculateRiskScore(hazards: readonly Hazard[]): number {
  if (hazards.length === 0) return 0;

  let totalScore = 0;
  for (const hazard of hazards) {
    const severityWeight = SEVERITY_WEIGHTS[hazard.severity];
    const likelihoodWeight = LIKELIHOOD_WEIGHTS[hazard.likelihood];
    totalScore += severityWeight * likelihoodWeight;
  }

  // Normalize to 0-100 scale
  const maxPossible = hazards.length * SEVERITY_WEIGHTS[HazardSeverity.CRITICAL];
  return Math.min(100, Math.round((totalScore / maxPossible) * 100));
}

/**
 * Determines risk level from risk score.
 */
export function determineRiskLevel(score: number): RiskLevel {
  if (score <= 20) return RiskLevel.MINIMAL;
  if (score <= 40) return RiskLevel.LOW;
  if (score <= 60) return RiskLevel.MODERATE;
  if (score <= 80) return RiskLevel.HIGH;
  return RiskLevel.CRITICAL;
}

// =============================================================================
// Constraint Helpers
// =============================================================================

/**
 * Maps hazard category to constraint enforcement type.
 */
export function getEnforcementForCategory(category: HazardCategory): ConstraintEnforcement {
  switch (category) {
    case HazardCategory.DATA_LOSS:
    case HazardCategory.PRIVILEGE_ESCALATION:
    case HazardCategory.UNAUTHORIZED_EXECUTION:
      return ConstraintEnforcement.PREVENT;
    case HazardCategory.INFORMATION_DISCLOSURE:
    case HazardCategory.INJECTION:
      return ConstraintEnforcement.SANITIZE;
    case HazardCategory.RESOURCE_EXHAUSTION:
    case HazardCategory.DENIAL_OF_SERVICE:
      return ConstraintEnforcement.RATE_LIMIT;
    case HazardCategory.INTEGRITY_VIOLATION:
      return ConstraintEnforcement.REQUIRE_CONFIRMATION;
    default:
      return ConstraintEnforcement.ALERT;
  }
}

/**
 * Gets constraint priority based on hazard severity.
 */
export function getPriorityForSeverity(severity: HazardSeverity): ConstraintPriority {
  switch (severity) {
    case HazardSeverity.CRITICAL:
      return ConstraintPriority.CRITICAL;
    case HazardSeverity.HIGH:
      return ConstraintPriority.HIGH;
    case HazardSeverity.MEDIUM:
      return ConstraintPriority.NORMAL;
    case HazardSeverity.LOW:
      return ConstraintPriority.LOW;
    default:
      return ConstraintPriority.NORMAL;
  }
}

/**
 * Gets action verb for enforcement type.
 */
export function getEnforcementAction(enforcement: ConstraintEnforcement): string {
  switch (enforcement) {
    case ConstraintEnforcement.PREVENT:
      return 'Block tool invocation';
    case ConstraintEnforcement.REQUIRE_CONFIRMATION:
      return 'Require explicit confirmation';
    case ConstraintEnforcement.SANITIZE:
      return 'Sanitize input';
    case ConstraintEnforcement.RATE_LIMIT:
      return 'Apply rate limiting';
    case ConstraintEnforcement.REQUIRE_PRIVILEGE:
      return 'Require elevated privileges';
    case ConstraintEnforcement.ALERT:
      return 'Log and alert';
    default:
      return 'Take action';
  }
}

/**
 * Extracts condition from UCA for constraint description.
 */
export function getConditionFromUca(uca: UnsafeControlAction): string {
  switch (uca.type) {
    case UnsafeControlActionType.PROVIDED_CAUSES_HAZARD:
      return `tool provides ${uca.unsafeContext}`;
    case UnsafeControlActionType.NOT_PROVIDED:
      return 'required validation is not provided';
    case UnsafeControlActionType.WRONG_TIMING:
      return 'preconditions are not satisfied';
    case UnsafeControlActionType.WRONG_DURATION:
      return 'operation duration exceeds safe limits';
    default:
      return 'unsafe conditions exist';
  }
}

/**
 * Generates a human-readable constraint description.
 */
export function generateConstraintDescription(
  hazard: Hazard,
  uca: UnsafeControlAction,
  enforcement: ConstraintEnforcement
): string {
  const action = getEnforcementAction(enforcement);
  const condition = getConditionFromUca(uca);

  return `${action} when ${condition} to prevent ${hazard.category.replace(/_/g, ' ')}`;
}

/**
 * Generates validation function name for a hazard category.
 */
export function generateValidationFunctionName(category: HazardCategory): string {
  const categoryName = category.replace(/_/g, '');
  return `validate${categoryName.charAt(0).toUpperCase() + categoryName.slice(1).toLowerCase()}`;
}

// =============================================================================
// Hazard Interaction Detection
// =============================================================================

/**
 * Finds potential hazard interactions between tools.
 */
export function findHazardInteractions(
  toolResults: readonly ToolAnalysisResult[]
): HazardInteraction[] {
  const interactions: HazardInteraction[] = [];

  // Check pairs of tools for dangerous combinations
  for (let i = 0; i < toolResults.length; i++) {
    for (let j = i + 1; j < toolResults.length; j++) {
      const tool1 = toolResults[i];
      const tool2 = toolResults[j];

      // Skip if either tool is undefined (satisfies TypeScript strict mode)
      if (tool1 === undefined || tool2 === undefined) continue;

      // Check for combined privilege escalation risk
      const tool1HasPrivEsc = tool1.hazards.some(
        (h) => h.category === HazardCategory.PRIVILEGE_ESCALATION
      );
      const tool2HasExec = tool2.hazards.some(
        (h) => h.category === HazardCategory.UNAUTHORIZED_EXECUTION
      );

      if (tool1HasPrivEsc && tool2HasExec) {
        interactions.push({
          involvedTools: [tool1.toolName, tool2.toolName],
          combinedHazard: 'Combined privilege escalation and execution capability',
          severity: HazardSeverity.CRITICAL,
          interactionDescription: `${tool1.toolName} can escalate privileges while ${tool2.toolName} can execute commands`,
        });
      }

      // Check for data exfiltration chain
      const tool1HasRead = tool1.hazards.some(
        (h) => h.category === HazardCategory.INFORMATION_DISCLOSURE
      );
      const tool2HasNetwork = classifyTool(tool2.toolName) === ToolCategory.NETWORK_REQUEST;

      if (tool1HasRead && tool2HasNetwork) {
        interactions.push({
          involvedTools: [tool1.toolName, tool2.toolName],
          combinedHazard: 'Data exfiltration chain: read sensitive data then send externally',
          severity: HazardSeverity.HIGH,
          interactionDescription: `${tool1.toolName} can read sensitive data, ${tool2.toolName} can send it externally`,
        });
      }
    }
  }

  return interactions;
}

// =============================================================================
// Summary Generation
// =============================================================================

/**
 * Generates analysis summary statistics.
 */
export function generateSummary(toolResults: readonly ToolAnalysisResult[]): AnalysisSummary {
  const hazardsByCategory: Record<HazardCategory, number> = {
    [HazardCategory.DATA_LOSS]: 0,
    [HazardCategory.PRIVILEGE_ESCALATION]: 0,
    [HazardCategory.RESOURCE_EXHAUSTION]: 0,
    [HazardCategory.INFORMATION_DISCLOSURE]: 0,
    [HazardCategory.UNAUTHORIZED_EXECUTION]: 0,
    [HazardCategory.INTEGRITY_VIOLATION]: 0,
    [HazardCategory.DENIAL_OF_SERVICE]: 0,
    [HazardCategory.INJECTION]: 0,
  };

  const toolsByRiskLevel: Record<RiskLevel, number> = {
    [RiskLevel.MINIMAL]: 0,
    [RiskLevel.LOW]: 0,
    [RiskLevel.MODERATE]: 0,
    [RiskLevel.HIGH]: 0,
    [RiskLevel.CRITICAL]: 0,
  };

  let totalHazards = 0;
  let totalUcas = 0;
  let totalConstraints = 0;
  let totalRiskScore = 0;

  for (const result of toolResults) {
    totalHazards += result.hazards.length;
    totalUcas += result.unsafeControlActions.length;
    totalConstraints += result.safetyConstraints.length;
    totalRiskScore += result.riskScore;

    for (const hazard of result.hazards) {
      hazardsByCategory[hazard.category]++;
    }

    toolsByRiskLevel[result.riskLevel]++;
  }

  return {
    totalTools: toolResults.length,
    totalHazards,
    totalUnsafeControlActions: totalUcas,
    totalSafetyConstraints: totalConstraints,
    hazardsByCategory,
    averageRiskScore: toolResults.length > 0 ? Math.round(totalRiskScore / toolResults.length) : 0,
    toolsByRiskLevel,
  };
}

// =============================================================================
// Re-export Analysis Helpers
// =============================================================================

export { analyzeDescription, analyzeInputSchema } from './stpa-analysis-helpers.js';

/**
 * nexus-agents/mcp/safety - STPA Analyzer
 *
 * System-Theoretic Process Analysis (STPA) analyzer for MCP tools.
 * Identifies unsafe control actions, generates safety constraints,
 * and validates tools against those constraints.
 *
 * (Source: Leveson, Engineering a Safer World, MIT Press 2011)
 */

import type { Result } from '../../core/result.js';
import { ok, err } from '../../core/result.js';
import type {
  ToolDefinition,
  Hazard,
  UnsafeControlAction,
  SafetyConstraint,
  ToolAnalysisResult,
  StpaAnalysisResult,
  AnalysisConfiguration,
  TriggerPattern,
} from './stpa-types.js';
import {
  HazardCategory,
  HazardSeverity,
  UnsafeControlActionType,
  DEFAULT_ANALYSIS_CONFIG,
  ToolDefinitionSchema,
  AnalysisConfigurationSchema,
} from './stpa-types.js';
import {
  classifyToolMultiple,
  getHazardsForTool,
  getTriggerPatternsForCategory,
} from './hazard-catalog.js';
import {
  generateId,
  calculateRiskScore,
  determineRiskLevel,
  getEnforcementForCategory,
  getPriorityForSeverity,
  generateConstraintDescription,
  generateValidationFunctionName,
  findHazardInteractions,
  generateSummary,
  analyzeDescription,
  analyzeInputSchema,
  SEVERITY_WEIGHTS,
  LIKELIHOOD_WEIGHTS,
} from './stpa-helpers.js';

// Re-export validation function from dedicated module
export { validateToolAgainstConstraints } from './stpa-validation.js';

// =============================================================================
// Constants
// =============================================================================

const ANALYZER_VERSION = '1.0.0';

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error during STPA analysis.
 */
export class StpaAnalysisError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = 'StpaAnalysisError';
    this.code = code;
    this.details = details;
  }
}

// =============================================================================
// Core Analysis Functions
// =============================================================================

/**
 * Analyzes a tool definition and identifies potential hazards.
 * This is the first step in STPA analysis.
 *
 * @param toolDefinition - The tool to analyze
 * @param config - Analysis configuration
 * @returns Result containing identified hazards or error
 */
export function analyzeToolForHazards(
  toolDefinition: ToolDefinition,
  config: Partial<AnalysisConfiguration> = {}
): Result<readonly Hazard[], StpaAnalysisError> {
  // Validate input
  const validationResult = ToolDefinitionSchema.safeParse(toolDefinition);
  if (!validationResult.success) {
    return err(
      new StpaAnalysisError('Invalid tool definition', 'INVALID_TOOL', validationResult.error)
    );
  }

  const fullConfig = { ...DEFAULT_ANALYSIS_CONFIG, ...config };
  const { name } = toolDefinition;

  // Get hazards for tool category
  let hazards = [...getHazardsForTool(name)];

  // Add description-based hazards
  const descriptionHazards = analyzeDescription(toolDefinition);
  hazards.push(...descriptionHazards);

  // Add input schema-based hazards
  const schemaHazards = analyzeInputSchema(toolDefinition);
  hazards.push(...schemaHazards);

  // Filter by configured categories if specified
  if (fullConfig.categories.length > 0) {
    hazards = hazards.filter((h) => fullConfig.categories.includes(h.category));
  }

  // Filter out low severity if configured
  if (!fullConfig.includeLowSeverity) {
    hazards = hazards.filter((h) => h.severity !== HazardSeverity.LOW);
  }

  // Limit hazards per tool
  if (hazards.length > fullConfig.maxHazardsPerTool) {
    // Sort by severity and likelihood, keep most severe
    hazards.sort((a, b) => {
      const severityDiff = SEVERITY_WEIGHTS[b.severity] - SEVERITY_WEIGHTS[a.severity];
      if (severityDiff !== 0) return severityDiff;
      return LIKELIHOOD_WEIGHTS[b.likelihood] - LIKELIHOOD_WEIGHTS[a.likelihood];
    });
    hazards = hazards.slice(0, fullConfig.maxHazardsPerTool);
  }

  // Deduplicate by ID
  const uniqueHazards = Array.from(new Map(hazards.map((h) => [h.id, h])).values());

  return ok(uniqueHazards);
}

/** Creates a "wrong timing" UCA for time-sensitive hazards */
function createWrongTimingUca(
  toolName: string,
  hazardId: string,
  ucaIndex: number
): UnsafeControlAction {
  return {
    id: generateId('UCA', toolName, ucaIndex),
    toolName,
    type: UnsafeControlActionType.WRONG_TIMING,
    description: `Tool '${toolName}' invoked before safety preconditions are verified`,
    unsafeContext: 'No backup exists; concurrent access in progress; validation incomplete',
    relatedHazards: [hazardId],
  };
}

/** Creates a "not provided" UCA for security-critical operations */
function createNotProvidedUca(
  toolName: string,
  hazardId: string,
  ucaIndex: number
): UnsafeControlAction {
  return {
    id: generateId('UCA', toolName, ucaIndex),
    toolName,
    type: UnsafeControlActionType.NOT_PROVIDED,
    description: `Validation/sanitization not performed before '${toolName}' invocation`,
    unsafeContext: 'Input contains malicious content; access control not checked',
    relatedHazards: [hazardId],
  };
}

/**
 * Generates unsafe control actions from identified hazards.
 */
export function generateUnsafeControlActions(
  toolDefinition: ToolDefinition,
  hazards: readonly Hazard[]
): readonly UnsafeControlAction[] {
  const ucas: UnsafeControlAction[] = [];
  const categories = classifyToolMultiple(toolDefinition.name);
  const triggerPatterns: TriggerPattern[] = [];

  for (const category of categories) {
    triggerPatterns.push(...getTriggerPatternsForCategory(category));
  }

  for (const hazard of hazards) {
    const baseUca: UnsafeControlAction = {
      id: generateId('UCA', toolDefinition.name, ucas.length + 1),
      toolName: toolDefinition.name,
      type: UnsafeControlActionType.PROVIDED_CAUSES_HAZARD,
      description: `Tool '${toolDefinition.name}' invoked when ${hazard.description.toLowerCase()}`,
      unsafeContext: hazard.triggerConditions.join('; '),
      relatedHazards: [hazard.id],
    };

    ucas.push(triggerPatterns.length > 0 ? { ...baseUca, triggerPatterns } : baseUca);

    const isTimeSensitive =
      hazard.category === HazardCategory.DATA_LOSS ||
      hazard.category === HazardCategory.INTEGRITY_VIOLATION;
    if (isTimeSensitive) {
      ucas.push(createWrongTimingUca(toolDefinition.name, hazard.id, ucas.length + 1));
    }

    const isSecurityCritical =
      hazard.category === HazardCategory.INFORMATION_DISCLOSURE ||
      hazard.category === HazardCategory.PRIVILEGE_ESCALATION;
    if (isSecurityCritical) {
      ucas.push(createNotProvidedUca(toolDefinition.name, hazard.id, ucas.length + 1));
    }
  }

  return ucas;
}

/**
 * Generates safety constraints from hazards and unsafe control actions.
 * This produces actionable requirements to prevent hazards.
 *
 * @param hazards - Identified hazards
 * @param ucas - Identified unsafe control actions
 * @returns Safety constraints to mitigate the hazards
 */
export function generateSafetyConstraints(
  hazards: readonly Hazard[],
  ucas: readonly UnsafeControlAction[]
): readonly SafetyConstraint[] {
  const constraints: SafetyConstraint[] = [];
  const processedHazards = new Set<string>();

  for (const uca of ucas) {
    // Get all hazards this UCA relates to
    const relatedHazards = hazards.filter((h) => uca.relatedHazards.includes(h.id));

    for (const hazard of relatedHazards) {
      // Avoid duplicate constraints for same hazard
      const constraintKey = `${hazard.category}-${uca.type}`;
      if (processedHazards.has(constraintKey)) continue;
      processedHazards.add(constraintKey);

      const enforcement = getEnforcementForCategory(hazard.category);
      const priority = getPriorityForSeverity(hazard.severity);

      constraints.push({
        id: generateId('SC', uca.toolName, constraints.length + 1),
        description: generateConstraintDescription(hazard, uca, enforcement),
        mitigates: [uca.id],
        enforcement,
        priority,
        validationFunction: generateValidationFunctionName(hazard.category),
      });
    }
  }

  // Sort by priority (lower number = higher priority)
  return constraints.sort((a, b) => a.priority - b.priority);
}

// =============================================================================
// Full Analysis Pipeline
// =============================================================================

/**
 * Performs complete STPA analysis on one or more tools.
 *
 * @param tools - Tools to analyze
 * @param config - Analysis configuration
 * @returns Complete analysis result
 */
export function analyzeTools(
  tools: readonly ToolDefinition[],
  config: Partial<AnalysisConfiguration> = {}
): Result<StpaAnalysisResult, StpaAnalysisError> {
  const startTime = new Date();
  const fullConfig = AnalysisConfigurationSchema.parse(config);
  const toolResults: ToolAnalysisResult[] = [];

  for (const tool of tools) {
    const hazardsResult = analyzeToolForHazards(tool, fullConfig);
    if (!hazardsResult.ok) {
      return err(hazardsResult.error);
    }

    const hazards = hazardsResult.value;
    const ucas = generateUnsafeControlActions(tool, hazards);
    const constraints = generateSafetyConstraints(hazards, ucas);
    const riskScore = calculateRiskScore(hazards);

    toolResults.push({
      toolName: tool.name,
      toolDescription: tool.description,
      hazards,
      unsafeControlActions: ucas,
      safetyConstraints: constraints,
      riskScore,
      riskLevel: determineRiskLevel(riskScore),
      analyzedAt: new Date(),
    });
  }

  const endTime = new Date();
  const interactions = fullConfig.checkInteractions ? findHazardInteractions(toolResults) : [];
  const summary = generateSummary(toolResults);

  return ok({
    toolResults,
    summary,
    interactions,
    metadata: {
      analyzerVersion: ANALYZER_VERSION,
      startedAt: startTime,
      completedAt: endTime,
      durationMs: endTime.getTime() - startTime.getTime(),
      configuration: fullConfig,
    },
  });
}

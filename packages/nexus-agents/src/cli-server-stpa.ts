/**
 * nexus-agents CLI Server STPA Integration
 *
 * STPA safety analysis integration for tool registration.
 * Runs hazard analysis on registered tools and logs results.
 *
 * @module cli-server-stpa
 * (Source: Issue #530 - Integrate STPA safety framework)
 */

import type { ILogger } from './core/index.js';
import { NexusError, ErrorCode } from './core/index.js';
import {
  analyzeTools,
  type ToolDefinition,
  type StpaAnalysisResult,
  RiskLevel,
  HazardSeverity,
} from './mcp/safety/index.js';

/**
 * Tool definitions for STPA safety analysis.
 * Maps each registered tool to its schema for hazard identification.
 */
export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: 'delegate_to_model',
    description: 'Route a task to the optimal model based on capability matching',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task to execute or analyze' },
        preferred_capability: { type: 'string', description: 'Preferred capability for routing' },
        model_hint: { type: 'string', description: 'Explicit model preference' },
        // estimate_tokens flag removed (#2723) — was never read downstream.
      },
      required: ['task'],
    },
  },
  {
    name: 'orchestrate',
    description: 'Orchestrate a task by analyzing it and coordinating expert agents',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task description to orchestrate' },
        context: { type: 'object', description: 'Additional context for the task' },
        maxIterations: { type: 'number', description: 'Maximum iterations for orchestration' },
      },
      required: ['task'],
    },
  },
  {
    name: 'create_expert',
    description: 'Create a specialized expert agent for code, architecture, or security tasks',
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'Expert role to create' },
        modelPreference: { type: 'string', description: 'Preferred model for the expert' },
      },
      required: ['role'],
    },
  },
  {
    name: 'execute_expert',
    description: 'Execute a task using a previously created expert agent',
    inputSchema: {
      type: 'object',
      properties: {
        expertId: { type: 'string', description: 'Expert ID from create_expert tool' },
        task: { type: 'string', description: 'Task description for the expert to execute' },
        context: { type: 'object', description: 'Additional context metadata for the task' },
      },
      required: ['expertId', 'task'],
    },
  },
  {
    name: 'run_workflow',
    description: 'Execute a workflow template with provided inputs',
    inputSchema: {
      type: 'object',
      properties: {
        template: { type: 'string', description: 'Workflow template name or file path' },
        inputs: { type: 'object', description: 'Workflow inputs as key-value pairs' },
        dryRun: { type: 'boolean', description: 'Validate workflow without executing' },
      },
      required: ['template', 'inputs'],
    },
  },
  {
    name: 'list_experts',
    description: 'List available expert types that can be created with create_expert',
    inputSchema: {
      type: 'object',
      properties: { format: { type: 'string', description: 'Output format: full or names' } },
    },
  },
  {
    name: 'list_workflows',
    description: 'List available workflow templates',
    inputSchema: {
      type: 'object',
      properties: {
        includeBuiltIn: { type: 'boolean', description: 'Include built-in templates' },
        includeCustom: { type: 'boolean', description: 'Include custom templates' },
      },
    },
  },
  {
    name: 'consensus_vote',
    description: 'Submit a vote in a multi-agent consensus decision process',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Consensus session identifier' },
        agentId: { type: 'string', description: 'Voting agent identifier' },
        vote: { type: 'string', description: 'Vote value (approve, reject, abstain)' },
        confidence: { type: 'number', description: 'Confidence level 0-1' },
        reasoning: { type: 'string', description: 'Optional reasoning for the vote' },
      },
      required: ['sessionId', 'agentId', 'vote'],
    },
  },
];

/**
 * Error thrown when STPA analysis finds high-severity hazards.
 */
export class StpaSafetyError extends NexusError {
  readonly analysisResult: StpaAnalysisResult;

  constructor(message: string, analysisResult: StpaAnalysisResult) {
    super(message, { code: ErrorCode.SECURITY_ERROR });
    this.name = 'StpaSafetyError';
    this.analysisResult = analysisResult;
  }
}

/** Logs individual tool analysis results. */
function logToolResults(logger: ILogger, result: StpaAnalysisResult): void {
  for (const toolResult of result.toolResults) {
    if (toolResult.hazards.length === 0) continue;

    const criticalCount = toolResult.hazards.filter(
      (h) => h.severity === HazardSeverity.CRITICAL
    ).length;
    const highCount = toolResult.hazards.filter((h) => h.severity === HazardSeverity.HIGH).length;

    if (criticalCount > 0 || highCount > 0) {
      logger.warn(`STPA hazards for tool '${toolResult.toolName}'`, {
        riskLevel: toolResult.riskLevel,
        riskScore: toolResult.riskScore,
        criticalHazards: criticalCount,
        highHazards: highCount,
        safetyConstraints: toolResult.safetyConstraints.length,
      });
    } else {
      logger.debug(`STPA analysis for tool '${toolResult.toolName}'`, {
        riskLevel: toolResult.riskLevel,
        hazards: toolResult.hazards.length,
      });
    }
  }
}

/** Checks for high-risk tools and throws if failOnHighSeverity is enabled. */
function checkHighSeverityTools(result: StpaAnalysisResult, failOnHighSeverity: boolean): void {
  if (!failOnHighSeverity) return;

  const criticalTools = result.toolResults.filter((t) => t.riskLevel === RiskLevel.CRITICAL);
  const highRiskTools = result.toolResults.filter((t) => t.riskLevel === RiskLevel.HIGH);

  if (criticalTools.length === 0 && highRiskTools.length === 0) return;

  const toolNames = [...criticalTools, ...highRiskTools].map((t) => t.toolName);
  throw new StpaSafetyError(
    `STPA analysis found ${String(criticalTools.length)} critical and ` +
      `${String(highRiskTools.length)} high-risk tools: ${toolNames.join(', ')}. Blocked.`,
    result
  );
}

/**
 * Runs STPA safety analysis on registered tools and logs results.
 *
 * @param logger - Logger for outputting analysis results
 * @param failOnHighSeverity - If true, throws when critical/high severity hazards found
 * @throws {StpaSafetyError} When high-severity hazards found and failOnHighSeverity is true
 */
export function runStpaSafetyAnalysis(logger: ILogger, failOnHighSeverity: boolean): void {
  const analysisResult = analyzeTools(TOOL_DEFINITIONS);

  if (!analysisResult.ok) {
    const errorMsg = analysisResult.error.message;
    if (failOnHighSeverity) {
      throw new NexusError(`STPA safety analysis failed: ${errorMsg}`, {
        code: ErrorCode.SECURITY_ERROR,
      });
    }
    logger.warn('STPA safety analysis failed', { error: errorMsg });
    return;
  }

  const result = analysisResult.value;
  const { summary } = result;

  // Log summary at INFO level
  logger.info('STPA safety analysis completed', {
    toolsAnalyzed: summary.totalTools,
    hazardsIdentified: summary.totalHazards,
    unsafeControlActions: summary.totalUnsafeControlActions,
    safetyConstraints: summary.totalSafetyConstraints,
    averageRiskScore: summary.averageRiskScore.toFixed(1),
    toolsByRiskLevel: summary.toolsByRiskLevel,
  });

  logToolResults(logger, result);
  checkHighSeverityTools(result, failOnHighSeverity);

  // Log cross-tool interactions if any
  if (result.interactions.length > 0) {
    logger.info('STPA cross-tool hazard interactions detected', {
      interactionCount: result.interactions.length,
      interactions: result.interactions.map((i) => ({
        tools: i.involvedTools,
        hazard: i.combinedHazard,
        severity: i.severity,
      })),
    });
  }
}

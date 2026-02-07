/**
 * nexus-agents/mcp - SICA Integration for Orchestrate Tool
 *
 * Wraps Orchestrator with SICA self-improvement capabilities when enabled.
 * Provides ITechLead-compatible interface for seamless integration.
 *
 * @module mcp/tools/orchestrate-sica
 * (Source: Issue #558 - Wire SICA wrapping to Orchestrator)
 * (Issue #759 - Renamed functions to use Orchestrator terminology)
 */

import type { Result, ILogger, Task, AgentError, IModelAdapter } from '../../core/index.js';
import { TechLead } from '../../agents/index.js';
import { SicaAgent, createSicaAgent } from '../../agents/self-improving/sica-agent.js';
import { isSicaEnabled, getSicaConfig } from '../../cli-server-sica.js';
import type { ITechLead } from './orchestrate.js';

/**
 * Creates an orchestrator agent (optionally wrapped with SICA).
 *
 * When SICA is enabled in configuration, this wraps the orchestrator with
 * self-improvement capabilities. Otherwise, returns a plain orchestrator.
 *
 * @param logger - Logger instance
 * @param adapter - Optional model adapter for LLM-based analysis (Issue #827)
 * @returns ITechLead-compatible agent
 */
// eslint-disable-next-line @typescript-eslint/no-deprecated -- Intentional: backwards compat (Issue #595)
export function createOrchestratorWithSica(logger: ILogger, adapter?: IModelAdapter): ITechLead {
  const techLead = new TechLead({ logger, adapter });

  if (!isSicaEnabled()) {
    logger.debug('SICA not enabled, using plain orchestrator');
    return techLead;
  }

  const sicaConfig = getSicaConfig();
  if (sicaConfig === undefined) {
    logger.debug('SICA config unavailable, using plain orchestrator');
    return techLead;
  }

  logger.info('Creating SICA-wrapped orchestrator', {
    improvementThreshold: sicaConfig.improvementThreshold,
    maxActiveVersions: sicaConfig.maxActiveVersions,
  });

  const sicaAgent = createSicaAgent({
    baseAgent: techLead,
    initialConfig: {
      systemPrompt: 'Orchestrator agent',
      temperature: 0.3,
      maxTokens: 4096,
      parameters: {},
    },
    sicaConfig: {
      minExecutionsForImprovement: sicaConfig.minExecutionsForImprovement,
      improvementThreshold: sicaConfig.improvementThreshold,
      maxActiveVersions: sicaConfig.maxActiveVersions,
      autoSelectBest: sicaConfig.autoSelectBest,
      improvementCooldownMs: sicaConfig.improvementCooldownMs,
      enableObservability: sicaConfig.enableObservability,
    },
    logger,
  });

  return createSicaOrchestratorAdapter(sicaAgent, logger);
}

/** @deprecated Use createOrchestratorWithSica instead (Issue #759) */
export const createTechLeadWithSica = createOrchestratorWithSica;

/**
 * Adapts SicaAgent to ITechLead interface.
 *
 * Transforms SicaExecutionResult to the shape expected by orchestrate tool.
 */
// eslint-disable-next-line @typescript-eslint/no-deprecated -- Intentional: backwards compat (Issue #595)
function createSicaOrchestratorAdapter(sicaAgent: SicaAgent, _logger: ILogger): ITechLead {
  return {
    async execute(
      task: Task
    ): Promise<Result<{ taskId: string; output: unknown; metadata: unknown }, AgentError>> {
      const result = await sicaAgent.execute(task);

      if (!result.ok) {
        return result;
      }

      const sicaResult = result.value;

      // Transform SicaExecutionResult to orchestrator result shape
      return {
        ok: true,
        value: {
          taskId: task.id,
          output: sicaResult.output,
          metadata: {
            durationMs: sicaResult.metrics.durationMs,
            tokensUsed: sicaResult.metrics.tokensUsed,
            toolsUsed: [],
            model: 'sica-orchestrator',
            // SICA-specific metadata
            sicaVersionId: sicaResult.versionId,
            sicaTriggeredImprovement: sicaResult.triggeredImprovement,
            sicaQualityScore: sicaResult.metrics.qualityScore,
          },
        },
      };
    },
  };
}

/**
 * Gets the SICA agent from an orchestrator if it was wrapped.
 * Returns undefined if the agent is a plain orchestrator.
 *
 * This is useful for accessing SICA-specific functionality like
 * version management and improvement history.
 */
// eslint-disable-next-line @typescript-eslint/no-deprecated -- Intentional: backwards compat (Issue #595)
export function getSicaAgentFromOrchestrator(_techLead: ITechLead): SicaAgent | undefined {
  // This function exists for future extensibility when we need
  // to access SICA internals from the wrapped agent.
  // Currently returns undefined as we don't store the reference.
  return undefined;
}

/** @deprecated Use getSicaAgentFromOrchestrator instead (Issue #759) */
export const getSicaAgentFromTechLead = getSicaAgentFromOrchestrator;

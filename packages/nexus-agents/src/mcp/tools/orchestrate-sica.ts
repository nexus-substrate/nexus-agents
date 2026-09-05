/**
 * nexus-agents/mcp - SICA Integration for Orchestrate Tool
 *
 * Wraps Orchestrator with SICA self-improvement capabilities when enabled.
 * Provides IOrchestrator-compatible interface for seamless integration.
 *
 * @module mcp/tools/orchestrate-sica
 * (Source: Issue #558 - Wire SICA wrapping to Orchestrator)
 * (Issue #759 - Renamed functions to use Orchestrator terminology)
 */

import type { Result, ILogger, Task, AgentError, IModelAdapter } from '../../core/index.js';
import { Orchestrator } from '../../agents/index.js';
import { SicaAgent, createSicaAgent } from '../../agents/self-improving/sica-agent.js';
import { isSicaEnabled, getSicaConfig } from '../../cli-server-sica.js';
import type { ITechLead } from './orchestrate-types.js';

/**
 * Creates an orchestrator agent (optionally wrapped with SICA).
 *
 * When SICA is enabled in configuration, this wraps the orchestrator with
 * self-improvement capabilities. Otherwise, returns a plain orchestrator.
 *
 * @param logger - Logger instance
 * @param adapter - Optional model adapter for LLM-based analysis (Issue #827)
 * @returns Orchestrator-compatible agent
 */

export function createOrchestratorWithSica(logger: ILogger, adapter?: IModelAdapter): ITechLead {
  const orchestrator = new Orchestrator({ logger, ...(adapter !== undefined ? { adapter } : {}) });

  if (!isSicaEnabled()) {
    logger.debug('SICA not enabled, using plain orchestrator');
    return orchestrator;
  }

  const sicaConfig = getSicaConfig();
  if (sicaConfig === undefined) {
    logger.debug('SICA config unavailable, using plain orchestrator');
    return orchestrator;
  }

  logger.info('Creating SICA-wrapped orchestrator', {
    improvementThreshold: sicaConfig.improvementThreshold,
    maxActiveVersions: sicaConfig.maxActiveVersions,
  });

  const sicaAgent = createSicaAgent({
    baseAgent: orchestrator,
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

/**
 * Adapts SicaAgent to orchestrator interface.
 *
 * Transforms SicaExecutionResult to the shape expected by orchestrate tool.
 */

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
            ...(sicaResult.executedCli !== undefined && {
              executedCli: sicaResult.executedCli,
            }),
            ...(sicaResult.executedCliSource !== undefined && {
              executedCliSource: sicaResult.executedCliSource,
            }),
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

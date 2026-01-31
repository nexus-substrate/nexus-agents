/**
 * nexus-agents/mcp - SICA Integration for Orchestrate Tool
 *
 * Wraps TechLead with SICA self-improvement capabilities when enabled.
 * Provides ITechLead-compatible interface for seamless integration.
 *
 * @module mcp/tools/orchestrate-sica
 * (Source: Issue #558 - Wire SICA wrapping to TechLead)
 */

import type { Result, ILogger, Task, AgentError } from '../../core/index.js';
import { TechLead } from '../../agents/index.js';
import { SicaAgent, createSicaAgent } from '../../agents/self-improving/sica-agent.js';
import { isSicaEnabled, getSicaConfig } from '../../cli-server-sica.js';
import type { ITechLead } from './orchestrate.js';

/**
 * Creates a TechLead (optionally wrapped with SICA).
 *
 * When SICA is enabled in configuration, this wraps TechLead with
 * self-improvement capabilities. Otherwise, returns a plain TechLead.
 *
 * @param logger - Logger instance
 * @returns ITechLead-compatible agent
 */
// eslint-disable-next-line @typescript-eslint/no-deprecated -- Intentional: backwards compat (Issue #595)
export function createTechLeadWithSica(logger: ILogger): ITechLead {
  const techLead = new TechLead({ logger });

  if (!isSicaEnabled()) {
    logger.debug('SICA not enabled, using plain TechLead');
    return techLead;
  }

  const sicaConfig = getSicaConfig();
  if (sicaConfig === undefined) {
    logger.debug('SICA config unavailable, using plain TechLead');
    return techLead;
  }

  logger.info('Creating SICA-wrapped TechLead', {
    improvementThreshold: sicaConfig.improvementThreshold,
    maxActiveVersions: sicaConfig.maxActiveVersions,
  });

  const sicaAgent = createSicaAgent({
    baseAgent: techLead,
    initialConfig: {
      systemPrompt: 'TechLead orchestration agent',
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

  return createSicaTechLeadAdapter(sicaAgent, logger);
}

/**
 * Adapts SicaAgent to ITechLead interface.
 *
 * Transforms SicaExecutionResult to the shape expected by orchestrate tool.
 */
// eslint-disable-next-line @typescript-eslint/no-deprecated -- Intentional: backwards compat (Issue #595)
function createSicaTechLeadAdapter(sicaAgent: SicaAgent, _logger: ILogger): ITechLead {
  return {
    async execute(
      task: Task
    ): Promise<Result<{ taskId: string; output: unknown; metadata: unknown }, AgentError>> {
      const result = await sicaAgent.execute(task);

      if (!result.ok) {
        return result;
      }

      const sicaResult = result.value;

      // Transform SicaExecutionResult to ITechLead result shape
      return {
        ok: true,
        value: {
          taskId: task.id,
          output: sicaResult.output,
          metadata: {
            durationMs: sicaResult.metrics.durationMs,
            tokensUsed: sicaResult.metrics.tokensUsed,
            toolsUsed: [],
            model: 'sica-tech-lead',
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
 * Gets the SICA agent from an ITechLead if it was wrapped.
 * Returns undefined if the agent is a plain TechLead.
 *
 * This is useful for accessing SICA-specific functionality like
 * version management and improvement history.
 */
// eslint-disable-next-line @typescript-eslint/no-deprecated -- Intentional: backwards compat (Issue #595)
export function getSicaAgentFromTechLead(_techLead: ITechLead): SicaAgent | undefined {
  // This function exists for future extensibility when we need
  // to access SICA internals from the wrapped agent.
  // Currently returns undefined as we don't store the reference.
  return undefined;
}

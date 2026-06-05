/**
 * Puppeteer Orchestration CLI Helpers
 *
 * Helper functions for PuppeteerOrchestrator integration with the CLI.
 *
 * @module cli/orchestrate-puppeteer
 * (Source: Issue #386)
 */

import * as fs from 'node:fs';
import { getTimeProvider, getErrorMessage, type ILogger } from '../core/index.js';
import {
  PuppeteerOrchestrator,
  createLearnablePolicy,
  createRuleBasedPolicy,
  type PolicyParameters,
} from '../agents/orchestration/index.js';
import type { IAgent, Task as AgentTask } from '../core/types/agent.js';
import type { RoutingArmId, ICliAdapter } from '../cli-adapters/index.js';
import { routingArmDisplaySlot } from '../cli-adapters/index.js';
import type { OrchestrateOptions, PuppeteerOrchestrationResult } from './orchestrate-types.js';
import { CliAdapterAgent } from './cli-adapter-agent.js';
import { INTERNAL_TIMEOUTS } from '../config/timeouts.js';

// Re-export for backward compatibility
export type { PuppeteerOrchestrationResult } from './orchestrate-types.js';

/**
 * Load policy parameters from file if exists.
 */
export function loadPolicyParameters(path: string, logger: ILogger): PolicyParameters | undefined {
  try {
    if (fs.existsSync(path)) {
      const content = fs.readFileSync(path, 'utf-8');
      const params = JSON.parse(content) as PolicyParameters;
      logger.info('Loaded policy parameters', { path });
      return params;
    }
  } catch (error) {
    const message = getErrorMessage(error);
    logger.warn('Failed to load policy parameters', { path, error: message });
  }
  return undefined;
}

/**
 * Save policy parameters to file.
 */
export function savePolicyParameters(
  path: string,
  params: PolicyParameters,
  logger: ILogger
): void {
  try {
    fs.writeFileSync(path, JSON.stringify(params, null, 2));
    logger.info('Saved policy parameters', { path });
  } catch (error) {
    const message = getErrorMessage(error);
    logger.warn('Failed to save policy parameters', { path, error: message });
  }
}

/**
 * Create agents from CLI adapters.
 */
export function createAgentsFromAdapters(adapters: Map<RoutingArmId, ICliAdapter>): IAgent[] {
  const agents: IAgent[] = [];
  for (const [name, adapter] of adapters) {
    // The puppeteer engine identifies agents by CLI slot; an api:* arm collapses
    // to its display slot here (no distinct-arm learning in this path) (#3422).
    agents.push(new CliAdapterAgent(routingArmDisplaySlot(name), adapter));
  }
  return agents;
}

/**
 * Create and configure policy engine.
 */
export function createPolicyEngine(
  options: OrchestrateOptions,
  logger: ILogger
): ReturnType<typeof createLearnablePolicy> | ReturnType<typeof createRuleBasedPolicy> {
  const useLearnable = options.learn === true;

  if (useLearnable) {
    const learnablePolicy = createLearnablePolicy({
      learningRate: 0.01,
      warmupUpdates: 5,
    });

    if (options.policyPath !== undefined) {
      const savedParams = loadPolicyParameters(options.policyPath, logger);
      if (savedParams !== undefined) {
        learnablePolicy.loadParameters(savedParams);
      }
    }

    return learnablePolicy;
  }

  return createRuleBasedPolicy();
}

/**
 * Create PuppeteerOrchestrator instance.
 */
export function createOrchestrator(
  policyEngine: ReturnType<typeof createLearnablePolicy> | ReturnType<typeof createRuleBasedPolicy>,
  agents: IAgent[],
  options: OrchestrateOptions
): PuppeteerOrchestrator {
  const config = { maxSteps: options.maxSteps ?? 5, timeoutMs: INTERNAL_TIMEOUTS.puppeteerMs };

  return options.learn === true
    ? new PuppeteerOrchestrator({
        policyEngine,
        agents,
        config,
        learningConfig: { enableLearning: true, bufferCapacity: 1000, updateAfterEpisodes: 1 },
      })
    : new PuppeteerOrchestrator({ policyEngine, agents, config });
}

/**
 * Build orchestration result from puppeteer execution.
 */
export function buildPuppeteerResult(
  puppeteerResult: {
    success: boolean;
    output: unknown;
    totalSteps: number;
    trajectory: readonly unknown[];
    totalDurationMs: number;
  },
  startTime: number,
  policyEngine: ReturnType<typeof createLearnablePolicy> | ReturnType<typeof createRuleBasedPolicy>,
  useLearnable: boolean
): PuppeteerOrchestrationResult {
  const result: PuppeteerOrchestrationResult = {
    success: puppeteerResult.success,
    model: 'puppeteer',
    response: {
      text:
        typeof puppeteerResult.output === 'string'
          ? puppeteerResult.output
          : JSON.stringify(puppeteerResult.output),
      durationMs: puppeteerResult.totalDurationMs,
    },
    durationMs: getTimeProvider().now() - startTime,
    puppeteer: {
      totalSteps: puppeteerResult.totalSteps,
      trajectoryLength: puppeteerResult.trajectory.length,
    },
  };

  if (useLearnable && result.puppeteer !== undefined) {
    const learnablePolicy = policyEngine as ReturnType<typeof createLearnablePolicy>;
    result.puppeteer = {
      ...result.puppeteer,
      policyStats: learnablePolicy.getStats(),
    };
  }

  return result;
}

/**
 * Execute task with PuppeteerOrchestrator.
 */
export async function executeWithPuppeteer(
  taskContent: string,
  adapters: Map<RoutingArmId, ICliAdapter>,
  options: OrchestrateOptions,
  logger: ILogger
): Promise<PuppeteerOrchestrationResult> {
  const startTime = getTimeProvider().now();
  const useLearnable = options.learn === true;

  const agents = createAgentsFromAdapters(adapters);
  if (agents.length === 0) {
    return {
      success: false,
      model: 'puppeteer',
      error: 'No CLI adapters available to create agents',
      durationMs: getTimeProvider().now() - startTime,
    };
  }

  const policyEngine = createPolicyEngine(options, logger);
  const orchestrator = createOrchestrator(policyEngine, agents, options);
  const task: AgentTask = {
    id: `cli-${String(getTimeProvider().now())}`,
    description: taskContent,
    context: { workingDirectory: process.cwd() },
  };

  logger.info('Executing with PuppeteerOrchestrator', {
    agents: agents.map((a) => a.id),
    learnable: useLearnable,
    maxSteps: options.maxSteps ?? 5,
  });

  const execResult = await orchestrator.execute({ task });

  if (!execResult.ok) {
    return {
      success: false,
      model: 'puppeteer',
      error: execResult.error.message,
      durationMs: getTimeProvider().now() - startTime,
    };
  }

  const puppeteerResult = execResult.value;

  if (useLearnable && options.policyPath !== undefined) {
    const learnablePolicy = policyEngine as ReturnType<typeof createLearnablePolicy>;
    savePolicyParameters(options.policyPath, learnablePolicy.getParameters(), logger);
  }

  return buildPuppeteerResult(puppeteerResult, startTime, policyEngine, useLearnable);
}

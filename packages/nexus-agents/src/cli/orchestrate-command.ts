/**
 * CLI Orchestrate Command
 *
 * Executes tasks using locally authenticated CLI tools (Claude, Gemini, Codex)
 * without requiring MCP. Uses CompositeRouter for intelligent model selection.
 *
 * @module cli/orchestrate-command
 * (Source: Issue #183, 5-0 consensus vote for CLI orchestrator mode)
 * (Source: Issue #386, PuppeteerOrchestrator integration)
 */

/* eslint-disable no-console */
// Console output is intentional for CLI user feedback

import { createLogger, type ILogger } from '../core/index.js';
import {
  createCompositeRouter,
  createAllAdapters,
  getAvailableClis,
  type ICliAdapter,
  type CompositeRoutingDecision,
  type CliResponse,
  type CliName,
  type CliTask,
} from '../cli-adapters/index.js';
import {
  executeWithPuppeteer,
  type PuppeteerOrchestrationResult,
} from './orchestrate-puppeteer.js';

/** Engine type for orchestration */
export type OrchestrateEngine = 'router' | 'puppeteer';

/** Orchestrate command options */
export interface OrchestrateOptions {
  /** Task to execute */
  task: string;
  /** Specific model to use (bypasses routing) */
  model?: 'claude' | 'gemini' | 'codex' | undefined;
  /** Output format */
  format?: 'text' | 'json' | undefined;
  /** Enable verbose output */
  verbose?: boolean | undefined;
  /** Dry run - show routing decision without execution */
  dryRun?: boolean | undefined;
  /** Maximum tokens budget */
  maxTokens?: number | undefined;
  /** Maximum cost budget in USD */
  maxCostUsd?: number | undefined;
  /** Engine type: router (default) or puppeteer (#386) */
  engine?: OrchestrateEngine | undefined;
  /** Enable learnable policy (puppeteer engine only) */
  learn?: boolean | undefined;
  /** Path to load/save policy parameters (puppeteer engine only) */
  policyPath?: string | undefined;
  /** Maximum orchestration steps (puppeteer engine only) */
  maxSteps?: number | undefined;
}

/** Orchestration result */
interface OrchestrationResult {
  success: boolean;
  model: string;
  response?: CliResponse;
  routing?: CompositeRoutingDecision;
  error?: string;
  durationMs: number;
}

/**
 * Execute task with a routed adapter.
 */
async function runWithAdapter(
  task: CliTask,
  decision: CompositeRoutingDecision,
  logger: ILogger,
  startTime: number
): Promise<OrchestrationResult> {
  logger.info('Executing task...', { model: decision.cliName });
  const execResult = await decision.adapter.execute(task);

  if (!execResult.ok) {
    return {
      success: false,
      model: decision.cliName,
      routing: decision,
      error: execResult.error.message,
      durationMs: Date.now() - startTime,
    };
  }

  return {
    success: true,
    model: decision.cliName,
    response: execResult.value,
    routing: decision,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Execute task using available CLI adapters with intelligent routing.
 */
async function executeWithRouting(
  task: CliTask,
  adapters: Map<CliName, ICliAdapter>,
  options: OrchestrateOptions,
  logger: ILogger
): Promise<OrchestrationResult> {
  const startTime = Date.now();

  const router = createCompositeRouter(adapters, {
    budgetConstraints: {
      maxTokens: options.maxTokens ?? 100000,
      maxCostUsd: options.maxCostUsd ?? 10,
    },
  });

  logger.info('Routing task...', { task: task.content.slice(0, 50) });
  const routingResult = await router.route(task);

  if (!routingResult.ok) {
    return {
      success: false,
      model: 'none',
      error: routingResult.error.message,
      durationMs: Date.now() - startTime,
    };
  }

  const decision = routingResult.value;

  if (options.dryRun === true) {
    return {
      success: true,
      model: decision.cliName,
      routing: decision,
      durationMs: Date.now() - startTime,
    };
  }

  return runWithAdapter(task, decision, logger, startTime);
}

/**
 * Execute task with specific model (bypass routing).
 */
async function executeWithModel(
  task: CliTask,
  model: CliName,
  adapters: Map<CliName, ICliAdapter>,
  logger: ILogger
): Promise<OrchestrationResult> {
  const startTime = Date.now();

  const adapter = adapters.get(model);
  if (adapter === undefined) {
    return {
      success: false,
      model,
      error: `Model '${model}' not available. Available: ${[...adapters.keys()].join(', ')}`,
      durationMs: Date.now() - startTime,
    };
  }

  logger.info('Executing task...', { model });
  const execResult = await adapter.execute(task);

  if (!execResult.ok) {
    return {
      success: false,
      model,
      error: execResult.error.message,
      durationMs: Date.now() - startTime,
    };
  }

  return {
    success: true,
    model,
    response: execResult.value,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Format result for JSON output.
 */
function formatResultJson(result: OrchestrationResult | PuppeteerOrchestrationResult): string {
  const puppeteerResult = result as PuppeteerOrchestrationResult;
  return JSON.stringify(
    {
      success: result.success,
      model: result.model,
      durationMs: result.durationMs,
      ...(result.response !== undefined && {
        text: result.response.text,
        usage: (result.response as CliResponse).usage,
        costUsd: (result.response as CliResponse).costUsd,
      }),
      ...(result.routing !== undefined && {
        routing: {
          cliName: result.routing.cliName,
          confidence: result.routing.confidence,
          reason: result.routing.reason,
        },
      }),
      ...(puppeteerResult.puppeteer !== undefined && {
        puppeteer: puppeteerResult.puppeteer,
      }),
      ...(result.error !== undefined && { error: result.error }),
    },
    null,
    2
  );
}

/**
 * Format puppeteer stats for text output.
 */
function formatPuppeteerStats(puppeteer: PuppeteerOrchestrationResult['puppeteer']): string[] {
  if (puppeteer === undefined) return [];
  const lines = [
    '\n--- Orchestration Stats ---',
    `Steps: ${String(puppeteer.totalSteps)}`,
    `Trajectory: ${String(puppeteer.trajectoryLength)} actions`,
  ];
  if (puppeteer.policyStats !== undefined) {
    const stats = puppeteer.policyStats;
    lines.push(`Policy updates: ${String(stats.updateCount)}`);
    lines.push(`Learning rate: ${stats.currentLearningRate.toFixed(4)}`);
    lines.push(`Baseline: ${stats.baseline.toFixed(4)}`);
  }
  return lines;
}

/**
 * Format result for text output.
 */
function formatResultText(result: OrchestrationResult | PuppeteerOrchestrationResult): string {
  const lines: string[] = [];
  const puppeteerResult = result as PuppeteerOrchestrationResult;

  if (result.success) {
    lines.push(`Task completed using ${result.model} (${String(result.durationMs)}ms)`);

    if (result.routing !== undefined) {
      lines.push(`\nRouting: ${result.routing.reason}`);
      lines.push(`Confidence: ${(result.routing.confidence * 100).toFixed(1)}%`);
    }

    lines.push(...formatPuppeteerStats(puppeteerResult.puppeteer));

    if (result.response !== undefined) {
      lines.push('\n--- Response ---');
      lines.push(result.response.text);
      const cliResponse = result.response as CliResponse;
      if (cliResponse.usage !== undefined) {
        lines.push('\n--- Usage ---');
        lines.push(`Tokens: ${String(cliResponse.usage.totalTokens ?? 0)}`);
        if (cliResponse.costUsd !== undefined) {
          lines.push(`Cost: $${cliResponse.costUsd.toFixed(4)}`);
        }
      }
    }
  } else {
    lines.push(`Task failed: ${result.error ?? 'Unknown error'}`);
    lines.push(`Model: ${result.model}`);
    lines.push(`Duration: ${String(result.durationMs)}ms`);
  }

  return lines.join('\n');
}

/**
 * Format result for output.
 */
function formatResult(
  result: OrchestrationResult | PuppeteerOrchestrationResult,
  format: 'text' | 'json'
): string {
  return format === 'json' ? formatResultJson(result) : formatResultText(result);
}

/**
 * Main orchestrate command handler.
 */
export async function orchestrateCommand(options: OrchestrateOptions): Promise<number> {
  const logger = createLogger({ component: 'orchestrate', verbose: options.verbose });

  const availableClis = await getAvailableClis();
  if (availableClis.length === 0) {
    console.error('No CLI tools available.');
    console.error('Install and authenticate at least one of: claude, gemini, codex');
    console.error('Run "nexus-agents doctor" for details.');
    return 1;
  }

  if (options.verbose === true) {
    console.log(`Available CLIs: ${availableClis.join(', ')}`);
  }

  const adapters = createAllAdapters(logger);
  if (adapters.size === 0) {
    console.error('Failed to create CLI adapters.');
    return 1;
  }

  let result: OrchestrationResult | PuppeteerOrchestrationResult;

  if (options.engine === 'puppeteer') {
    result = await executeWithPuppeteer(options.task, adapters, options, logger);
  } else {
    const task: CliTask = {
      content: options.task,
      systemPrompt: 'You are a helpful assistant.',
    };

    if (options.model !== undefined) {
      result = await executeWithModel(task, options.model, adapters, logger);
    } else {
      result = await executeWithRouting(task, adapters, options, logger);
    }
  }

  const output = formatResult(result, options.format ?? 'text');
  console.log(output);

  for (const adapter of adapters.values()) {
    await adapter.dispose();
  }

  return result.success ? 0 : 1;
}

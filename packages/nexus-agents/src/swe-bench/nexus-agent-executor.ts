/**
 * nexus-agents/swe-bench - Nexus Agent Executor
 *
 * Real implementation of IAgentExecutor using nexus-agents ClaudeAdapter.
 *
 * @module swe-bench/nexus-agent-executor
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { Result } from '../core/result.js';
import { getTimeProvider } from '../core/index.js';
import { ClaudeAdapter } from '../adapters/claude-adapter.js';
import type { ClaudeAdapterConfig } from '../adapters/claude-adapter-types.js';
import type { IAgentExecutor, AgentContext, AgentExecutionResult } from './agent-runner.js';
import { AgentRunnerError } from './agent-runner.js';
import { getCliModelName, getDefaultModelForCli } from '../config/model-config-helpers.js';

/**
 * Configuration for the Nexus agent executor.
 */
export interface NexusAgentExecutorConfig {
  /** Anthropic API key. */
  readonly apiKey: string;
  /** Model ID to use (default: derived from canonical registry). */
  readonly modelId?: string | undefined;
  /** Maximum tokens for response (default: 16384). */
  readonly maxTokens?: number | undefined;
  /** Temperature for generation (default: 0.2). */
  readonly temperature?: number | undefined;
  /** Callback for message logging. */
  readonly onMessage?: ((message: string) => void) | undefined;
}

/**
 * Default values for executor configuration.
 * Model derived from canonical registry (default Claude model).
 */
const EXECUTOR_DEFAULTS = {
  modelId: getCliModelName(getDefaultModelForCli('claude')),
  maxTokens: 16384,
  temperature: 0.2,
} as const;

/**
 * Real agent executor using nexus-agents ClaudeAdapter.
 *
 * This implements the IAgentExecutor interface to run actual
 * model inference for SWE-bench tasks. Uses ClaudeAdapter directly
 * (not UnifiedAdapterRegistry) because SWE-bench evaluation is
 * Claude-specific and requires direct API key configuration.
 */
export class NexusAgentExecutor implements IAgentExecutor {
  private readonly adapter: ClaudeAdapter;
  private readonly maxTokens: number;
  private readonly temperature: number;
  private readonly messageCallback: ((message: string) => void) | null;

  constructor(config: NexusAgentExecutorConfig) {
    const adapterConfig: ClaudeAdapterConfig = {
      apiKey: config.apiKey,
      modelId: config.modelId ?? EXECUTOR_DEFAULTS.modelId,
    };

    this.adapter = new ClaudeAdapter(adapterConfig);
    this.maxTokens = config.maxTokens ?? EXECUTOR_DEFAULTS.maxTokens;
    this.temperature = config.temperature ?? EXECUTOR_DEFAULTS.temperature;
    this.messageCallback = config.onMessage ?? null;
  }

  /**
   * Execute a prompt using the Claude model.
   */
  async execute(
    systemPrompt: string,
    userPrompt: string,
    context: AgentContext
  ): Promise<Result<AgentExecutionResult, AgentRunnerError>> {
    const startTime = getTimeProvider().now();

    this.messageCallback?.(`Executing agent for ${context.instance.instance_id}`);

    try {
      const result = await this.adapter.complete({
        messages: [{ role: 'user', content: userPrompt }],
        systemPrompt,
        maxTokens: this.maxTokens,
        temperature: this.temperature,
      });

      if (!result.ok) {
        return {
          ok: false,
          error: new AgentRunnerError(`Model error: ${result.error.message}`, result.error),
        };
      }

      const response = this.extractTextFromResponse(result.value.content);
      const tokensUsed = result.value.usage.totalTokens;
      const durationMs = getTimeProvider().now() - startTime;

      this.messageCallback?.(`Completed in ${String(durationMs)}ms, ${String(tokensUsed)} tokens`);

      return {
        ok: true,
        value: {
          response,
          tokensUsed,
          durationMs,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: new AgentRunnerError(`Execution failed: ${message}`, err),
      };
    }
  }

  /**
   * Extract text content from response content blocks.
   */
  private extractTextFromResponse(content: readonly { type: string; text?: string }[]): string {
    return content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
  }

  /**
   * Get the model ID being used.
   */
  getModelId(): string {
    return this.adapter.modelId;
  }
}

/**
 * Creates a NexusAgentExecutor from environment.
 *
 * Looks for ANTHROPIC_API_KEY environment variable.
 */
export function createNexusExecutorFromEnv(
  overrides?: Partial<Omit<NexusAgentExecutorConfig, 'apiKey'>>
): Result<NexusAgentExecutor, AgentRunnerError> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey === undefined || apiKey.trim() === '') {
    return {
      ok: false,
      error: new AgentRunnerError(
        'ANTHROPIC_API_KEY environment variable is required for SWE-bench execution'
      ),
    };
  }

  return {
    ok: true,
    value: new NexusAgentExecutor({
      apiKey,
      ...overrides,
    }),
  };
}

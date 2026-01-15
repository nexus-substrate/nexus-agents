/**
 * nexus-agents/swe-bench - CLI Agent Executor
 *
 * Implementation of IAgentExecutor using Claude CLI (subprocess).
 * Does not require an API key - uses OAuth credentials from claude CLI.
 *
 * @module swe-bench/cli-agent-executor
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */

import type { Result } from '../core/result.js';
import { ClaudeCliAdapter } from '../cli-adapters/adapters/claude-adapter.js';
import type { IAgentExecutor, AgentContext, AgentExecutionResult } from './agent-runner.js';
import { AgentRunnerError } from './agent-runner.js';

/**
 * Configuration for the CLI agent executor.
 */
export interface CliAgentExecutorConfig {
  /** Model ID to use (default: claude-sonnet-4). */
  readonly modelId?: string | undefined;
  /** Timeout per execution in milliseconds (default: 300000 = 5 minutes). */
  readonly timeoutMs?: number | undefined;
  /** Callback for message logging. */
  readonly onMessage?: ((message: string) => void) | undefined;
}

/**
 * Default values for executor configuration.
 * Note: Uses CLI alias 'sonnet' instead of full model name for compatibility.
 */
const CLI_EXECUTOR_DEFAULTS = {
  modelId: 'sonnet',
  timeoutMs: 600_000, // 10 minutes - SWE-bench tasks involve file exploration
} as const;

/**
 * Agent executor using Claude CLI (subprocess transport).
 *
 * This implements the IAgentExecutor interface using the Claude CLI,
 * which authenticates via OAuth and doesn't require an API key.
 */
export class CliAgentExecutor implements IAgentExecutor {
  private readonly adapter: ClaudeCliAdapter;
  private readonly modelId: string;
  private readonly timeoutMs: number;
  private readonly messageCallback: ((message: string) => void) | null;

  constructor(config?: CliAgentExecutorConfig) {
    this.modelId = config?.modelId ?? CLI_EXECUTOR_DEFAULTS.modelId;
    this.timeoutMs = config?.timeoutMs ?? CLI_EXECUTOR_DEFAULTS.timeoutMs;
    this.adapter = new ClaudeCliAdapter({ model: this.modelId });
    this.messageCallback = config?.onMessage ?? null;
  }

  /**
   * Execute a prompt using the Claude CLI.
   */
  async execute(
    systemPrompt: string,
    userPrompt: string,
    context: AgentContext
  ): Promise<Result<AgentExecutionResult, AgentRunnerError>> {
    const startTime = Date.now();

    this.messageCallback?.(`Executing agent for ${context.instance.instance_id} via CLI`);
    this.messageCallback?.(`Working directory: ${context.workDir}`);

    try {
      const result = await this.adapter.execute(
        {
          content: userPrompt,
          systemPrompt,
          model: this.modelId,
          options: { workDir: context.workDir },
        },
        { timeoutMs: this.timeoutMs }
      );

      if (!result.ok) {
        return {
          ok: false,
          error: new AgentRunnerError(`CLI error: ${result.error.message}`, result.error),
        };
      }

      const response = result.value.text;
      const tokensUsed =
        result.value.usage?.totalTokens ?? this.estimateTokens(userPrompt, response);
      const durationMs = result.value.durationMs ?? Date.now() - startTime;

      this.messageCallback?.(`Completed in ${String(durationMs)}ms, ~${String(tokensUsed)} tokens`);

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
        error: new AgentRunnerError(`CLI execution failed: ${message}`, err),
      };
    }
  }

  /**
   * Estimate tokens when usage not available.
   * Uses ~4 chars per token heuristic.
   */
  private estimateTokens(input: string, output: string): number {
    return Math.ceil((input.length + output.length) / 4);
  }

  /**
   * Get the model ID being used.
   */
  getModelId(): string {
    return this.modelId;
  }
}

/**
 * Checks if Claude CLI is available and authenticated.
 */
export async function isCliAvailable(): Promise<boolean> {
  try {
    const adapter = new ClaudeCliAdapter();
    const health = await adapter.healthCheck();
    return health.healthy;
  } catch {
    return false;
  }
}

/**
 * Creates a CliAgentExecutor if CLI is available.
 *
 * @returns Executor if CLI available, error otherwise
 */
export async function createCliExecutor(
  config?: CliAgentExecutorConfig
): Promise<Result<CliAgentExecutor, AgentRunnerError>> {
  const available = await isCliAvailable();

  if (!available) {
    return {
      ok: false,
      error: new AgentRunnerError(
        'Claude CLI is not available or not authenticated. Run "claude auth" to authenticate.'
      ),
    };
  }

  return {
    ok: true,
    value: new CliAgentExecutor(config),
  };
}

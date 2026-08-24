/**
 * CLI Adapter Agent Wrapper
 *
 * Wraps a CLI adapter (Claude, Gemini, Codex) to implement the IAgent interface
 * for use with PuppeteerOrchestrator.
 *
 * @module cli/cli-adapter-agent
 * (Source: Issue #386)
 */

import type {
  IAgent,
  Task as AgentTask,
  TaskResult,
  AgentMessage,
  AgentResponse,
  AgentState,
  AgentRole,
  AgentCapability,
  AgentContext,
} from '../core/types/agent.js';
import {
  ok as agentOk,
  err as agentErr,
  AgentCapability as Cap,
  getTimeProvider,
} from '../core/index.js';
import { AgentError } from '../core/errors.js';
import type { Result } from '../core/result.js';
import type { ICliAdapter, CliName, CliTask } from '../cli-adapters/index.js';

/**
 * Wraps a CLI adapter to implement the IAgent interface.
 */
export class CliAdapterAgent implements IAgent {
  readonly id: string;
  readonly role: AgentRole = 'worker';
  readonly state: AgentState = 'idle';
  readonly capabilities: readonly AgentCapability[] = [
    Cap.TASK_EXECUTION,
    Cap.CODE_GENERATION,
    Cap.RESEARCH,
  ];

  private readonly adapter: ICliAdapter;
  private readonly cliName: CliName;

  constructor(cliName: CliName, adapter: ICliAdapter) {
    this.id = `cli-${cliName}`;
    this.cliName = cliName;
    this.adapter = adapter;
  }

  async execute(task: AgentTask): Promise<Result<TaskResult, AgentError>> {
    const startTime = getTimeProvider().now();
    const cliTask: CliTask = {
      content: task.description,
      systemPrompt: 'You are a helpful assistant.',
    };

    const result = await this.adapter.execute(cliTask);
    if (!result.ok) {
      return agentErr(new AgentError(result.error.message));
    }

    return agentOk({
      taskId: task.id,
      output: result.value.text,
      metadata: {
        durationMs: getTimeProvider().now() - startTime,
        tokensUsed: result.value.usage?.totalTokens ?? 0,
        tokensMeasured: result.value.usage?.totalTokens !== undefined,
        toolsUsed: [],
        model: this.cliName,
      },
    });
  }

  handleMessage(_msg: AgentMessage): Promise<Result<AgentResponse, AgentError>> {
    return Promise.resolve(
      agentOk({
        messageId: _msg.id,
        status: 'completed',
      })
    );
  }

  initialize(_ctx: AgentContext): Promise<Result<void, AgentError>> {
    return Promise.resolve(agentOk(undefined));
  }

  async cleanup(): Promise<void> {
    await this.adapter.dispose();
  }
}

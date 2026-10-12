/**
 * nexus-agents/agents/experts - Expert Agent
 *
 * The concrete {@link Expert} agent class, extracted from `expert-factory.ts`
 * so that both the factory and the opt-in recovery wrapper
 * ({@link ./expert-recovery.ts | RecoverableExpert}) can extend/reference it
 * without a factory↔recovery import cycle (#4286).
 */

import type { Result, Task, TaskResult, AgentError } from '../../core/index.js';
import { SimpleAgent } from '../simple-agent.js';
import type { BaseAgentOptions } from '../base-agent.js';
import type { ExpertConfig } from './expert-config.js';
import type { ExpertRecoveryPolicy } from './expert-recovery.js';

/**
 * Expert agent extending SimpleAgent with configuration-based setup.
 */
export class Expert extends SimpleAgent {
  readonly expertConfig: ExpertConfig;

  constructor(options: BaseAgentOptions, config: ExpertConfig) {
    super(options);
    this.expertConfig = config;
  }

  /**
   * Execute a task with optional abort signal and recovery policy override (#4291).
   */
  override async execute(
    task: Task,
    options?: { signal?: AbortSignal; recoveryPolicy?: ExpertRecoveryPolicy }
  ): Promise<Result<TaskResult, AgentError>> {
    return super.execute(task, options);
  }

  /**
   * Get the expert's name.
   */
  get name(): string {
    return this.expertConfig.name;
  }

  /**
   * Get the expert's metadata.
   */
  get metadata(): Record<string, unknown> | undefined {
    return this.expertConfig.metadata;
  }
}

/**
 * nexus-agents/agents/experts - Expert Agent
 *
 * The concrete {@link Expert} agent class, extracted from `expert-factory.ts`
 * so that both the factory and the opt-in recovery wrapper
 * ({@link ./expert-recovery.ts | RecoverableExpert}) can extend/reference it
 * without a factory↔recovery import cycle (#4286).
 */

import { SimpleAgent } from '../simple-agent.js';
import type { BaseAgentOptions } from '../base-agent.js';
import type { ExpertConfig } from './expert-config.js';

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

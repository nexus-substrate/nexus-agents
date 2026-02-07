/**
 * nexus-agents/testing/framework - Test Runner Types
 *
 * Type definitions for the test runner.
 *
 * (Source: cli-project_plan.md v2.1.0, Phase 3)
 */

import type { ILogger } from '../../core/logger.js';
import type { ICliAdapter, CliName } from '../../cli-adapters/types.js';
import type { ITaskRouter } from '../../cli-adapters/router-types.js';
import type { TaskRegistry } from './task-registry.js';
import type { RubricScorer } from './rubric-scorer.js';
import type { RoutingScorer } from './routing-scorer.js';
import type { TestRunnerConfig } from './types.js';

/**
 * Test run error for runner failures.
 */
export class TestRunError extends Error {
  constructor(
    message: string,
    readonly phase: 'setup' | 'execution' | 'teardown',
    override readonly cause?: Error
  ) {
    super(message);
    this.name = 'TestRunError';
  }
}

/**
 * Options for creating a TestRunner.
 */
export interface TestRunnerOptions {
  /** CLI adapters keyed by name */
  readonly adapters: Map<CliName, ICliAdapter>;
  /** Task registry containing evaluation tasks */
  readonly taskRegistry: TaskRegistry;
  /** Rubric scorer for evaluating responses */
  readonly rubricScorer: RubricScorer;
  /** Routing scorer for evaluating routing decisions */
  readonly routingScorer: RoutingScorer;
  /** Optional configuration */
  readonly config?: Partial<TestRunnerConfig>;
  /** Optional task router */
  readonly router?: ITaskRouter;
  /** Optional logger */
  readonly logger?: ILogger;
}

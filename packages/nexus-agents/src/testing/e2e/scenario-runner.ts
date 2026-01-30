/**
 * nexus-agents/testing/e2e - Scenario Runner
 *
 * Layer 1 testing: Execute workflow scenarios with stubbed dependencies.
 * Fast, deterministic tests suitable for CI execution (<5 min).
 *
 * @module testing/e2e/scenario-runner
 * (Source: Issue #281, Consensus Vote 5-0)
 */

import { readFile } from 'node:fs/promises';
import * as yaml from 'yaml';
import type { WorkflowDefinition, StepResult } from '../../core/index.js';
import { getTimeProvider } from '../../core/index.js';
import { WorkflowDefinitionSchema } from '../../workflows/workflow-types.js';
import { logger } from '../../core/logger.js';
import type {
  IScenarioRunner,
  ScenarioFixture,
  ScenarioResult,
  StepExpectation,
  StepValidation,
  E2ETestConfig,
} from './types.js';
import { DEFAULT_E2E_CONFIG } from './types.js';
import {
  ScenarioFixtureSchema,
  validateSingleResult,
  checkCircularDependencies,
} from './scenario-runner-helpers.js';

/**
 * Stub factory for creating mock dependencies.
 */
export interface StubFactory {
  /**
   * Create a stub for an agent action.
   */
  createAgentStub(agentType: string, action: string): StubFunction;
}

/**
 * Stub function signature.
 */
export type StubFunction = (inputs: Record<string, unknown>) => Promise<StepResult>;

/**
 * Default stub factory that returns canned responses.
 */
export const defaultStubFactory: StubFactory = {
  createAgentStub(agentType: string, action: string): StubFunction {
    return async (inputs: Record<string, unknown>): Promise<StepResult> => {
      // Simulate some processing time
      await new Promise((resolve) => setTimeout(resolve, 10));

      return {
        stepId: `${agentType}-${action}`,
        status: 'success',
        output: JSON.stringify({
          stub: true,
          agent: agentType,
          action,
          inputKeys: Object.keys(inputs),
          timestamp: new Date(getTimeProvider().now()).toISOString(),
        }),
        durationMs: 10,
      };
    };
  },
};

/**
 * Scenario runner for Layer 1 E2E testing.
 */
export class ScenarioRunner implements IScenarioRunner {
  private readonly stubFactory: StubFactory;
  private readonly log = logger.child({ component: 'ScenarioRunner' });

  constructor(stubFactory: StubFactory = defaultStubFactory) {
    this.stubFactory = stubFactory;
  }

  /**
   * Load a scenario fixture from a YAML file.
   */
  async loadFixture(path: string): Promise<ScenarioFixture> {
    const content = await readFile(path, 'utf-8');
    const data: unknown = yaml.parse(content);
    return ScenarioFixtureSchema.parse(data);
  }

  /**
   * Run a scenario test.
   */
  async run(scenario: ScenarioFixture, config?: Partial<E2ETestConfig>): Promise<ScenarioResult> {
    const testConfig: E2ETestConfig = { ...DEFAULT_E2E_CONFIG, ...config };
    const startTime = getTimeProvider().now();

    this.log.info('Running scenario', { scenarioId: scenario.id, dryRun: testConfig.dryRun });

    if (testConfig.dryRun) {
      return this.runDryRun(scenario, startTime);
    }

    try {
      // Execute workflow steps with stubs
      const stepResults = await this.executeSteps(scenario, testConfig);

      // Validate results against expectations
      const validations = this.validateResults(stepResults, scenario.expectedOutputs);

      const passed = validations.every((v) => v.passed);
      const durationMs = getTimeProvider().now() - startTime;

      this.log.info('Scenario completed', { scenarioId: scenario.id, passed, durationMs });

      return {
        scenarioId: scenario.id,
        passed,
        stepResults: validations,
        durationMs,
        executedAt: new Date(getTimeProvider().now()).toISOString(),
      };
    } catch (error) {
      const durationMs = getTimeProvider().now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.log.error('Scenario failed', error instanceof Error ? error : new Error(String(error)), {
        scenarioId: scenario.id,
      });

      return {
        scenarioId: scenario.id,
        passed: false,
        stepResults: [],
        durationMs,
        error: errorMessage,
        executedAt: new Date(getTimeProvider().now()).toISOString(),
      };
    }
  }

  /**
   * Run multiple scenarios.
   */
  async runAll(
    scenarios: ScenarioFixture[],
    config?: Partial<E2ETestConfig>
  ): Promise<ScenarioResult[]> {
    const results: ScenarioResult[] = [];

    for (const scenario of scenarios) {
      const result = await this.run(scenario, config);
      results.push(result);
    }

    return results;
  }

  /**
   * Validate a workflow definition against its Zod schema (Layer 0).
   */
  validateContract(workflow: WorkflowDefinition): string[] {
    const errors: string[] = [];

    try {
      WorkflowDefinitionSchema.parse(workflow);
    } catch (err) {
      if (err instanceof Error) {
        errors.push(err.message);
      }
    }

    // Additional validation rules
    if (workflow.name.length === 0) {
      errors.push('Workflow name is required');
    }

    if (workflow.steps.length === 0) {
      errors.push('Workflow must have at least one step');
    }

    // Check for circular dependencies
    const dependencyErrors = checkCircularDependencies(workflow);
    errors.push(...dependencyErrors);

    return errors;
  }

  /**
   * Dry-run mode: log actions without executing.
   */
  private runDryRun(scenario: ScenarioFixture, startTime: number): ScenarioResult {
    this.log.info('[DRY-RUN] Would execute scenario', {
      scenarioId: scenario.id,
      workflow: scenario.workflow,
      inputs: Object.keys(scenario.inputs),
      expectedSteps: scenario.expectedOutputs.map((e) => e.stepId),
    });

    const validations: StepValidation[] = scenario.expectedOutputs.map((expected) => ({
      stepId: expected.stepId,
      passed: true,
      actual: undefined,
      expected,
      failures: [],
    }));

    return {
      scenarioId: scenario.id,
      passed: true,
      stepResults: validations,
      durationMs: getTimeProvider().now() - startTime,
      executedAt: new Date(getTimeProvider().now()).toISOString(),
    };
  }

  /**
   * Execute workflow steps using stubs.
   */
  private async executeSteps(
    scenario: ScenarioFixture,
    config: E2ETestConfig
  ): Promise<Map<string, StepResult>> {
    const results = new Map<string, StepResult>();

    // For each expected output, create and execute a stub
    for (const expected of scenario.expectedOutputs) {
      const stub = this.stubFactory.createAgentStub('stubbed', expected.stepId);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Step ${expected.stepId} timed out`));
        }, config.timeoutMs);
      });

      const stepResult = await Promise.race([stub(scenario.inputs), timeoutPromise]);

      results.set(expected.stepId, {
        ...stepResult,
        stepId: expected.stepId,
      });
    }

    return results;
  }

  /**
   * Validate step results against expectations.
   */
  private validateResults(
    results: Map<string, StepResult>,
    expectations: readonly StepExpectation[]
  ): StepValidation[] {
    return expectations.map((expected) => validateSingleResult(results, expected));
  }
}

/**
 * Factory function to create a scenario runner.
 */
export function createScenarioRunner(stubFactory?: StubFactory): IScenarioRunner {
  return new ScenarioRunner(stubFactory);
}

/**
 * Tests for ScenarioRunner (Layer 1 E2E Testing)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ScenarioRunner,
  createScenarioRunner,
  defaultStubFactory,
  type StubFactory,
} from './scenario-runner.js';
import type { ScenarioFixture, E2ETestConfig } from './types.js';
import type { WorkflowDefinition } from '../../core/index.js';

describe('ScenarioRunner', () => {
  let runner: ScenarioRunner;

  beforeEach(() => {
    runner = new ScenarioRunner();
  });

  describe('constructor', () => {
    it('should create with default stub factory', () => {
      const r = new ScenarioRunner();
      expect(r).toBeInstanceOf(ScenarioRunner);
    });

    it('should create with custom stub factory', () => {
      const customFactory: StubFactory = {
        createAgentStub: () => () =>
          Promise.resolve({
            stepId: 'custom',
            status: 'success' as const,
            output: 'custom output',
            durationMs: 5,
          }),
      };
      const r = new ScenarioRunner(customFactory);
      expect(r).toBeInstanceOf(ScenarioRunner);
    });
  });

  describe('run', () => {
    const basicScenario: ScenarioFixture = {
      id: 'test-scenario',
      name: 'Test Scenario',
      description: 'A test scenario',
      workflow: 'test-workflow',
      inputs: { key: 'value' },
      expectedOutputs: [
        { stepId: 'step-1', status: 'success' },
        { stepId: 'step-2', status: 'success' },
      ],
      timeoutMs: 30000,
      tags: ['test'],
      classification: 'internal',
    };

    it('should run scenario and return results', async () => {
      const result = await runner.run(basicScenario);

      expect(result.scenarioId).toBe('test-scenario');
      expect(result.passed).toBe(true);
      expect(result.stepResults).toHaveLength(2);
      expect(result.executedAt).toBeDefined();
    });

    it('should not pass a scenario that asserted nothing (#4581)', async () => {
      const emptyScenario: ScenarioFixture = { ...basicScenario, expectedOutputs: [] };

      const result = await runner.run(emptyScenario);

      expect(result.stepResults).toHaveLength(0);
      expect(result.passed).toBe(false);
    });

    it('should validate step status matches expectation', async () => {
      const result = await runner.run(basicScenario);

      for (const stepResult of result.stepResults) {
        expect(stepResult.passed).toBe(true);
        expect(stepResult.actual?.status).toBe('success');
      }
    });

    it('should run in dry-run mode', async () => {
      const config: Partial<E2ETestConfig> = { dryRun: true };
      const result = await runner.run(basicScenario, config);

      expect(result.passed).toBe(true);
      expect(result.stepResults).toHaveLength(2);
    });

    it('should fail when step status does not match', async () => {
      const failingFactory: StubFactory = {
        createAgentStub: () => () =>
          Promise.resolve({
            stepId: 'test',
            status: 'failed' as const,
            output: 'error',
            durationMs: 5,
          }),
      };
      const failRunner = new ScenarioRunner(failingFactory);
      const result = await failRunner.run(basicScenario);

      expect(result.passed).toBe(false);
      expect(result.stepResults.some((s) => !s.passed)).toBe(true);
    });

    it('should validate duration constraints', async () => {
      const scenario: ScenarioFixture = {
        ...basicScenario,
        expectedOutputs: [{ stepId: 'step-1', status: 'success', maxDurationMs: 1 }],
      };

      // Default stub has 10ms delay, so this should fail
      const slowFactory: StubFactory = {
        createAgentStub: () => async () => {
          await new Promise((r) => setTimeout(r, 50));
          return {
            stepId: 'step-1',
            status: 'success' as const,
            output: 'ok',
            durationMs: 50,
          };
        },
      };
      const slowRunner = new ScenarioRunner(slowFactory);
      const result = await slowRunner.run(scenario);

      expect(result.stepResults[0]?.passed).toBe(false);
      expect(result.stepResults[0]?.failures.some((f) => f.includes('exceeded max'))).toBe(true);
    });

    it('should validate output patterns', async () => {
      const scenario: ScenarioFixture = {
        ...basicScenario,
        expectedOutputs: [{ stepId: 'step-1', status: 'success', outputPattern: 'stub.*true' }],
      };

      const result = await runner.run(scenario);

      expect(result.stepResults[0]?.passed).toBe(true);
    });

    it('should fail on unmatched output pattern', async () => {
      const scenario: ScenarioFixture = {
        ...basicScenario,
        expectedOutputs: [{ stepId: 'step-1', status: 'success', outputPattern: 'nonexistent' }],
      };

      const result = await runner.run(scenario);

      expect(result.stepResults[0]?.passed).toBe(false);
      expect(result.stepResults[0]?.failures.some((f) => f.includes('did not match pattern'))).toBe(
        true
      );
    });

    it('should validate required fields in output', async () => {
      const patternFactory: StubFactory = {
        createAgentStub: () => () =>
          Promise.resolve({
            stepId: 'step-1',
            status: 'success' as const,
            output: JSON.stringify({ fieldA: 'value', fieldB: 123 }),
            durationMs: 5,
          }),
      };
      const patternRunner = new ScenarioRunner(patternFactory);

      const scenario: ScenarioFixture = {
        ...basicScenario,
        expectedOutputs: [
          { stepId: 'step-1', status: 'success', requiredFields: ['fieldA', 'fieldB'] },
        ],
      };

      const result = await patternRunner.run(scenario);
      expect(result.stepResults[0]?.passed).toBe(true);
    });

    it('should fail on missing required fields', async () => {
      const scenario: ScenarioFixture = {
        ...basicScenario,
        expectedOutputs: [
          { stepId: 'step-1', status: 'success', requiredFields: ['missingField'] },
        ],
      };

      const result = await runner.run(scenario);

      expect(result.stepResults[0]?.passed).toBe(false);
      expect(
        result.stepResults[0]?.failures.some((f) => f.includes('Missing required field'))
      ).toBe(true);
    });
  });

  describe('runAll', () => {
    it('should run multiple scenarios', async () => {
      const scenarios: ScenarioFixture[] = [
        {
          id: 'scenario-1',
          name: 'Scenario 1',
          description: '',
          workflow: 'wf1',
          inputs: {},
          expectedOutputs: [{ stepId: 's1', status: 'success' }],
          timeoutMs: 30000,
          tags: [],
          classification: 'internal',
        },
        {
          id: 'scenario-2',
          name: 'Scenario 2',
          description: '',
          workflow: 'wf2',
          inputs: {},
          expectedOutputs: [{ stepId: 's2', status: 'success' }],
          timeoutMs: 30000,
          tags: [],
          classification: 'internal',
        },
      ];

      const results = await runner.runAll(scenarios);

      expect(results).toHaveLength(2);
      expect(results[0]?.scenarioId).toBe('scenario-1');
      expect(results[1]?.scenarioId).toBe('scenario-2');
    });
  });

  describe('validateContract', () => {
    it('should validate workflow with valid schema', () => {
      // Minimal valid workflow for contract validation
      const workflow = {
        name: 'test-workflow',
        version: '1.0.0',
        description: 'A test workflow',
        inputs: [],
        steps: [
          {
            id: 'step-1',
            agent: 'code',
            action: 'execute',
            inputs: {},
          },
        ],
        outputs: [],
      };

      const errors = runner.validateContract(workflow as WorkflowDefinition);
      // May have schema validation messages, but should not have structural errors
      expect(errors.includes('Workflow name is required')).toBe(false);
      expect(errors.includes('Workflow must have at least one step')).toBe(false);
    });

    it('should detect missing workflow name', () => {
      const workflow = {
        name: '',
        version: '1.0.0',
        steps: [
          {
            id: 'step-1',
            agent: 'code',
            action: 'execute',
            inputs: {},
          },
        ],
        inputs: [],
        outputs: [],
      };

      const errors = runner.validateContract(workflow as WorkflowDefinition);
      expect(errors).toContain('Workflow name is required');
    });

    it('should detect missing steps', () => {
      const workflow = {
        name: 'test',
        version: '1.0.0',
        steps: [],
        inputs: [],
        outputs: [],
      };

      const errors = runner.validateContract(workflow);
      expect(errors).toContain('Workflow must have at least one step');
    });

    it('should detect circular dependencies', () => {
      const workflow = {
        name: 'circular-workflow',
        version: '1.0.0',
        steps: [
          {
            id: 'step-a',
            agent: 'code',
            action: 'execute',
            inputs: {},
            dependsOn: ['step-b'],
          },
          {
            id: 'step-b',
            agent: 'code',
            action: 'execute',
            inputs: {},
            dependsOn: ['step-a'],
          },
        ],
        inputs: [],
        outputs: [],
      };

      const errors = runner.validateContract(workflow as WorkflowDefinition);
      expect(errors.some((e) => e.includes('Circular dependency'))).toBe(true);
    });
  });

  describe('createScenarioRunner', () => {
    it('should create runner via factory function', () => {
      const r = createScenarioRunner();
      expect(r).toBeDefined();
    });

    it('should accept custom stub factory', () => {
      const factory: StubFactory = {
        createAgentStub: () => () =>
          Promise.resolve({
            stepId: 'test',
            status: 'success' as const,
            output: 'custom',
            durationMs: 0,
          }),
      };
      const r = createScenarioRunner(factory);
      expect(r).toBeDefined();
    });
  });

  describe('defaultStubFactory', () => {
    it('should create stubs that return success', async () => {
      const stub = defaultStubFactory.createAgentStub('code-expert', 'analyze');
      const result = await stub({ code: 'const x = 1;' });

      expect(result.status).toBe('success');
      expect(result.output).toContain('stub');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should include agent and action in output', async () => {
      const stub = defaultStubFactory.createAgentStub('security', 'audit');
      const result = await stub({});

      const output = JSON.parse(result.output as string);
      expect(output.agent).toBe('security');
      expect(output.action).toBe('audit');
    });
  });
});

/**
 * Tests for JourneySimulator (Layer 3 E2E Testing)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  JourneySimulator,
  createJourneySimulator,
  DefaultActionExecutor,
  type IActionExecutor,
} from './journey-simulator.js';
import type { UserJourney, JourneyAction } from './types.js';

/** Fast executor that skips real setTimeout delays (perf: saves ~3s).
 *  Preserves 'fail' semantics and 'wait' with duration for timeout tests. */
const fastExecutor: IActionExecutor = {
  execute: async (action: JourneyAction, index: number) => {
    if (action.command.includes('fail')) {
      return {
        index,
        succeeded: false,
        durationMs: 0,
        error: `Simulated failure for command: ${action.command}`,
      };
    }
    // For 'wait' actions, use a minimal delay to allow timeout races to work
    if (action.type === 'wait') {
      const duration = typeof action.args?.duration === 'number' ? action.args.duration : 50;
      await new Promise((r) => setTimeout(r, Math.min(duration, 50)));
    }
    return { index, succeeded: true, durationMs: 1 };
  },
};

describe('JourneySimulator', () => {
  let simulator: JourneySimulator;

  beforeEach(() => {
    simulator = new JourneySimulator(fastExecutor);
  });

  describe('constructor', () => {
    it('should create with default executor', () => {
      const s = new JourneySimulator();
      expect(s).toBeInstanceOf(JourneySimulator);
    });

    it('should create with custom executor', () => {
      const customExecutor: IActionExecutor = {
        execute: () => Promise.resolve({ index: 0, succeeded: true, durationMs: 1 }),
      };
      const s = new JourneySimulator(customExecutor);
      expect(s).toBeInstanceOf(JourneySimulator);
    });
  });

  describe('simulate', () => {
    const basicJourney: UserJourney = {
      id: 'test-journey',
      name: 'Test Journey',
      description: 'A test user journey',
      actions: [
        { type: 'cli_command', command: 'nexus-agents doctor' },
        { type: 'mcp_tool', command: 'orchestrate', args: { task: 'test' } },
      ],
      successCriteria: ['All actions complete'],
      maxTimeToFirstSuccessMs: 60000,
    };

    it('should simulate journey and return results', async () => {
      const result = await simulator.simulate(basicJourney);

      expect(result.journeyId).toBe('test-journey');
      expect(result.actionResults).toHaveLength(2);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should succeed when all actions succeed', async () => {
      const result = await simulator.simulate(basicJourney);

      expect(result.succeeded).toBe(true);
      expect(result.failedAtAction).toBeUndefined();
      expect(result.error).toBeUndefined();
    });

    it('should fail when an action fails', async () => {
      const failingJourney: UserJourney = {
        ...basicJourney,
        actions: [
          { type: 'cli_command', command: 'fail-command' }, // 'fail' triggers error
        ],
      };

      const result = await simulator.simulate(failingJourney);

      expect(result.succeeded).toBe(false);
      expect(result.failedAtAction).toBe(0);
      expect(result.error).toContain('fail');
    });

    it('should track time to first success', async () => {
      const result = await simulator.simulate(basicJourney);

      expect(result.timeToFirstSuccessMs).toBeGreaterThan(0);
      expect(result.timeToFirstSuccessMs).toBeLessThanOrEqual(result.durationMs);
    });

    it('should handle action timeout', async () => {
      const timeoutJourney: UserJourney = {
        ...basicJourney,
        actions: [{ type: 'wait', command: 'wait', args: { duration: 5000 }, timeoutMs: 10 }],
      };

      const result = await simulator.simulate(timeoutJourney);

      expect(result.succeeded).toBe(false);
      expect(result.error).toContain('timed out');
    });

    it('should execute actions sequentially', async () => {
      const times: number[] = [];
      const trackingExecutor: IActionExecutor = {
        async execute() {
          times.push(Date.now());
          await new Promise((r) => setTimeout(r, 5));
          return { index: 0, succeeded: true, durationMs: 5 };
        },
      };
      const trackingSimulator = new JourneySimulator(trackingExecutor);

      await trackingSimulator.simulate(basicJourney);

      expect(times).toHaveLength(2);
      // Allow 2ms tolerance for timer variance (setTimeout is not exact)
      expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(3);
    });

    it('should stop on first failure', async () => {
      const executionOrder: number[] = [];
      let callCount = 0;
      const trackingExecutor: IActionExecutor = {
        execute() {
          callCount++;
          executionOrder.push(callCount);
          if (callCount === 2) {
            return Promise.resolve({
              index: callCount,
              succeeded: false,
              durationMs: 1,
              error: 'Fail at 2',
            });
          }
          return Promise.resolve({ index: callCount, succeeded: true, durationMs: 1 });
        },
      };
      const trackingSimulator = new JourneySimulator(trackingExecutor);

      const threeActionJourney: UserJourney = {
        ...basicJourney,
        actions: [
          { type: 'cli_command', command: 'cmd1' },
          { type: 'cli_command', command: 'cmd2' },
          { type: 'cli_command', command: 'cmd3' },
        ],
      };

      const result = await trackingSimulator.simulate(threeActionJourney);

      expect(result.succeeded).toBe(false);
      expect(result.failedAtAction).toBe(1);
      expect(executionOrder).toEqual([1, 2]); // Third action not executed
    });
  });

  describe('generateDocs', () => {
    const journey: UserJourney = {
      id: 'doc-journey',
      name: 'Documentation Test Journey',
      description: 'Testing documentation generation',
      actions: [
        {
          type: 'cli_command',
          command: 'nexus-agents doctor',
          expectedOutcome: 'Health check passes',
        },
        { type: 'mcp_tool', command: 'orchestrate', args: { task: 'test' } },
      ],
      successCriteria: ['All actions pass', 'Under 30 seconds'],
      maxTimeToFirstSuccessMs: 30000,
    };

    it('should generate markdown documentation', async () => {
      const result = await simulator.simulate(journey);
      const docs = simulator.generateDocs(journey, result);

      expect(docs).toContain('# Documentation Test Journey');
      expect(docs).toContain('## Actions');
      expect(docs).toContain('## Summary');
      expect(docs).toContain('## Success Criteria');
    });

    it('should include action status icons', async () => {
      const result = await simulator.simulate(journey);
      const docs = simulator.generateDocs(journey, result);

      expect(docs).toContain('✅'); // Success icon
    });

    it('should include failure icons for failed actions', async () => {
      const failingJourney: UserJourney = {
        ...journey,
        actions: [{ type: 'cli_command', command: 'fail-this' }],
      };

      const result = await simulator.simulate(failingJourney);
      const docs = simulator.generateDocs(failingJourney, result);

      expect(docs).toContain('❌'); // Failure icon
    });

    it('should include duration in docs', async () => {
      const result = await simulator.simulate(journey);
      const docs = simulator.generateDocs(journey, result);

      expect(docs).toContain('Duration:');
      expect(docs).toContain('ms');
    });

    it('should include expected outcomes when defined', async () => {
      const result = await simulator.simulate(journey);
      const docs = simulator.generateDocs(journey, result);

      expect(docs).toContain('Expected: Health check passes');
    });

    it('should include success criteria', async () => {
      const result = await simulator.simulate(journey);
      const docs = simulator.generateDocs(journey, result);

      expect(docs).toContain('All actions pass');
      expect(docs).toContain('Under 30 seconds');
    });
  });

  describe('createJourneySimulator', () => {
    it('should create simulator via factory function', () => {
      const s = createJourneySimulator();
      expect(s).toBeDefined();
    });

    it('should accept custom executor', () => {
      const executor: IActionExecutor = {
        execute() {
          return Promise.resolve({ index: 0, succeeded: true, durationMs: 1 });
        },
      };
      const s = createJourneySimulator(executor);
      expect(s).toBeDefined();
    });
  });
});

describe('DefaultActionExecutor', () => {
  let executor: DefaultActionExecutor;

  beforeEach(() => {
    executor = new DefaultActionExecutor();
  });

  describe('execute', () => {
    it('should execute cli_command action', async () => {
      const action: JourneyAction = {
        type: 'cli_command',
        command: 'nexus-agents doctor',
      };

      const result = await executor.execute(action);

      expect(result.succeeded).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.output).toContain('cli_command');
    });

    it('should execute mcp_tool action', async () => {
      const action: JourneyAction = {
        type: 'mcp_tool',
        command: 'orchestrate',
        args: { task: 'test' },
      };

      const result = await executor.execute(action);

      expect(result.succeeded).toBe(true);
      expect(result.output).toContain('mcp_tool');
    });

    it('should execute workflow_run action', async () => {
      const action: JourneyAction = {
        type: 'workflow_run',
        command: 'code-review',
        args: { repository: 'owner/repo' },
      };

      const result = await executor.execute(action);

      expect(result.succeeded).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(10); // workflow_run has longer delay
    });

    it('should execute wait action', async () => {
      const action: JourneyAction = {
        type: 'wait',
        command: 'wait',
        args: { duration: 10 },
      };

      const result = await executor.execute(action);

      expect(result.succeeded).toBe(true);
      // Allow 5ms tolerance for timer imprecision
      expect(result.durationMs).toBeGreaterThanOrEqual(5);
    });

    it('should fail when command contains "fail"', async () => {
      const action: JourneyAction = {
        type: 'cli_command',
        command: 'fail-test',
      };

      const result = await executor.execute(action);

      expect(result.succeeded).toBe(false);
      expect(result.error).toContain('Simulated failure');
    });
  });
});

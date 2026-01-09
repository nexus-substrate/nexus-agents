/**
 * nexus-agents/agents - SICA Agent Tests
 *
 * @module agents/self-improving/sica-agent.test
 * (Source: Issue #151)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SicaAgent, createSicaAgent } from './sica-agent.js';
import type { AgentConfiguration } from './sica-types.js';
import type {
  IAgent,
  Task,
  TaskResult,
  AgentMessage,
  AgentResponse,
  AgentContext,
  AgentCapability,
} from '../../core/index.js';
import { ok, err, AgentError } from '../../core/index.js';
import type { Result } from '../../core/index.js';

/** Mock agent for testing */
class MockAgent implements IAgent {
  readonly id = 'mock-agent';
  readonly role = 'worker' as const;
  readonly state = 'idle' as const;
  readonly capabilities: readonly AgentCapability[] = ['task_execution'];

  private shouldFail = false;
  private executionCount = 0;

  setShouldFail(fail: boolean): void {
    this.shouldFail = fail;
  }

  getExecutionCount(): number {
    return this.executionCount;
  }

  execute(task: Task): Promise<Result<TaskResult, AgentError>> {
    this.executionCount++;

    if (this.shouldFail) {
      return Promise.resolve(err(new AgentError('Mock execution failed')));
    }

    return Promise.resolve(
      ok({
        taskId: task.id,
        output: `Completed: ${task.description}`,
        metadata: {
          tokensUsed: 100,
          durationMs: 500,
          toolsUsed: [],
          model: 'mock-model',
        },
      })
    );
  }

  handleMessage(msg: AgentMessage): Promise<Result<AgentResponse, AgentError>> {
    return Promise.resolve(ok({ messageId: msg.id, status: 'accepted' }));
  }

  initialize(_ctx: AgentContext): Promise<Result<void, AgentError>> {
    return Promise.resolve(ok(undefined));
  }

  async cleanup(): Promise<void> {
    // No-op
  }
}

describe('SicaAgent', () => {
  let mockAgent: MockAgent;
  let sicaAgent: SicaAgent;

  const sampleConfig: AgentConfiguration = {
    systemPrompt: 'You are a helpful assistant.',
    temperature: 0.7,
    maxTokens: 2000,
    parameters: {},
  };

  const sampleTask: Task = {
    id: 'test-task-1',
    description: 'Test task',
    context: {},
    priority: 5,
  };

  beforeEach(() => {
    mockAgent = new MockAgent();
    sicaAgent = new SicaAgent({
      initialConfig: sampleConfig,
      baseAgent: mockAgent,
      sicaConfig: {
        minExecutionsForImprovement: 3,
        improvementThreshold: 0.8,
        improvementCooldownMs: 0, // No cooldown for tests
      },
    });
  });

  describe('execute', () => {
    it('should execute task using base agent', async () => {
      const result = await sicaAgent.execute(sampleTask);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.output).toContain('Completed');
        expect(result.value.versionId).toBeDefined();
        expect(result.value.metrics).toBeDefined();
      }
    });

    it('should record metrics after execution', async () => {
      await sicaAgent.execute(sampleTask);

      const version = sicaAgent.getActiveVersion();
      expect(version).not.toBeNull();

      const metrics = sicaAgent.getVersionManager().getMetrics(version!.id);
      expect(metrics?.executionCount).toBe(1);
      expect(metrics?.successCount).toBe(1);
    });

    it('should handle base agent failures', async () => {
      mockAgent.setShouldFail(true);

      const result = await sicaAgent.execute(sampleTask);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Mock execution failed');
      }
    });

    it('should track failed executions in metrics', async () => {
      mockAgent.setShouldFail(true);
      await sicaAgent.execute(sampleTask);

      const version = sicaAgent.getActiveVersion();
      const metrics = sicaAgent.getVersionManager().getMetrics(version!.id);

      expect(metrics?.executionCount).toBe(1);
      expect(metrics?.successCount).toBe(0);
      expect(metrics?.successRate).toBe(0);
    });
  });

  describe('triggerImprovement', () => {
    it('should create new version on improvement', async () => {
      // Execute some tasks first
      for (let i = 0; i < 3; i++) {
        await sicaAgent.execute(sampleTask);
      }

      const result = await sicaAgent.triggerImprovement({ force: true });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.successful).toBe(true);
        expect(result.value.resultVersionId).toBeDefined();
      }
    });

    it('should record improvement in history', async () => {
      await sicaAgent.execute(sampleTask);
      await sicaAgent.triggerImprovement({ force: true });

      const history = sicaAgent.getImprovementHistory();
      expect(history.length).toBe(1);
    });

    it('should generate hypothesis based on metrics', async () => {
      // Create poor performance to trigger specific hypothesis
      mockAgent.setShouldFail(true);
      for (let i = 0; i < 4; i++) {
        await sicaAgent.execute(sampleTask);
      }

      const result = await sicaAgent.triggerImprovement({ force: true });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.hypothesis).toContain('error');
      }
    });

    it('should respect cooldown without force', async () => {
      const cooldownAgent = new SicaAgent({
        initialConfig: sampleConfig,
        baseAgent: mockAgent,
        sicaConfig: {
          improvementCooldownMs: 60000, // 1 minute cooldown
        },
      });

      await cooldownAgent.execute(sampleTask);
      await cooldownAgent.triggerImprovement({ force: true });

      // Second attempt should fail due to cooldown
      const result = await cooldownAgent.triggerImprovement();
      expect(result.ok).toBe(false);
    });
  });

  describe('version management', () => {
    it('should have initial version after creation', () => {
      const version = sicaAgent.getActiveVersion();

      expect(version).not.toBeNull();
      expect(version?.version).toBe('1.0.0');
      expect(version?.status).toBe('active');
    });

    it('should return all versions', () => {
      const versions = sicaAgent.getAllVersions();

      expect(versions.length).toBe(1);
      expect(versions[0]?.version).toBe('1.0.0');
    });

    it('should provide version manager access', () => {
      const manager = sicaAgent.getVersionManager();

      expect(manager).toBeDefined();
      expect(manager.getActiveVersion()).not.toBeNull();
    });
  });

  describe('auto-select best version', () => {
    it('should select best version when enabled', async () => {
      const autoSelectAgent = new SicaAgent({
        initialConfig: sampleConfig,
        baseAgent: mockAgent,
        sicaConfig: {
          autoSelectBest: true,
          minExecutionsForImprovement: 3,
        },
      });

      // Execute several times
      for (let i = 0; i < 5; i++) {
        await autoSelectAgent.execute(sampleTask);
      }

      // Create a new version
      await autoSelectAgent.triggerImprovement({ force: true });

      // Execute more to build metrics for new version
      for (let i = 0; i < 5; i++) {
        await autoSelectAgent.execute(sampleTask);
      }

      // Should have selected based on performance
      const active = autoSelectAgent.getActiveVersion();
      expect(active).not.toBeNull();
    });
  });

  describe('improvement focus areas', () => {
    it('should focus on speed when specified', async () => {
      for (let i = 0; i < 3; i++) {
        await sicaAgent.execute(sampleTask);
      }

      const result = await sicaAgent.triggerImprovement({
        force: true,
        focusArea: 'speed',
      });

      expect(result.ok).toBe(true);
    });

    it('should focus on quality when specified', async () => {
      for (let i = 0; i < 3; i++) {
        await sicaAgent.execute(sampleTask);
      }

      const result = await sicaAgent.triggerImprovement({
        force: true,
        focusArea: 'quality',
      });

      expect(result.ok).toBe(true);
    });

    it('should focus on cost when specified', async () => {
      for (let i = 0; i < 3; i++) {
        await sicaAgent.execute(sampleTask);
      }

      const result = await sicaAgent.triggerImprovement({
        force: true,
        focusArea: 'cost',
      });

      expect(result.ok).toBe(true);
    });
  });

  describe('createSicaAgent factory', () => {
    it('should create agent with default config', () => {
      const agent = createSicaAgent({
        initialConfig: sampleConfig,
        baseAgent: mockAgent,
      });

      expect(agent).toBeInstanceOf(SicaAgent);
      expect(agent.getActiveVersion()).not.toBeNull();
    });

    it('should create agent with custom config', () => {
      const agent = createSicaAgent({
        initialConfig: sampleConfig,
        baseAgent: mockAgent,
        sicaConfig: {
          maxActiveVersions: 10,
          improvementThreshold: 0.9,
        },
      });

      const config = agent.getVersionManager().getConfig();
      expect(config.maxActiveVersions).toBe(10);
      expect(config.improvementThreshold).toBe(0.9);
    });
  });
});

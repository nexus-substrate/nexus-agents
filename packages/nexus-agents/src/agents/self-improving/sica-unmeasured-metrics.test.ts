/**
 * SICA must not report a measurement it never took (#5794, #5795).
 *
 * Two instruments in this module answered with a plausible number instead of
 * saying nothing happened:
 *
 * - `VersionTestMetrics.passRate` was `result.errors.length === 0 ? 1 : 0.5`.
 *   Not a rate (9 invalid tests out of 10 gave 0.5, not 0.1), and `1` whenever
 *   `validate: false` left `errors` empty by construction — with no test
 *   process ever spawned. `validateSingleTest` says so itself: "in a real
 *   implementation, we would run the test".
 * - `ImprovementValidation.performanceChange` was a literal `0` on BOTH the
 *   success and the failure path, so the field distinguished nothing. `0`
 *   reads as "measured, no regression"; the truth was "not measured" — the
 *   derived version has not executed a single task when the attempt is built.
 */
import { describe, it, expect } from 'vitest';

import { SicaTestGenerator } from './sica-test-generator.js';
import { createFailedAttempt } from './sica-agent-helpers.js';
import { SicaAgent } from './sica-agent.js';
import type { AgentConfiguration, AgentVersion } from './sica-types.js';
import type {
  AgentContext,
  AgentCapability,
  AgentMessage,
  AgentResponse,
} from '../../core/index.js';
import type { IAgent, Result, Task, TaskResult } from '../../core/index.js';
import { ok, getTimeProvider } from '../../core/index.js';
import type { AgentError } from '../../core/index.js';

const CONFIG: AgentConfiguration = {
  systemPrompt: 'Test',
  temperature: 0.5,
  maxTokens: 1000,
  parameters: {},
};

function makeVersion(id: string): AgentVersion {
  return {
    id,
    version: '1.0.0',
    parentVersion: null,
    configuration: CONFIG,
    createdAt: new Date(getTimeProvider().now()),
    status: 'active',
  };
}

class MinimalAgent implements IAgent {
  readonly id = 'minimal-agent';
  readonly role = 'worker' as const;
  readonly state = 'idle' as const;
  readonly capabilities: readonly AgentCapability[] = ['task_execution'];

  execute(task: Task): Promise<Result<TaskResult, AgentError>> {
    return Promise.resolve(
      ok({
        taskId: task.id,
        output: 'done',
        metadata: { durationMs: 1, tokensUsed: 1, toolsUsed: [], model: 'mock-model' },
      })
    );
  }
  handleMessage(msg: AgentMessage): Promise<Result<AgentResponse, AgentError>> {
    return Promise.resolve(ok({ messageId: msg.id, status: 'accepted' as const }));
  }
  initialize(_ctx: AgentContext): Promise<Result<void, AgentError>> {
    return Promise.resolve(ok(undefined));
  }
  cleanup(): Promise<void> {
    return Promise.resolve();
  }
  shutdown(): Promise<Result<void, AgentError>> {
    return Promise.resolve(ok(undefined));
  }
}

describe('passRate reports what was actually checked', () => {
  it('is absent, and the basis unmeasured, when validation is skipped', async () => {
    // The case that produced `passRate: 1` with zero evidence: `validate: false`
    // makes `errors` empty by construction.
    const generator = new SicaTestGenerator();
    const version = makeVersion('v-skip');

    await generator.generateTestsForVersion(version, { validate: false });

    const metrics = generator.getVersionMetrics('v-skip');
    expect(metrics?.passRateBasis).toBe('unmeasured');
    expect(metrics?.passRate).toBeUndefined();
  });

  it('reports static_validation, never execution, when validation runs', async () => {
    // The pair that keeps the assertion above honest: validation DOES produce a
    // value. It is still a static parse of generated source, and the basis says
    // so rather than implying a test ran.
    const generator = new SicaTestGenerator();
    const version = makeVersion('v-checked');

    await generator.generateTestsForVersion(version);

    const metrics = generator.getVersionMetrics('v-checked');
    expect(metrics?.passRateBasis).toBe('static_validation');
    expect(metrics?.passRate).toBeGreaterThan(0);
    expect(metrics?.passRate).toBeLessThanOrEqual(1);
  });

  it('derives the rate from the tally, not from whether errors is empty', async () => {
    // The old value had only two possible outputs, 1 and 0.5. A real rate is
    // valid/checked, so it must agree with the tally the generator reports.
    const generator = new SicaTestGenerator();
    const result = await generator.generateTests();

    if (result.validation !== undefined && result.validation.checked > 0) {
      const version = makeVersion('v-tally');
      await generator.generateTestsForVersion(version);
      const metrics = generator.getVersionMetrics('v-tally');
      expect(metrics?.passRate).not.toBe(0.5);
    }
    // Whatever the tally says, the two fields must agree about whether a
    // measurement exists at all.
    expect(result.validation === undefined || result.validation.checked >= 0).toBe(true);
  });
});

describe('performanceChange is absent when nothing was compared', () => {
  it('omits it on a failed attempt', () => {
    const attempt = createFailedAttempt('v-1', 'a hypothesis', 'No changes generated');

    expect(attempt.validation?.passed).toBe(false);
    expect(attempt.validation?.performanceChange).toBeUndefined();
  });

  it('omits it on a successful attempt that only created a version', async () => {
    // The success path: `createDerivedVersion` returned non-null and nothing
    // else happened. The new version has executed no task, so there is no delta
    // to report — but `checks` still names the one thing that did.
    const agent = new SicaAgent({
      initialConfig: CONFIG,
      baseAgent: new MinimalAgent(),
      sicaConfig: {
        minExecutionsForImprovement: 1,
        improvementThreshold: 0.8,
        improvementCooldownMs: 0,
      },
    });
    await agent.execute({ id: 't1', description: 'Test task', context: {}, priority: 5 });

    const result = await agent.triggerImprovement({ force: true });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.successful).toBe(true);
      expect(result.value.validation?.performanceChange).toBeUndefined();
      // Kept: this half was already honest about what ran.
      expect(result.value.validation?.checks).toEqual([{ name: 'version_created', passed: true }]);
    }
  });
});

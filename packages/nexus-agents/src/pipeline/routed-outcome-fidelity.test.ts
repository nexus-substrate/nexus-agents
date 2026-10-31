/**
 * Routed-outcome fidelity across the real seam (#6521 review I1).
 *
 * Runs real plan and decomposition stages through the real expert bridge, with
 * mocked router responses and adapter setup. The outcome store and distiller are real, so
 * this checks the loop measures failures instead of seeing only successes.
 * The decomposition case also rehydrates the actual JSONL-backed outcome store.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { executeTaskMock } = vi.hoisted(() => ({ executeTaskMock: vi.fn() }));
vi.mock('../cli-adapters/factory.js', () => ({
  createAllAdapters: () => new Map([['codex', {}]]),
}));
vi.mock('../cli-adapters/composite-router.js', () => ({
  createCompositeRouter: () => ({ executeTask: executeTaskMock }),
}));
vi.mock('../cli-adapters/cli-circuit-breaker.js', () => ({
  createCliCircuitBreakerIntegration: () => ({
    getHealthStatus: () => ({ systemHealthy: true, healthyCount: 1, clis: [] }),
  }),
}));
vi.mock('../cli-adapters/child-mcp-config.js', () => ({
  generateMcpConfig: () => Promise.resolve({ configPath: '/tmp/mcp.json', cleanup: vi.fn() }),
}));

import { createAgentStages } from './agent-executor.js';
import { OutcomeStore, setOutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import { StrategyDistiller } from '../learning/strategy-distiller.js';
import { LinUCBBandit } from '../cli-adapters/linucb-bandit.js';
import { PersistentOutcomeStore } from '../orchestration/outcomes/outcome-store-persistence.js';

const ARM_FAILURE = {
  ok: false,
  error: { message: 'codex exited with code 1', routedCli: 'codex', routedDurationMs: 40 },
};
const ARM_SUCCESS = {
  ok: true,
  value: { text: 'a plan', routedCli: 'codex', routedDurationMs: 50 },
};

describe('routed outcomes reach the distiller with their failures (#6521 I1)', () => {
  let store: OutcomeStore;

  beforeEach(() => {
    vi.stubEnv('NEXUS_PERSIST_LEARNING', 'false');
    store = new OutcomeStore();
    setOutcomeStore(store);
    executeTaskMock.mockReset();
  });

  afterEach(() => {
    setOutcomeStore(new OutcomeStore());
    vi.unstubAllEnvs();
  });

  it('1 adapter error + 4 successes on one arm distils to 0.8, not 1.0', async () => {
    executeTaskMock
      .mockResolvedValueOnce(ARM_FAILURE)
      .mockResolvedValueOnce(ARM_SUCCESS)
      .mockResolvedValueOnce(ARM_SUCCESS)
      .mockResolvedValueOnce(ARM_SUCCESS)
      .mockResolvedValueOnce(ARM_SUCCESS);
    const stages = createAgentStages();
    await expect(stages.plan('task 0', '')).rejects.toThrow(
      'Planning failed: expert call unsuccessful'
    );
    for (let i = 1; i < 5; i++) await stages.plan(`task ${String(i)}`, '');

    const rows = store.query().filter((o) => o.model === 'pipeline');
    expect(rows).toHaveLength(5);
    expect(rows.every((o) => o.routedBy === 'composite-router' && o.cli === 'codex')).toBe(true);

    const distiller = new StrategyDistiller(store);
    distiller.distill();
    const boost = distiller
      .getRules()
      .find((r) => r.patternType === 'success-rate' && r.cli === 'codex');
    expect(boost?.metric).toBe(0.8);
  });

  it('records an API arm run under the arm id, and warm start credits that arm (#6552)', async () => {
    executeTaskMock
      .mockResolvedValueOnce({
        ok: false,
        error: {
          message: 'api:anthropic returned 500',
          routedCli: 'claude',
          routedArm: 'api:anthropic',
          routedDurationMs: 30,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          text: 'a plan',
          routedCli: 'claude',
          routedArm: 'api:anthropic',
          routedDurationMs: 60,
        },
      });
    const stages = createAgentStages();
    await expect(stages.plan('task 0', '')).rejects.toThrow(
      'Planning failed: expert call unsuccessful'
    );
    await stages.plan('task 1', '');

    const rows = store.query().filter((o) => o.model === 'pipeline');
    expect(rows.map((o) => [o.cli, o.success])).toEqual([
      ['api:anthropic', false],
      ['api:anthropic', true],
    ]);

    const bandit = new LinUCBBandit(['claude', 'api:anthropic']);
    expect(bandit.warmStart(rows)).toBe(2);
    const pulls = new Map(bandit.getStats().map((s) => [s.name, s.pullCount]));
    expect(pulls.get('api:anthropic')).toBe(2);
    expect(pulls.get('claude')).toBe(0);
  });

  it('persists failed decomposition before rejecting and distils failures without duplicate successes', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'decompose-outcome-'));
    const config = { dataDir, filePath: join(dataDir, 'outcomes.jsonl') };
    setOutcomeStore(new PersistentOutcomeStore(config));
    const task = {
      id: 'task-1',
      title: 'Implement',
      description: 'Do the work',
      assignedTo: 'coder',
      writeTargets: { kind: 'workspace-relative', paths: ['src/task.ts'] },
    };
    executeTaskMock.mockResolvedValueOnce(ARM_FAILURE).mockResolvedValue({
      ...ARM_SUCCESS,
      value: { ...ARM_SUCCESS.value, text: JSON.stringify([task]) },
    });
    try {
      const stages = createAgentStages();
      await expect(stages.decompose('approved plan')).rejects.toThrow(
        'Decomposition failed: expert call unsuccessful'
      );
      const failed = new PersistentOutcomeStore(config).query();
      expect(failed).toHaveLength(1);
      expect(failed[0]).toMatchObject({
        cli: 'codex',
        model: 'pipeline',
        category: 'planning',
        routedBy: 'composite-router',
        success: false,
        durationMs: 40,
      });

      for (let i = 0; i < 4; i++) {
        await expect(stages.decompose('approved plan')).resolves.toMatchObject([task]);
      }
      const hydrated = new PersistentOutcomeStore(config);
      expect(hydrated.query().map((row) => row.success)).toEqual([false, true, true, true, true]);
      const distiller = new StrategyDistiller(hydrated);
      distiller.distill();
      const rule = distiller
        .getRules()
        .find((candidate) => candidate.patternType === 'success-rate' && candidate.cli === 'codex');
      expect(rule?.metric).toBe(0.8);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});

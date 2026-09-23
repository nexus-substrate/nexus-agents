/**
 * Routed-outcome fidelity across the real seam (#6521 review I1).
 *
 * Runs the real plan stage through the real expert bridge. Only the
 * CompositeRouter is mocked. The outcome store and the distiller are real, so
 * this checks the loop measures failures instead of seeing only successes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
    for (let i = 0; i < 5; i++) await stages.plan(`task ${String(i)}`, '');

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
    for (let i = 0; i < 2; i++) await stages.plan(`task ${String(i)}`, '');

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
});

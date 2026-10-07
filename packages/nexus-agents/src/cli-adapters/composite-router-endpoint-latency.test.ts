/** Endpoint decisions must not borrow a CLI arm's measured latency (#7151). */
import { describe, expect, it, vi } from 'vitest';
import type { ICliAdapter, RoutingArmId } from './types.js';

vi.mock('../config/learning-persistence.js', () => ({
  isPersistenceEnabled: vi.fn(() => false),
  isStrategyDistillationEnabled: vi.fn(() => false),
  getModelSelectionShadowFile: vi.fn(() => '/dev/null'),
}));

const { CompositeRouter } = await import('./composite-router.js');

function adapter(name: RoutingArmId): ICliAdapter {
  return {
    name,
    transport: 'subprocess',
    capabilities: { reasoning: 8, contextWindow: 200000, codeGeneration: 9, speed: 7, cost: 5 },
    execute: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
    getCapacity: vi.fn().mockResolvedValue({ remainingTokens: 100000 }),
    getModelInfo: vi.fn().mockReturnValue({ id: name, name }),
    initialize: vi.fn(),
    dispose: vi.fn(),
    getVersion: vi.fn(),
  } as unknown as ICliAdapter;
}

describe('mixed CLI and endpoint latency attribution (#7151)', () => {
  it.each(['api:lab', 'claude'] as const)(
    'reports latency only when the selected arm %s has a measured CLI slot',
    async (selected) => {
      const other = selected === 'claude' ? 'api:lab' : 'claude';
      const router = new CompositeRouter(
        new Map<RoutingArmId, ICliAdapter>([
          [selected, adapter(selected)],
          [other, adapter(other)],
        ]),
        {
          enableBudgetFilter: false,
          enableZeroRouter: false,
          enableTopsisRanking: false,
          enableLinUCBSelection: false,
          enableResourceStrategy: false,
          enableRoutingMemory: false,
          enableStrategyDistillation: false,
          enableCapacityBalancing: false,
          enableLatencyTracking: true,
        }
      );
      const tracker = router.getLatencyTracker();
      expect(tracker).toBeDefined();
      if (tracker === undefined) return;
      for (let sample = 0; sample < 5; sample++) tracker.record('claude', 100, true);
      const cliScore = tracker.getScores(['claude'])[0]?.score;
      expect(cliScore).toBeGreaterThan(0);

      // With selection stages disabled, registration order fixes the selected
      // arm while the real latency stage still measures the other candidate.
      const result = await router.route({ content: 'x' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.cliName).toBe(selected);
      expect(result.value.stagesExecuted).toContain('latency-scoring');
      expect(result.value.latencyScore).toBe(selected === 'claude' ? cliScore : undefined);
    }
  );
});

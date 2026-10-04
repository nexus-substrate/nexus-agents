/** Ceiling evidence must reach the real logger at its default level (#5095). */
import { describe, expect, it, vi } from 'vitest';
import { BudgetRouter } from './budget-router.js';
import { getGlobalLogLevel, setGlobalLogLevel } from '../core/logger.js';

describe('task-class ceiling default logging', () => {
  it('emits basis and unmeasured evidence at info level with the real logger', () => {
    const previousLevel = getGlobalLogLevel();
    setGlobalLogLevel('info');
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const router = new BudgetRouter(new Map(), {
      taskClassCostCeilings: { code_generation: 0.2 },
      sessionBudget: { resetIntervalMs: 0 },
    });
    try {
      router.filterByTaskClassCeiling({ content: 'implement a function', maxTokens: 10_000 }, [
        'gemini',
        'codex',
      ]);
      const output = [...stdout.mock.calls, ...stderr.mock.calls]
        .map(([chunk]) => String(chunk))
        .join('');
      expect(output).toContain('Cost ceiling: candidate evaluated');
      expect(output).toContain('"priceBasis":"list"');
      expect(output).toContain('"priceBasis":"unknown"');
      expect(output).toContain('"ceilingMeasurement":"unmeasured"');
    } finally {
      router.dispose();
      setGlobalLogLevel(previousLevel);
      stdout.mockRestore();
      stderr.mockRestore();
    }
  });
});

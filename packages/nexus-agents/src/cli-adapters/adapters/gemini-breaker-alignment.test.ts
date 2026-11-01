/**
 * Regression test for Issue #7716:
 * Keep Gemini voter availability aligned with its execution breaker.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GeminiCliAdapter } from './gemini-adapter.js';
import {
  getDefaultCliCircuitBreakerRegistry,
  getCliCircuitBreakerSnapshot,
} from '../cli-circuit-breaker.js';
import { getAvailableClis } from '../factory.js';
import { CliDetectionCache } from '../cli-detection-cache.js';
import { err } from '../../core/index.js';
import type { CliTask, CliName } from '../types.js';

vi.mock('../../cli/cli-auth-probe.js', () => ({
  probeCli: (cli: CliName) =>
    Promise.resolve({ cli, state: 'authenticated', via: 'cli-credentials' }),
}));

vi.mock('../codex-mcp-server-probe.js', () => ({
  codexMcpServerAvailable: () => true,
}));

describe('GeminiCliAdapter breaker alignment (#7716)', () => {
  const sharedRegistry = getDefaultCliCircuitBreakerRegistry();

  beforeEach(() => {
    sharedRegistry.resetAll();
  });

  afterEach(() => {
    sharedRegistry.resetAll();
    vi.restoreAllMocks();
  });

  it('records execution failures into the shared breaker registry and excludes Gemini from voter availability', async () => {
    const adapter = new GeminiCliAdapter({
      circuitBreakerConfig: { failureThreshold: 2 },
    });

    const task: CliTask = {
      content: 'test task',
    };

    vi.spyOn(adapter as unknown as { executeTask: () => unknown }, 'executeTask').mockResolvedValue(
      err({
        code: 'CLI_EXECUTION_ERROR',
        message: 'Resource exhausted / quota error',
        retryable: false,
      })
    );

    // Initial state: shared breaker is closed, snapshot closed/undefined
    expect(sharedRegistry.isArmOpen('gemini')).toBe(false);
    expect(getCliCircuitBreakerSnapshot('gemini')?.state).not.toBe('open');

    // Populate healthy cache for availability probe
    const cache = new CliDetectionCache();
    for (const cli of ['claude', 'gemini', 'codex', 'opencode'] as const) {
      cache.set(cli, {
        healthy: true,
        version: '1.0.0',
        versionStatus: 'supported',
        checkedAt: new Date(),
      });
    }

    // Both Gemini and others are available initially
    const initiallyAvailable = await getAvailableClis(cache);
    expect(initiallyAvailable).toContain('gemini');

    // First failed execution
    await adapter.execute(task);
    expect(sharedRegistry.isArmOpen('gemini')).toBe(false);

    // Second failed execution trips threshold (2 failures)
    await adapter.execute(task);

    // The shared registry and snapshot MUST now observe the open breaker
    expect(sharedRegistry.isArmOpen('gemini')).toBe(true);
    expect(getCliCircuitBreakerSnapshot('gemini')?.state).toBe('open');

    // The voter availability gate must exclude Gemini when its breaker is open
    const availableAfterOpen = await getAvailableClis(cache);
    expect(availableAfterOpen).not.toContain('gemini');

    // Subsequent execution is refused immediately by the circuit breaker
    const refusal = await adapter.execute(task);
    expect(refusal.ok).toBe(false);
    if (!refusal.ok) {
      expect(refusal.error.message).toContain('Circuit breaker is open');
    }

    // Resetting the adapter also resets the shared breaker
    adapter.resetCircuitBreaker();
    expect(sharedRegistry.isArmOpen('gemini')).toBe(false);
    expect(getCliCircuitBreakerSnapshot('gemini')?.state).toBe('closed');
    const availableAfterReset = await getAvailableClis(cache);
    expect(availableAfterReset).toContain('gemini');
  });
});

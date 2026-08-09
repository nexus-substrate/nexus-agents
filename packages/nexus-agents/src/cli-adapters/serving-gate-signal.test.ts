/**
 * Tests for the voter serving-gate's failure signal (#4330).
 *
 * The gate `isCliServingForVoters` (factory.ts) excludes a CLI only when
 * `getCliCircuitBreakerSnapshot(cli)?.state === 'open'`, reading
 * `defaultCliCircuitBreakerRegistry`. Nothing on the voter path ever wrote to
 * that registry: `BaseCliAdapter.executeWithRetry` passed no `circuitBreaker`
 * into `executeCliRetryLoop`, so its `recordFailure` call was unreachable for
 * every subprocess CLI. A quota-dead CLI's snapshot stayed `undefined` forever
 * and the gate took its fail-open branch on every panel — which is why #4325
 * (2.173.6) changed nothing for the observed 64-panel run.
 *
 * @module cli-adapters/serving-gate-signal.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CliName, CliTransport, CliTask, ModelInfo } from './types.js';
import type { CliResponse, CliError, ResolvedExecutionOptions } from './types.js';
import type { Result } from '../core/index.js';
import { ok, err } from '../core/index.js';
import { BaseCliAdapter } from './base-adapter.js';
import {
  getCliCircuitBreakerSnapshot,
  getDefaultCliCircuitBreakerRegistry,
} from './cli-circuit-breaker.js';

/** A subprocess-style adapter whose task execution is driven by the test. */
class FlakyCliAdapter extends BaseCliAdapter {
  readonly name: CliName;
  readonly transport: CliTransport = 'subprocess';

  private result: Result<CliResponse, CliError> = ok({ text: 'ok' });

  constructor(name: CliName) {
    super();
    this.name = name;
  }

  setResult(result: Result<CliResponse, CliError>): void {
    this.result = result;
  }

  executeTask(
    _task: CliTask,
    _options: ResolvedExecutionOptions
  ): Promise<Result<CliResponse, CliError>> {
    return Promise.resolve(this.result);
  }

  getModelInfo(): ModelInfo {
    return {
      id: 'flaky',
      name: 'Flaky',
      contextWindow: 1000,
      maxOutput: 100,
      costPerMillionInput: 0,
      costPerMillionOutput: 0,
    };
  }

  initialize(): Promise<void> {
    return Promise.resolve();
  }

  isAvailable(): Promise<boolean> {
    return Promise.resolve(true);
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }
}

/** The quota exhaustion actually observed on opencode in the #3849 v6 run. */
function quotaError(): Result<CliResponse, CliError> {
  return err({
    code: 'RATE_LIMITED',
    message: 'Key limit exceeded',
    cli: 'opencode',
    retryable: false,
  });
}

const TASK: CliTask = { content: 'vote on this' };

/** Drive `count` failing executions through the adapter's public entry point. */
async function failNTimes(adapter: FlakyCliAdapter, count: number): Promise<void> {
  adapter.setResult(quotaError());
  for (let i = 0; i < count; i++) {
    await adapter.execute(TASK);
  }
}

describe('voter serving-gate failure signal (#4330)', () => {
  beforeEach(() => {
    getDefaultCliCircuitBreakerRegistry().resetAll();
  });

  it('records a subprocess CLI failure against the shared registry', async () => {
    const adapter = new FlakyCliAdapter('opencode');

    await failNTimes(adapter, 1);

    // Before the fix this was `undefined` — nothing ever fed the registry, so
    // the gate had no signal to read.
    expect(getCliCircuitBreakerSnapshot('opencode')?.failureCount).toBeGreaterThan(0);
  });

  it('opens the circuit once the failure threshold is crossed', async () => {
    const adapter = new FlakyCliAdapter('opencode');

    // Default failureThreshold is 5.
    await failNTimes(adapter, 5);

    expect(getCliCircuitBreakerSnapshot('opencode')?.state).toBe('open');
  });

  it('does not open the circuit for a CLI that keeps succeeding', async () => {
    const adapter = new FlakyCliAdapter('codex');

    for (let i = 0; i < 10; i++) {
      await adapter.execute(TASK);
    }

    expect(getCliCircuitBreakerSnapshot('codex')?.state).not.toBe('open');
  });

  it('clears the failure count on a success, so intermittent errors never trip it', async () => {
    // Without a `recordSuccess` on the happy path the count would accumulate
    // monotonically and evict a healthy CLI after enough scattered blips.
    const adapter = new FlakyCliAdapter('gemini');

    for (let i = 0; i < 12; i++) {
      await failNTimes(adapter, 4);
      adapter.setResult(ok({ text: 'recovered' }));
      await adapter.execute(TASK);
    }

    expect(getCliCircuitBreakerSnapshot('gemini')?.state).not.toBe('open');
  });

  it('keeps each CLI’s failures on its own breaker', async () => {
    const dead = new FlakyCliAdapter('opencode');

    await failNTimes(dead, 5);

    expect(getCliCircuitBreakerSnapshot('opencode')?.state).toBe('open');
    expect(getCliCircuitBreakerSnapshot('claude')?.state).not.toBe('open');
  });

  it('re-admits the CLI once the reset timeout elapses', async () => {
    // Quota resets. A voter panel must be able to get the CLI back — otherwise
    // a long eval loses a voter permanently after one bad hour, since breaker
    // state is in-memory and there is no probe to re-test it.
    const adapter = new FlakyCliAdapter('opencode');
    await failNTimes(adapter, 5);
    expect(getCliCircuitBreakerSnapshot('opencode')?.state).toBe('open');

    vi.useFakeTimers();
    try {
      // Default resetTimeoutMs is 30s.
      vi.advanceTimersByTime(31_000);
      expect(getCliCircuitBreakerSnapshot('opencode')?.state).toBe('half-open');
    } finally {
      vi.useRealTimers();
    }
  });

  it('excludes an open CLI from voter availability, and only that one', async () => {
    // The gate itself: `isCliServingForVoters` reads these snapshots. Asserted
    // through the same predicate `getAvailableClis` applies, without shelling
    // out to real CLI detection.
    const dead = new FlakyCliAdapter('opencode');
    await failNTimes(dead, 5);

    const serving = (['claude', 'gemini', 'codex', 'opencode'] as CliName[]).filter(
      (cli) => getCliCircuitBreakerSnapshot(cli)?.state !== 'open'
    );

    expect(serving).not.toContain('opencode');
    expect(serving).toEqual(expect.arrayContaining(['claude', 'gemini', 'codex']));
  });
});

/** Controlled actual selector interleavings; no timers, real probes or providers. */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { err, type Result } from '../core/index.js';
import { CliCircuitBreakerIntegration } from './cli-circuit-breaker.js';
import { gatewayServedSlotOf } from './gateway-slot-arm.js';
import { _resetGatewaySlotCatalog } from '../adapters/gateway-family-slots.js';
import { isCliBinaryOnPath } from './cli-binary-on-path.js';
import { consumeCliOutcomeOwner } from './cli-outcome-ownership.js';
import type { CliError, CliResponse, CliName } from './types.js';
import {
  OfflineBase,
  failure,
  task,
  shared,
  cliBreaker,
  makeSlot,
  slotBreaker,
  deferred,
} from './gateway-slot-outcome-test-helpers.js';

vi.mock('./cli-binary-on-path.js', () => ({ isCliBinaryOnPath: vi.fn(() => true) }));
beforeEach(() => {
  shared.resetAll();
  _resetGatewaySlotCatalog();
  vi.mocked(isCliBinaryOnPath).mockReturnValue(true);
});
afterEach(() => {
  shared.resetAll();
  _resetGatewaySlotCatalog();
  vi.restoreAllMocks();
});

describe('GatewaySlotArm execution-local outcomes (#7593)', () => {
  it.each(['before-api', 'after-api'] as const)(
    'accounts a late CLI result %s selection without re-probing it',
    async (order) => {
      const first = deferred<Result<CliResponse, CliError>>();
      const second = deferred<Result<CliResponse, CliError>>();
      const started = deferred<undefined>();
      const child = new OfflineBase();
      await child.initialize();
      child.run
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => {
          started.resolve(undefined);
          return second.promise;
        });
      const available = vi.fn((_cli: CliName, _fresh: boolean) => Promise.resolve(true));
      const { arm, gateway } = makeSlot(child, available);
      const integration = new CliCircuitBreakerIntegration([arm]);
      const oldFirst = integration.execute(arm, { content: 'TEST_FAKE first CLI' });
      const oldSecond = integration.execute(arm, { content: 'TEST_FAKE second CLI' });
      await started.promise;
      expect(available).toHaveBeenCalledTimes(1);
      // NOT_FOUND resets selection AND counts health; auth failures intentionally do not count by default.
      const resetError: CliError = { ...failure, code: 'NOT_FOUND' };
      first.resolve(err(resetError));
      expect(await oldFirst).toEqual(err(resetError));
      expect(gatewayServedSlotOf(arm)).toBeUndefined();
      expect(gateway.complete).not.toHaveBeenCalled();
      expect(cliBreaker.getSnapshot().failureCount).toBe(1);
      available.mockResolvedValue(false);
      if (order === 'before-api') {
        second.resolve(err(failure));
        expect(await oldSecond).toEqual(err(failure));
        expect(available).toHaveBeenCalledTimes(1);
        expect(cliBreaker.getSnapshot().failureCount).toBe(2);
      }
      expect((await integration.execute(arm, { content: 'TEST_FAKE new API selection' })).ok).toBe(
        false
      );
      expect(gatewayServedSlotOf(arm)).toBeDefined();
      if (order === 'after-api') {
        second.resolve(err(failure));
        expect(await oldSecond).toEqual(err(failure));
      }
      expect(child.run).toHaveBeenCalledTimes(2);
      expect(cliBreaker.getSnapshot().failureCount).toBe(2);
      expect(gateway.complete).toHaveBeenCalledTimes(1);
      expect(slotBreaker().getSnapshot().failureCount).toBe(1);
      expect(available).toHaveBeenCalledTimes(2);
      expect(available.mock.calls[1]?.[1]).toBe(true);
    }
  );

  it('moves concurrent source receipts independently despite a reused provider result and reverse completion', async () => {
    const first = deferred<Result<CliResponse, CliError>>();
    const second = deferred<Result<CliResponse, CliError>>();
    const started = deferred<undefined>();
    const child = new OfflineBase();
    await child.initialize();
    child.run
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => {
        started.resolve(undefined);
        return second.promise;
      });
    const execute = vi.spyOn(child, 'execute');
    const { arm } = makeSlot(child);
    const reused = err(failure);
    const pendingFirst = arm.execute(task);
    const pendingSecond = arm.execute(task);
    await started.promise;
    second.resolve(reused);
    const wrappedSecond = await pendingSecond;
    first.resolve(reused);
    const wrappedFirst = await pendingFirst;
    const firstExecution = execute.mock.results[0];
    const secondExecution = execute.mock.results[1];
    if (firstExecution?.type !== 'return' || secondExecution?.type !== 'return') {
      throw new Error('TEST_FAKE child executions did not return');
    }
    const sourceFirst = await firstExecution.value;
    const sourceSecond = await secondExecution.value;
    expect(sourceFirst).not.toBe(sourceSecond);
    expect(wrappedFirst).not.toBe(wrappedSecond);
    expect(wrappedFirst).not.toBe(sourceFirst);
    expect(wrappedSecond).not.toBe(sourceSecond);
    expect(wrappedFirst).toEqual(reused);
    expect(wrappedSecond).toEqual(reused);
    expect(consumeCliOutcomeOwner(sourceFirst, child, cliBreaker)).toBe(false);
    expect(consumeCliOutcomeOwner(sourceSecond, child, cliBreaker)).toBe(false);
    expect(consumeCliOutcomeOwner(wrappedFirst, arm, cliBreaker)).toBe(true);
    expect(consumeCliOutcomeOwner(wrappedSecond, arm, cliBreaker)).toBe(true);
    expect(cliBreaker.getSnapshot().failureCount).toBe(2);
  });

  it('counts two concurrent integrated calls once each with one reused provider container', async () => {
    const child = new OfflineBase();
    await child.initialize();
    const reused = err(failure);
    child.run.mockResolvedValue(reused);
    const { arm } = makeSlot(child);
    const integration = new CliCircuitBreakerIntegration([arm]);
    const results = await Promise.all([
      integration.execute(arm, task),
      integration.execute(arm, task),
    ]);
    expect(results.map((result) => result.ok)).toEqual([false, false]);
    expect(child.run).toHaveBeenCalledTimes(2);
    expect(cliBreaker.getSnapshot().failureCount).toBe(2);
  });
});

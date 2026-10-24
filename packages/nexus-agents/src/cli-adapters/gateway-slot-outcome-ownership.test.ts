/** Actual public-factory outcome accounting; only provider/configuration boundaries are fake. */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { err, ok, ModelError } from '../core/index.js';
import { CliCircuitBreakerIntegration } from './cli-circuit-breaker.js';
import { cliBinaryAdapterOf, gatewayServedSlotOf } from './gateway-slot-arm.js';
import { _resetGatewaySlotCatalog } from '../adapters/gateway-family-slots.js';
import { isCliBinaryOnPath } from './cli-binary-on-path.js';
import { consumeCliOutcomeOwner, withCliOutcomeOwner } from './cli-outcome-ownership.js';
import { CliCircuitBreaker } from './circuit-breaker.js';
import { createModelToCliAdapter } from './model-to-cli-adapter.js';
import { fakeGatewayModel } from '../testing/adapters/fake-gateway-model.js';
import {
  createCallerAbortCliError,
  createCallerInputCliError,
  createNativePreSpawnRefusal,
} from './cli-error-helpers.js';
import {
  OfflineBase,
  failure,
  task,
  shared,
  cliBreaker,
  makeSlot,
  slotBreaker,
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
  vi.useRealTimers();
});

describe('actual GatewaySlotArm CLI outcome ownership (#7593)', () => {
  it('direct Base control records one shared failure', async () => {
    const child = new OfflineBase();
    expect(await child.execute(task)).toEqual(err(failure));
    expect(child.run).toHaveBeenCalledTimes(1);
    expect(cliBreaker.getSnapshot().failureCount).toBe(1);
  });

  it('direct Base with default integration records one shared failure', async () => {
    const child = new OfflineBase();
    expect(await new CliCircuitBreakerIntegration([child]).execute(child, task)).toEqual(
      err(failure)
    );
    expect(child.run).toHaveBeenCalledTimes(1);
    expect(cliBreaker.getSnapshot().failureCount).toBe(1);
  });

  it('actual wrapper/default records one shared failure for one Base execution', async () => {
    const child = new OfflineBase();
    const { arm, gateway } = makeSlot(child);
    expect(cliBinaryAdapterOf(arm)).toBe(child);
    expect(await new CliCircuitBreakerIntegration([arm]).execute(arm, task)).toEqual(err(failure));
    expect(gatewayServedSlotOf(arm)).toBeUndefined();
    expect(child.run).toHaveBeenCalledTimes(1);
    expect(gateway.complete).not.toHaveBeenCalled();
    expect(cliBreaker.getSnapshot().failureCount).toBe(1);
  });

  it('explicit private {} preserves one write per separate domain', async () => {
    const child = new OfflineBase();
    const { arm, gateway } = makeSlot(child);
    const integration = new CliCircuitBreakerIntegration([arm], {});
    await integration.execute(arm, task);
    expect(child.run).toHaveBeenCalledTimes(1);
    expect(gateway.complete).not.toHaveBeenCalled();
    expect(cliBreaker.getSnapshot().failureCount).toBe(1);
    expect(integration.getCircuitSnapshots().get('claude')?.failureCount).toBe(1);
  });

  it('moves child evidence onto a fresh wrapper container preserving its payload and model', async () => {
    const child = new OfflineBase();
    child.run.mockResolvedValue(ok({ text: 'TEST_FAKE success', model: 'TEST_FAKE-model' }));
    const execute = vi.spyOn(child, 'execute');
    const { arm } = makeSlot(child);
    const forwarded = await arm.execute(task);
    const execution = execute.mock.results[0];
    if (execution?.type !== 'return') throw new Error('TEST_FAKE child execution did not return');
    const source = await execution.value;
    expect(forwarded).not.toBe(source);
    expect(forwarded).toEqual(source);
    expect(consumeCliOutcomeOwner(source, child, cliBreaker)).toBe(false);
    expect(consumeCliOutcomeOwner(forwarded, arm, cliBreaker)).toBe(true);
    expect(consumeCliOutcomeOwner(forwarded, arm, cliBreaker)).toBe(false);
  });

  it('keeps integration recording for a non-Base model bridge child without a receipt', async () => {
    const model = fakeGatewayModel('claude-sonnet-4-6');
    vi.mocked(model.complete).mockResolvedValue(
      err(new ModelError('TEST_FAKE child model failed'))
    );
    const child = createModelToCliAdapter(model, { name: 'claude' });
    const { arm, gateway } = makeSlot(child);
    await new CliCircuitBreakerIntegration([arm]).execute(arm, task);
    expect(model.complete).toHaveBeenCalledTimes(1);
    expect(gateway.complete).not.toHaveBeenCalled();
    expect(cliBreaker.getSnapshot().failureCount).toBe(1);
  });

  it('does not suppress on a same-named but different actual breaker', async () => {
    const child = new OfflineBase();
    const privateBreaker = new CliCircuitBreaker('claude');
    child.execute = () => {
      privateBreaker.recordFailure('unknown');
      return Promise.resolve(withCliOutcomeOwner(err(failure), child, privateBreaker));
    };
    const { arm } = makeSlot(child);
    await new CliCircuitBreakerIntegration([arm]).execute(arm, task);
    expect(privateBreaker.getSnapshot().failureCount).toBe(1);
    expect(cliBreaker.getSnapshot().failureCount).toBe(1);
  });

  it('does not acquire ownership of a foreign Base result', async () => {
    const foreign = new OfflineBase();
    const foreignResult = await foreign.execute(task);
    const child = new OfflineBase();
    child.execute = () => Promise.resolve(foreignResult);
    const { arm } = makeSlot(child);
    await new CliCircuitBreakerIntegration([arm]).execute(arm, task);
    expect(child.run).not.toHaveBeenCalled();
    expect(foreign.run).toHaveBeenCalledTimes(1);
    expect(cliBreaker.getSnapshot().failureCount).toBe(2);
  });

  it('passes a missing or foreign receipt result through unchanged', async () => {
    const foreign = new OfflineBase();
    const result = await foreign.execute(task);
    const child = new OfflineBase();
    child.execute = () => Promise.resolve(result);
    const { arm } = makeSlot(child);
    expect(await arm.execute(task)).toBe(result);
    expect(consumeCliOutcomeOwner(result, foreign, cliBreaker)).toBe(true);
  });

  it('does not mint fresh evidence when a child replays a moved result', async () => {
    const child = new OfflineBase();
    const execute = vi.spyOn(child, 'execute');
    const { arm } = makeSlot(child);
    const integration = new CliCircuitBreakerIntegration([arm]);
    await integration.execute(arm, task);
    const execution = execute.mock.results[0];
    if (execution?.type !== 'return') throw new Error('TEST_FAKE child execution did not return');
    const source = await execution.value;
    execute.mockRestore();
    child.execute = () => Promise.resolve(source);
    await integration.execute(arm, task);
    expect(child.run).toHaveBeenCalledTimes(1);
    expect(cliBreaker.getSnapshot().failureCount).toBe(2);
  });

  it('records retry exhaustion per attempt without a terminal third write', async () => {
    vi.useFakeTimers();
    const child = new OfflineBase();
    child.retry = true;
    child.run.mockResolvedValue(err({ ...failure, code: 'TIMEOUT', retryable: true }));
    const { arm } = makeSlot(child);
    const pending = new CliCircuitBreakerIntegration([arm]).execute(arm, task);
    await vi.runAllTimersAsync();
    expect((await pending).ok).toBe(false);
    expect(child.run).toHaveBeenCalledTimes(2);
    expect(cliBreaker.getSnapshot().failureCount).toBe(2);
  });

  it('preserves success reset after a retry succeeds', async () => {
    vi.useFakeTimers();
    const child = new OfflineBase();
    child.retry = true;
    child.run
      .mockResolvedValueOnce(err({ ...failure, code: 'TIMEOUT', retryable: true }))
      .mockResolvedValueOnce(ok({ text: 'TEST_FAKE recovered' }));
    const { arm } = makeSlot(child);
    const pending = new CliCircuitBreakerIntegration([arm]).execute(arm, task);
    await vi.runAllTimersAsync();
    expect((await pending).ok).toBe(true);
    expect(child.run).toHaveBeenCalledTimes(2);
    expect(cliBreaker.getSnapshot().failureCount).toBe(0);
  });

  it('counts half-open success once and preserves the response model', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < cliBreaker.getSnapshot().config.failureThreshold; i++)
      cliBreaker.recordFailure('unknown');
    vi.advanceTimersByTime(cliBreaker.getSnapshot().config.resetTimeoutMs + 1);
    const child = new OfflineBase();
    child.run.mockResolvedValue(ok({ text: 'TEST_FAKE healthy', model: 'TEST_FAKE-model' }));
    const { arm } = makeSlot(child);
    const result = await new CliCircuitBreakerIntegration([arm]).execute(arm, task);
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value.response).toMatchObject({
        text: 'TEST_FAKE healthy',
        model: 'TEST_FAKE-model',
      });
    expect(child.run).toHaveBeenCalledTimes(1);
    expect(cliBreaker.getSnapshot().state).toBe('half-open');
    expect(cliBreaker.getSnapshot().successCount).toBe(1);
  });

  it.each([
    createCallerInputCliError('TEST_FAKE invalid input', 'claude'),
    createCallerAbortCliError('cancelled', 'TEST_FAKE cancellation', 'claude'),
    createNativePreSpawnRefusal('permit-consumed', 'claude'),
  ])('releases half-open admission for exempt $message', async (error) => {
    vi.useFakeTimers();
    for (let i = 0; i < cliBreaker.getSnapshot().config.failureThreshold; i++)
      cliBreaker.recordFailure('unknown');
    vi.advanceTimersByTime(cliBreaker.getSnapshot().config.resetTimeoutMs + 1);
    expect(cliBreaker.getState()).toBe('half-open');
    const before = cliBreaker.getSnapshot();
    const child = new OfflineBase();
    child.run.mockResolvedValue(err(error));
    const { arm, gateway } = makeSlot(child);
    expect((await new CliCircuitBreakerIntegration([arm]).execute(arm, task)).ok).toBe(false);
    expect(cliBreaker.getSnapshot().failureCount).toBe(before.failureCount);
    expect(cliBreaker.getSnapshot().halfOpenRequests).toBe(0);
    expect(child.run).toHaveBeenCalledTimes(1);
    expect(gateway.complete).not.toHaveBeenCalled();
  });

  it.each(['initialize', 'executeTask'] as const)(
    'counts unexpected child %s throw once',
    async (method) => {
      const child = new OfflineBase();
      child[method] = () => {
        throw new Error('TEST_FAKE unexpected child throw');
      };
      const { arm } = makeSlot(child);
      await new CliCircuitBreakerIntegration([arm]).execute(arm, task);
      expect(cliBreaker.getSnapshot().failureCount).toBe(1);
    }
  );

  it.each([true, false])('keeps API accounting when binary presence is %s', async (hasBinary) => {
    vi.mocked(isCliBinaryOnPath).mockReturnValue(hasBinary);
    const child = new OfflineBase();
    const available = vi.fn(() => Promise.resolve(false));
    const { arm, gateway, createChild } = makeSlot(child, available);
    await new CliCircuitBreakerIntegration([arm]).execute(arm, task);
    expect(child.run).not.toHaveBeenCalled();
    expect(gateway.complete).toHaveBeenCalledTimes(1);
    expect(createChild).toHaveBeenCalledTimes(hasBinary ? 1 : 0);
    expect(available).toHaveBeenCalledTimes(hasBinary ? 1 : 0);
    expect(cliBreaker.getSnapshot().failureCount).toBe(0);
    expect(slotBreaker().getSnapshot().failureCount).toBe(1);
  });

  it('does not charge the provisional CLI breaker when availability rejects', async () => {
    const child = new OfflineBase();
    const { arm, gateway } = makeSlot(child, () =>
      Promise.reject(new Error('TEST_FAKE rejected probe'))
    );
    expect((await new CliCircuitBreakerIntegration([arm]).execute(arm, task)).ok).toBe(false);
    expect(child.run).not.toHaveBeenCalled();
    expect(gateway.complete).not.toHaveBeenCalled();
    expect(cliBreaker.getSnapshot().failureCount).toBe(0);
  });
});

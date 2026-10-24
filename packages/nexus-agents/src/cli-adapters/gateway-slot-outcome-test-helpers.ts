/** Offline actual-factory fixtures for outcome ownership; no process or provider execution. */
import { vi, type Mock } from 'vitest';
import type { CliCircuitBreaker } from './circuit-breaker.js';
import { err, ModelError, type Result } from '../core/index.js';
import { BaseCliAdapter } from './base-adapter.js';
import { buildGatewaySlotRouterArm } from './gateway-slot-arm.js';
import { getDefaultCliCircuitBreakerRegistry } from './cli-circuit-breaker.js';
import { setGatewaySlotCatalog } from '../adapters/gateway-family-slots.js';
import { fakeGatewayModel } from '../testing/adapters/fake-gateway-model.js';
import { breakerKeys } from './breaker-key.js';
import { getCliModelName, getDefaultModelForCli } from '../config/model-config-helpers.js';
import type { CliError, CliResponse, ModelInfo, ICliAdapter, CliName } from './types.js';

export const failure: CliError = {
  code: 'EXECUTION_ERROR',
  message: 'TEST_FAKE offline task failure',
  cli: 'claude',
  retryable: false,
};
export const task = { content: 'TEST_FAKE offline wrapper execution' };
export const endpoint = 'api:test-fake-gateway';
export const shared = getDefaultCliCircuitBreakerRegistry();
export const cliBreaker = shared.getArmBreaker('claude');

export class OfflineBase extends BaseCliAdapter {
  readonly name = 'claude';
  readonly transport = 'subprocess';
  retry = false;
  readonly run = vi.fn<() => Promise<Result<CliResponse, CliError>>>(() =>
    Promise.resolve(err(failure))
  );

  protected override shouldOuterRetry(): boolean {
    return this.retry;
  }
  executeTask(): Promise<Result<CliResponse, CliError>> {
    return this.run();
  }
  getModelInfo(): ModelInfo {
    return { id: 'offline-model', name: 'Offline model', contextWindow: 1_000 };
  }
  initialize(): Promise<void> {
    this.initialized = true;
    return Promise.resolve();
  }
  dispose(): Promise<void> {
    return Promise.resolve();
  }
}

export function makeSlot(
  child: ICliAdapter,
  available: (cli: CliName, fresh: boolean) => Promise<boolean> = () => Promise.resolve(true)
): {
  arm: ICliAdapter;
  gateway: ReturnType<typeof fakeGatewayModel>;
  createChild: Mock<() => ICliAdapter>;
} {
  const gateway = fakeGatewayModel(getCliModelName(getDefaultModelForCli('claude')), endpoint);
  vi.spyOn(gateway, 'complete').mockResolvedValue(err(new ModelError('TEST_FAKE gateway failure')));
  setGatewaySlotCatalog([gateway]);
  const createChild = vi.fn(() => child);
  const arm = buildGatewaySlotRouterArm('claude', createChild, available);
  if (arm === undefined || arm === 'unavailable') throw new Error('TEST_FAKE actual slot missing');
  return { arm, gateway, createChild };
}

export function slotBreaker(): CliCircuitBreaker {
  return shared.getArmBreaker(breakerKeys.forArm({ name: 'claude', gatewayArm: endpoint }));
}

export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

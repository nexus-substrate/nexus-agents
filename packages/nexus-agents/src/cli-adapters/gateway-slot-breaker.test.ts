/** Gateway breaker outcomes stay isolated by endpoint and display slot (#7070). */
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { err, ErrorCode, ModelError } from '../core/index.js';
import { AbortError } from '../adapters/abort-utils.js';
import {
  _resetGatewaySlotCatalog,
  setGatewaySlotCatalog,
} from '../adapters/gateway-family-slots.js';
import { fakeGatewayModel } from '../testing/adapters/fake-gateway-model.js';
import { mkdtempOutsideRepo } from '../testing/non-repo-temp-dir.js';
import {
  CliCircuitBreakerIntegration,
  getDefaultCliCircuitBreakerRegistry,
} from './cli-circuit-breaker.js';
import { CircuitError, CircuitErrorCode } from './circuit-breaker.js';
import { breakerKeys } from './breaker-key.js';
import { buildGatewaySlotRouterArm } from './gateway-slot-arm.js';
import { createModelToCliAdapter } from './model-to-cli-adapter.js';
import type { CliName, ICliAdapter } from './types.js';

function gatewayArm(cli: CliName): ICliAdapter {
  const arm = buildGatewaySlotRouterArm(
    cli,
    () => {
      throw new Error('empty PATH must select the gateway without constructing a CLI');
    },
    () => Promise.resolve(false)
  );
  if (arm === undefined || arm === 'unavailable') throw new Error('missing gateway slot');
  return arm;
}

describe('gateway slot circuit-breaker outcomes', () => {
  const registry = getDefaultCliCircuitBreakerRegistry();
  let emptyPath: string;

  beforeEach(() => {
    emptyPath = mkdtempOutsideRepo('nexus-gateway-breaker-');
    vi.stubEnv('PATH', emptyPath);
    vi.stubEnv('NEXUS_DISABLED_CLIS', '');
    _resetGatewaySlotCatalog();
    registry.resetAll();
  });

  afterEach(() => {
    registry.resetAll();
    _resetGatewaySlotCatalog();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    rmSync(emptyPath, { recursive: true, force: true });
  });

  it('keeps a rejected gateway target probe in the integration error envelope (#7070)', async () => {
    writeFileSync(join(emptyPath, 'claude'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const model = fakeGatewayModel('claude-sonnet-4-6', 'api:gw-prod');
    setGatewaySlotCatalog([model]);
    const arm = buildGatewaySlotRouterArm(
      'claude',
      () => createModelToCliAdapter(fakeGatewayModel('claude-sonnet-4-6'), { name: 'claude' }),
      () => Promise.reject(new Error('availability probe failed'))
    );
    if (arm === undefined || arm === 'unavailable') throw new Error('missing gateway slot');
    const integration = new CliCircuitBreakerIntegration([arm]);
    await expect(integration.execute(arm, { content: 'test failed probe' })).resolves.toMatchObject(
      {
        ok: false,
        error: expect.any(CircuitError),
      }
    );
    expect(model.complete).not.toHaveBeenCalled();
    expect(registry.getBreaker('claude').getSnapshot().failureCount).toBe(0);
    expect(registry.getBreaker('claude').getState()).toBe('closed');
    await arm.dispose();
  });

  it('attributes a thrown gateway execution to the guarded arm (#6291 B2)', async () => {
    setGatewaySlotCatalog([fakeGatewayModel('claude-sonnet-4-6', 'api:gw-prod')]);
    const arm = gatewayArm('claude');
    const cause = new Error('unexpected gateway execution failure');
    vi.spyOn(arm, 'execute').mockRejectedValue(cause);
    const integration = new CliCircuitBreakerIntegration([arm], { enableFallback: false });
    const key = breakerKeys.forArm({ name: 'claude', gatewayArm: 'api:gw-prod' });

    const result = await integration.execute(arm, { content: 'test thrown gateway call' });

    expect(result).toMatchObject({
      ok: false,
      error: {
        circuitErrorCode: CircuitErrorCode.EXECUTION_FAILED,
        cliName: key,
        armId: key,
        circuitState: 'closed',
        cause,
      },
    });
    if (!result.ok) expect(result.error).toBeInstanceOf(CircuitError);
    expect(integration.getCircuitSnapshots().get('claude')?.failureCount).toBe(1);
    await arm.dispose();
  });

  it('trips the endpoint-and-slot breaker after gateway failures', async () => {
    const model = fakeGatewayModel('claude-sonnet-4-6', 'api:gw-prod');
    vi.mocked(model.complete).mockResolvedValue(err(new ModelError('gateway connection refused')));
    setGatewaySlotCatalog([model]);
    const arm = gatewayArm('claude');
    const breaker = registry.getArmBreaker(
      breakerKeys.forArm({ name: 'claude', gatewayArm: 'api:gw-prod' })
    );
    const threshold = breaker.getSnapshot().config.failureThreshold;

    for (let index = 0; index < threshold; index++) {
      expect((await arm.execute({ content: 'test gateway failure' })).ok).toBe(false);
    }

    expect(breaker.getSnapshot().failureCount).toBe(threshold);
    expect(breaker.getState()).toBe('open');
    expect(registry.getBreaker('claude').getState()).toBe('closed');
    await arm.dispose();
  });

  it('integration reads and enforces the gateway endpoint-and-slot breaker', async () => {
    const model = fakeGatewayModel('claude-sonnet-4-6', 'api:gw-prod');
    vi.mocked(model.complete).mockResolvedValue(err(new ModelError('gateway connection refused')));
    setGatewaySlotCatalog([model]);
    const arm = gatewayArm('claude');
    const integration = new CliCircuitBreakerIntegration([arm]);
    const breaker = registry.getArmBreaker(
      breakerKeys.forArm({ name: 'claude', gatewayArm: 'api:gw-prod' })
    );
    const threshold = breaker.getSnapshot().config.failureThreshold;

    for (let index = 0; index < threshold; index++) {
      await arm.execute({ content: 'test direct gateway failure' });
    }

    expect(breaker.getState()).toBe('open');
    expect
      .soft(integration.getHealthStatus().clis)
      .toContainEqual(
        expect.objectContaining({ name: 'claude', healthy: false, circuitState: 'open' })
      );
    expect.soft(integration.getCircuitSnapshots().get('claude')?.state).toBe('open');
    const result = await integration.execute(arm, { content: 'test refused gateway call' });
    expect.soft(result.ok).toBe(false);
    if (!result.ok) expect.soft(result.error).toBeInstanceOf(CircuitError);
    expect(model.complete).toHaveBeenCalledTimes(threshold);
    await arm.dispose();
  });

  it('#7070 ownership records one failure for one integration gateway call', async () => {
    const model = fakeGatewayModel('claude-sonnet-4-6', 'api:gw-prod');
    vi.mocked(model.complete).mockResolvedValue(err(new ModelError('gateway connection refused')));
    setGatewaySlotCatalog([model]);
    const arm = gatewayArm('claude');
    const integration = new CliCircuitBreakerIntegration([arm]);
    const breaker = registry.getArmBreaker(
      breakerKeys.forArm({ name: 'claude', gatewayArm: 'api:gw-prod' })
    );

    const result = await integration.execute(arm, { content: 'test one protected failure' });

    expect(result.ok).toBe(false);
    expect(model.complete).toHaveBeenCalledTimes(1);
    expect(breaker.getSnapshot().failureCount).toBe(1);
    await arm.dispose();
  });

  it('#7070 reset closes the gateway breaker behind the Claude slot', async () => {
    const model = fakeGatewayModel('claude-sonnet-4-6', 'api:gw-prod');
    vi.mocked(model.complete).mockResolvedValue(err(new ModelError('gateway connection refused')));
    setGatewaySlotCatalog([model]);
    const arm = gatewayArm('claude');
    const integration = new CliCircuitBreakerIntegration([arm]);
    const breaker = registry.getArmBreaker(
      breakerKeys.forArm({ name: 'claude', gatewayArm: 'api:gw-prod' })
    );

    for (let index = 0; index < breaker.getSnapshot().config.failureThreshold; index++) {
      await arm.execute({ content: 'test direct gateway failure' });
    }
    expect(breaker.getState()).toBe('open');

    integration.resetCircuit('claude');

    expect.soft(breaker.getState()).toBe('closed');
    expect.soft(breaker.getSnapshot().failureCount).toBe(0);
    expect(integration.getHealthStatus().clis).toContainEqual(
      expect.objectContaining({ name: 'claude', healthy: true, circuitState: 'closed' })
    );
    await arm.dispose();
  });

  it('keeps a healthy Codex slot closed when the same gateway fails for Claude', async () => {
    const claude = fakeGatewayModel('claude-sonnet-4-6', 'api:gw-prod');
    const codex = fakeGatewayModel('gpt-5.5', 'api:gw-prod');
    vi.mocked(claude.complete).mockResolvedValue(err(new ModelError('gateway connection refused')));
    setGatewaySlotCatalog([claude, codex]);
    const claudeArm = gatewayArm('claude');
    const codexArm = gatewayArm('codex');
    const failed = registry.getArmBreaker(
      breakerKeys.forArm({ name: 'claude', gatewayArm: 'api:gw-prod' })
    );
    const healthy = registry.getArmBreaker(
      breakerKeys.forArm({ name: 'codex', gatewayArm: 'api:gw-prod' })
    );

    for (let index = 0; index < failed.getSnapshot().config.failureThreshold; index++) {
      await claudeArm.execute({ content: 'test Claude gateway failure' });
    }

    expect(failed.getState()).toBe('open');
    expect((await codexArm.execute({ content: 'test healthy Codex gateway' })).ok).toBe(true);
    expect(healthy.getState()).toBe('closed');
    expect(healthy.getSnapshot().failureCount).toBe(0);
    await Promise.all([claudeArm.dispose(), codexArm.dispose()]);
  });

  it('keeps the same slot on a different gateway endpoint closed', async () => {
    const failing = fakeGatewayModel('claude-sonnet-4-6', 'api:gw-prod');
    vi.mocked(failing.complete).mockResolvedValue(
      err(new ModelError('gateway connection refused'))
    );
    setGatewaySlotCatalog([failing]);
    const failingArm = gatewayArm('claude');
    setGatewaySlotCatalog([fakeGatewayModel('claude-sonnet-4-6', 'api:gw-other')]);
    const otherArm = gatewayArm('claude');
    const failed = registry.getArmBreaker(
      breakerKeys.forArm({ name: 'claude', gatewayArm: 'api:gw-prod' })
    );
    const other = registry.getArmBreaker(
      breakerKeys.forArm({ name: 'claude', gatewayArm: 'api:gw-other' })
    );

    for (let index = 0; index < failed.getSnapshot().config.failureThreshold; index++) {
      await failingArm.execute({ content: 'test endpoint failure' });
    }

    expect(failed.getState()).toBe('open');
    expect((await otherArm.execute({ content: 'test other endpoint' })).ok).toBe(true);
    expect(other.getState()).toBe('closed');
    expect(other.getSnapshot().failureCount).toBe(0);
    await Promise.all([failingArm.dispose(), otherArm.dispose()]);
  });

  it('records a successful gateway call and clears the slot failure count', async () => {
    const model = fakeGatewayModel('claude-sonnet-4-6', 'api:gw-prod');
    vi.mocked(model.complete).mockResolvedValueOnce(
      err(new ModelError('gateway connection refused'))
    );
    setGatewaySlotCatalog([model]);
    const arm = gatewayArm('claude');
    const breaker = registry.getArmBreaker(
      breakerKeys.forArm({ name: 'claude', gatewayArm: 'api:gw-prod' })
    );

    expect((await arm.execute({ content: 'test failed gateway call' })).ok).toBe(false);
    expect(breaker.getSnapshot().failureCount).toBe(1);
    expect((await arm.execute({ content: 'test recovered gateway call' })).ok).toBe(true);
    expect(breaker.getSnapshot().failureCount).toBe(0);
    expect(breaker.getState()).toBe('closed');
    await arm.dispose();
  });

  it.each(['429 rate limit exceeded', 'Request throttled'])(
    'does not count a transient throttle against the gateway slot breaker: %s',
    async (message) => {
      const model = fakeGatewayModel('claude-sonnet-4-6', 'api:gw-prod');
      vi.mocked(model.complete).mockResolvedValue(err(new ModelError(message)));
      setGatewaySlotCatalog([model]);
      const arm = gatewayArm('claude');
      const breaker = registry.getArmBreaker(
        breakerKeys.forArm({ name: 'claude', gatewayArm: 'api:gw-prod' })
      );

      for (let index = 0; index < breaker.getSnapshot().config.failureThreshold; index++) {
        const result = await arm.execute({ content: 'test transient gateway throttle' });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error.code).toBe('RATE_LIMITED');
      }

      expect(breaker.getSnapshot().failureCount).toBe(0);
      expect(breaker.getState()).toBe('closed');
      await arm.dispose();
    }
  );

  it('does not count a structured throttle without rate-limit wording', async () => {
    const model = fakeGatewayModel('claude-sonnet-4-6', 'api:gw-prod');
    vi.mocked(model.complete).mockResolvedValue(
      err(new ModelError('temporarily unavailable', { code: ErrorCode.MODEL_RATE_LIMITED }))
    );
    setGatewaySlotCatalog([model]);
    const arm = gatewayArm('claude');
    const breaker = registry.getArmBreaker(
      breakerKeys.forArm({ name: 'claude', gatewayArm: 'api:gw-prod' })
    );

    for (let index = 0; index < breaker.getSnapshot().config.failureThreshold; index++) {
      expect((await arm.execute({ content: 'test structured transient throttle' })).ok).toBe(false);
    }

    expect(breaker.getSnapshot().failureCount).toBe(0);
    expect(breaker.getState()).toBe('closed');
    await arm.dispose();
  });

  it('counts durable quota exhaustion against the gateway slot breaker', async () => {
    const model = fakeGatewayModel('claude-sonnet-4-6', 'api:gw-prod');
    vi.mocked(model.complete).mockResolvedValue(
      err(new ModelError('API quota exceeded', { code: ErrorCode.MODEL_RATE_LIMITED }))
    );
    setGatewaySlotCatalog([model]);
    const arm = gatewayArm('claude');
    const breaker = registry.getArmBreaker(
      breakerKeys.forArm({ name: 'claude', gatewayArm: 'api:gw-prod' })
    );
    const threshold = breaker.getSnapshot().config.failureThreshold;

    for (let index = 0; index < threshold; index++) {
      const result = await arm.execute({ content: 'test durable gateway quota' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('RATE_LIMITED');
    }

    expect(breaker.getSnapshot().failureCount).toBe(threshold);
    expect(breaker.getState()).toBe('open');
    expect(registry.getBreaker('claude').getState()).toBe('closed');
    await arm.dispose();
  });

  it('treats caller cancellation as neutral rather than another slot failure', async () => {
    const model = fakeGatewayModel('claude-sonnet-4-6', 'api:gw-prod');
    vi.mocked(model.complete)
      .mockResolvedValueOnce(err(new ModelError('gateway connection refused')))
      .mockResolvedValueOnce(err(new ModelError('caller cancelled', { cause: new AbortError() })));
    setGatewaySlotCatalog([model]);
    const arm = gatewayArm('claude');
    const breaker = registry.getArmBreaker(
      breakerKeys.forArm({ name: 'claude', gatewayArm: 'api:gw-prod' })
    );

    await arm.execute({ content: 'test failed gateway call' });
    expect(breaker.getSnapshot().failureCount).toBe(1);
    const cancelled = await arm.execute({ content: 'test cancelled gateway call' });
    expect(cancelled.ok).toBe(false);
    expect(breaker.getSnapshot().failureCount).toBe(1);
    expect(breaker.getSnapshot().successCount).toBe(0);
    await arm.dispose();
  });
});

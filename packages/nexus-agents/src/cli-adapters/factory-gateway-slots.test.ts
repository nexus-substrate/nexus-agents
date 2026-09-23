/**
 * createAllAdapters family slots in gateway mode (#6604). "No CLIs installed"
 * is a PATH holding no executables; the gateway models are fakes at the
 * adapter boundary, so nothing reaches the network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { probeCliMock, claudeHealthMock, claudeExecuteMock } = vi.hoisted(() => ({
  probeCliMock: vi.fn(),
  claudeHealthMock: vi.fn(),
  claudeExecuteMock: vi.fn(),
}));

// The availability predicate (`isCliAvailable`) runs the binary's health
// check and the auth probe; both are faked here so no CLI is spawned.
vi.mock('../cli/cli-auth-probe.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cli/cli-auth-probe.js')>();
  return { ...actual, probeCli: probeCliMock };
});
vi.mock('./adapters/claude-adapter.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./adapters/claude-adapter.js')>();
  class ClaudeCliAdapter extends actual.ClaudeCliAdapter {
    override healthCheck(): ReturnType<typeof actual.ClaudeCliAdapter.prototype.healthCheck> {
      return claudeHealthMock() as ReturnType<typeof actual.ClaudeCliAdapter.prototype.healthCheck>;
    }
    override execute(
      ...args: Parameters<typeof actual.ClaudeCliAdapter.prototype.execute>
    ): ReturnType<typeof actual.ClaudeCliAdapter.prototype.execute> {
      return claudeExecuteMock(...args) as ReturnType<
        typeof actual.ClaudeCliAdapter.prototype.execute
      >;
    }
  }
  return { ...actual, ClaudeCliAdapter };
});

vi.mock('./codex-mcp-server-probe.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./codex-mcp-server-probe.js')>();
  return { ...actual, codexMcpServerAvailable: vi.fn(() => false) };
});

import { createAllAdapters } from './factory.js';
import { createCompositeRouter } from './composite-router.js';
import { ClaudeCliAdapter } from './adapters/claude-adapter.js';
import { GeminiCliAdapter } from './adapters/gemini-adapter.js';
import { CodexCliAdapter } from './adapters/codex-adapter.js';
import { OpenCodeCliAdapter } from './adapters/opencode-adapter.js';
import {
  _resetGatewaySlotCatalog,
  setGatewaySlotCatalog,
} from '../adapters/gateway-family-slots.js';
import { gatewayServedSlotOf } from './gateway-slot-arm.js';
import { BudgetRouter } from './budget-router.js';
import {
  describeUnpricedArm,
  estimateArmCostUsd,
  estimateBudgetArmCostUsd,
  ceilingCostOfArm,
  unpricedReasonOfArm,
} from './budget-arm-cost.js';
import { fakeGatewayModel } from '../testing/adapters/fake-gateway-model.js';

const THREE_FAMILY = ['gpt-5.5', 'claude-sonnet-4-6', 'gemini-2.5-pro'];
const HEALTHY = { healthy: true, version: '9.9.9', versionStatus: 'supported' as const };
const AUTHENTICATED = { cli: 'claude', state: 'authenticated', via: 'env-var' } as const;
const LOGGED_OUT = {
  cli: 'claude',
  state: 'needs-login',
  reason: 'test: logged out',
  fixCommand: 'claude login',
} as const;

describe('createAllAdapters gateway family slots (#6604)', () => {
  let emptyBin: string;
  let savedPath: string | undefined;

  /** Put an executable named `binary` on the test PATH. */
  function installFakeBinary(binary: string): void {
    const path = join(emptyBin, binary);
    writeFileSync(path, '#!/bin/sh\nexit 0\n');
    chmodSync(path, 0o755);
  }

  beforeEach(() => {
    _resetGatewaySlotCatalog();
    emptyBin = mkdtempSync(join(tmpdir(), 'nexus-no-clis-'));
    savedPath = process.env['PATH'];
    process.env['PATH'] = emptyBin;
  });
  afterEach(() => {
    _resetGatewaySlotCatalog();
    vi.clearAllMocks();
    if (savedPath === undefined) delete process.env['PATH'];
    else process.env['PATH'] = savedPath;
    rmSync(emptyBin, { recursive: true, force: true });
  });

  it('serves each vendor slot from its family under the slot key', async () => {
    const models = THREE_FAMILY.map((id) => fakeGatewayModel(id));
    setGatewaySlotCatalog(models);
    const arms = createAllAdapters(undefined, 'subprocess');

    expect([...arms.keys()]).toEqual(['claude', 'gemini', 'codex', 'opencode']);
    expect(arms.get('opencode')).toBeInstanceOf(OpenCodeCliAdapter);
    const served: Record<string, string | undefined> = {};
    for (const cli of ['claude', 'codex', 'gemini'] as const) {
      const arm = arms.get(cli);
      expect(gatewayServedSlotOf(arm)).toBeDefined();
      expect(arm?.name).toBe(cli);
      const res = await arm?.execute({ content: 'hi' });
      served[cli] = res?.ok === true ? res.value.model : undefined;
    }
    expect(served).toEqual({
      claude: 'claude-sonnet-4-6',
      codex: 'gpt-5.5',
      gemini: 'gemini-2.5-pro',
    });
  });

  it('gives the slot of a missing family no arm, so the router never selects it', async () => {
    setGatewaySlotCatalog(['gpt-5.5', 'claude-sonnet-4-6'].map((id) => fakeGatewayModel(id)));
    const arms = createAllAdapters(undefined, 'subprocess');
    expect(arms.has('gemini')).toBe(false);

    const router = createCompositeRouter(arms);
    const tasks = [
      'research the latest Gemini multimodal papers and summarize them',
      'implement a function that parses CSV',
      'review this design for security issues',
      'write documentation for the API',
    ];
    const chosen = new Set<string>();
    for (const content of tasks) {
      const decision = await router.route({ content });
      if (decision.ok) chosen.add(decision.value.cliName);
    }
    expect(chosen.size).toBeGreaterThan(0);
    expect(chosen.has('gemini')).toBe(false);
  });

  it('serves a slot whose binary is on PATH but fails auth from the gateway', async () => {
    setGatewaySlotCatalog(THREE_FAMILY.map((id) => fakeGatewayModel(id)));
    installFakeBinary('claude');
    claudeHealthMock.mockResolvedValue(HEALTHY);
    probeCliMock.mockResolvedValue({
      cli: 'claude',
      state: 'needs-login',
      reason: 'test: logged out',
      fixCommand: 'claude login',
    });
    const arms = createAllAdapters(undefined, 'subprocess');

    const res = await arms.get('claude')?.execute({ content: 'hi' });
    expect(res?.ok === true ? res.value.model : undefined).toBe('claude-sonnet-4-6');
    expect(claudeExecuteMock).not.toHaveBeenCalled();
    expect(gatewayServedSlotOf(arms.get('claude'))?.modelId).toBe('claude-sonnet-4-6');
  });

  it('keeps an installed, authenticated CLI on its own subprocess adapter', async () => {
    setGatewaySlotCatalog(THREE_FAMILY.map((id) => fakeGatewayModel(id)));
    installFakeBinary('claude');
    claudeHealthMock.mockResolvedValue(HEALTHY);
    probeCliMock.mockResolvedValue(AUTHENTICATED);
    claudeExecuteMock.mockResolvedValue({ ok: true, value: { text: 'cli', model: 'cli-model' } });
    const arms = createAllAdapters(undefined, 'subprocess');

    const res = await arms.get('claude')?.execute({ content: 'hi' });
    expect(res?.ok === true ? res.value.model : undefined).toBe('cli-model');
    expect(gatewayServedSlotOf(arms.get('claude'))).toBeUndefined();
    expect(gatewayServedSlotOf(arms.get('codex'))?.modelId).toBe('gpt-5.5');
  });

  it('re-checks a CLI arm whose login expired, then serves the slot from the gateway', async () => {
    setGatewaySlotCatalog(THREE_FAMILY.map((id) => fakeGatewayModel(id)));
    installFakeBinary('claude');
    claudeHealthMock.mockResolvedValue(HEALTHY);
    probeCliMock.mockResolvedValue(AUTHENTICATED);
    claudeExecuteMock.mockResolvedValue({ ok: true, value: { text: 'cli', model: 'cli-model' } });
    const arm = createAllAdapters(undefined, 'subprocess').get('claude');

    // Committed to the CLI: nothing is served by the gateway.
    await arm?.execute({ content: 'one' });
    expect(gatewayServedSlotOf(arm)).toBeUndefined();

    // The login expires: this call keeps its own error (no failover) ...
    claudeExecuteMock.mockResolvedValue({
      ok: false,
      error: { code: 'NOT_AUTHENTICATED', message: 'expired', cli: 'claude', retryable: false },
    });
    probeCliMock.mockResolvedValue(LOGGED_OUT);
    const failed = await arm?.execute({ content: 'two' });
    expect(failed?.ok).toBe(false);
    expect(claudeExecuteMock).toHaveBeenCalledTimes(2);

    // ... and the next call re-probes (the cached "available" is dropped).
    const next = await arm?.execute({ content: 'three' });
    expect(next?.ok === true ? next.value.model : undefined).toBe('claude-sonnet-4-6');
    expect(claudeExecuteMock).toHaveBeenCalledTimes(2);
    expect(gatewayServedSlotOf(arm)?.modelId).toBe('claude-sonnet-4-6');
  });

  it('does not re-check a CLI arm on an ordinary task failure', async () => {
    setGatewaySlotCatalog(THREE_FAMILY.map((id) => fakeGatewayModel(id)));
    installFakeBinary('claude');
    claudeHealthMock.mockResolvedValue(HEALTHY);
    probeCliMock.mockResolvedValue(AUTHENTICATED);
    claudeExecuteMock.mockResolvedValue({
      ok: false,
      error: { code: 'EXECUTION_ERROR', message: 'bad task', cli: 'claude', retryable: false },
    });
    const arm = createAllAdapters(undefined, 'subprocess').get('claude');
    await arm?.execute({ content: 'one' });
    probeCliMock.mockResolvedValue(LOGGED_OUT);
    await arm?.execute({ content: 'two' });
    expect(claudeExecuteMock).toHaveBeenCalledTimes(2);
    expect(gatewayServedSlotOf(arm)).toBeUndefined();
  });

  it('prices a gateway-served slot arm by the gateway declaration, not the vendor rate', () => {
    setGatewaySlotCatalog([fakeGatewayModel('claude-sonnet-4-6', 'api:openai-compat')]);
    const arm = createAllAdapters(undefined, 'subprocess').get('claude');
    const served = gatewayServedSlotOf(arm);
    expect(served).toEqual({ modelId: 'claude-sonnet-4-6', arm: 'api:openai-compat' });

    // Undeclared gateway: unknown, never the claude slot's list price.
    expect(ceilingCostOfArm({ arm: 'claude', adapter: arm }, 1_000_000, 0, {})).toBeUndefined();
    expect(estimateBudgetArmCostUsd('claude', 1_000_000, 0, {}, served)).toBeUndefined();
    expect(describeUnpricedArm('claude', {}, undefined, served)).toContain('gateway cost');
    // Declared flat rate: that rate.
    const declared = { NEXUS_GATEWAY_COST: 'priced:1,2' };
    expect(ceilingCostOfArm({ arm: 'claude', adapter: arm }, 1_000_000, 0, declared)).toBe(1);
    expect(estimateBudgetArmCostUsd('claude', 1_000_000, 0, declared, served)).toBe(1);
    // The same slot key without a gateway serving it keeps its vendor rate.
    expect(estimateArmCostUsd('claude', 1_000_000, 0, {})).toBeGreaterThan(0);
    expect(
      ceilingCostOfArm({ arm: 'claude', adapter: undefined }, 1_000_000, 0, {})
    ).toBeGreaterThan(0);
  });

  it('leaves a slot unpriced when its gateway model carries no gateway-arm marker', () => {
    setGatewaySlotCatalog([fakeGatewayModel('claude-sonnet-4-6')]);
    const arm = createAllAdapters(undefined, 'subprocess').get('claude');
    const declared = { NEXUS_GATEWAY_COST: 'free' };
    expect(
      ceilingCostOfArm({ arm: 'claude', adapter: arm }, 1_000_000, 0, declared)
    ).toBeUndefined();
    expect(unpricedReasonOfArm({ arm: 'claude', adapter: arm }, declared)).toContain(
      'carries no gateway arm'
    );
  });

  it("the budget router prices each arm by that arm's own serving state", () => {
    setGatewaySlotCatalog([fakeGatewayModel('claude-sonnet-4-6', 'api:openai-compat')]);
    const arms = createAllAdapters(undefined, 'subprocess');
    const onlyClaude = new Map([['claude', arms.get('claude')]] as const) as Map<
      'claude',
      NonNullable<ReturnType<typeof arms.get>>
    >;
    const savedCost = process.env['NEXUS_GATEWAY_COST'];
    const router = new BudgetRouter(onlyClaude);
    try {
      Reflect.deleteProperty(process.env, 'NEXUS_GATEWAY_COST');
      const undeclared = router.checkBudget({ content: 'hi' });
      expect(undeclared.adapter).toBeNull();
      expect(undeclared.unpricedArms).toEqual([{ arm: 'claude', reason: 'gateway cost unset' }]);

      process.env['NEXUS_GATEWAY_COST'] = 'free';
      const declared = router.checkBudget({ content: 'hi' });
      expect(declared.adapter).toBe(arms.get('claude'));
      expect(declared.estimatedCostUsd).toBe(0);
    } finally {
      router.dispose();
      if (savedCost === undefined) Reflect.deleteProperty(process.env, 'NEXUS_GATEWAY_COST');
      else process.env['NEXUS_GATEWAY_COST'] = savedCost;
    }
  });

  it('the task-class cost ceiling prices a gateway-served slot arm by the gateway', () => {
    setGatewaySlotCatalog([fakeGatewayModel('claude-sonnet-4-6', 'api:openai-compat')]);
    const arms = createAllAdapters(undefined, 'subprocess');
    const savedCost = process.env['NEXUS_GATEWAY_COST'];
    // A generous ceiling the claude slot's vendor rate would pass.
    const router = new BudgetRouter(arms, { taskClassCostCeilings: { code_generation: 1000 } });
    const task = { content: 'implement a function', maxTokens: 10_000 };
    try {
      Reflect.deleteProperty(process.env, 'NEXUS_GATEWAY_COST');
      expect(router.filterByTaskClassCeiling(task, ['claude'])).toEqual([]);
      process.env['NEXUS_GATEWAY_COST'] = 'free';
      expect(router.filterByTaskClassCeiling(task, ['claude'])).toEqual(['claude']);
    } finally {
      router.dispose();
      if (savedCost === undefined) Reflect.deleteProperty(process.env, 'NEXUS_GATEWAY_COST');
      else process.env['NEXUS_GATEWAY_COST'] = savedCost;
    }
  });

  it('is unchanged with no gateway catalogue: every slot is its subprocess arm', () => {
    const arms = createAllAdapters(undefined, 'subprocess');
    expect([...arms.keys()]).toEqual(['claude', 'gemini', 'codex', 'opencode']);
    expect(arms.get('claude')).toBeInstanceOf(ClaudeCliAdapter);
    expect(arms.get('gemini')).toBeInstanceOf(GeminiCliAdapter);
    expect(arms.get('codex')).toBeInstanceOf(CodexCliAdapter);
    expect(arms.get('opencode')).toBeInstanceOf(OpenCodeCliAdapter);
  });
});

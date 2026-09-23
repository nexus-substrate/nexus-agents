/**
 * The consumers of the family-slot seam with NO CLIs installed (#6604):
 * run_dev_pipeline's expert stage (router arms), orchestrate workers (role
 * routing through the registry) and execute_expert (model-preference routing
 * through the registry). "No CLIs" is a PATH with no executables; the gateway
 * models are fakes at the adapter boundary, so nothing reaches the network.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLogger, type IModelAdapter } from '../core/index.js';

vi.mock('../cli-adapters/child-mcp-config.js', () => ({
  generateMcpConfig: () => Promise.resolve({ configPath: '/tmp/mcp.json', cleanup: vi.fn() }),
}));
// No CLI is installed: detection finds none. The router arms use the real
// factory, whose PATH lookup finds no binary in the empty PATH below.
vi.mock('../cli-adapters/factory.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cli-adapters/factory.js')>();
  return {
    ...actual,
    isCliAvailable: vi.fn(() => Promise.resolve(false)),
    getAvailableClis: vi.fn(() => Promise.resolve([])),
  };
});
vi.mock('../cli-adapters/codex-mcp-server-probe.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cli-adapters/codex-mcp-server-probe.js')>();
  return { ...actual, codexMcpServerAvailable: vi.fn(() => false) };
});

import { _resetGatewaySlotCatalog, setGatewaySlotCatalog } from './gateway-family-slots.js';
import { getGlobalRegistry, resetGlobalRegistry } from './unified-registry.js';
import {
  ROLE_TO_TASK_CATEGORY,
  resolveAdapterForModelPreference,
  resolveAdapterForRole,
} from '../mcp/tools/create-expert-routing.js';
import { executeExpert } from '../pipeline/expert-bridge.js';
import { fakeGatewayModel } from '../testing/adapters/fake-gateway-model.js';

const FAMILY_MODEL = {
  claude: 'claude-sonnet-4-6',
  codex: 'gpt-5.5',
  gemini: 'gemini-2.5-pro',
} as const;

const logger = createLogger({ component: 'gateway-family-slots-consumers-test' });

async function servedModel(adapter: IModelAdapter | undefined): Promise<string | undefined> {
  const res = await adapter?.complete({ messages: [{ role: 'user', content: 'hi' }] });
  return res?.ok === true ? res.value.model : undefined;
}

describe('family slots reach their family with no CLIs installed (#6604)', () => {
  let emptyBin: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    _resetGatewaySlotCatalog();
    resetGlobalRegistry();
    emptyBin = mkdtempSync(join(tmpdir(), 'nexus-no-clis-'));
    for (const k of ['PATH', 'NEXUS_DISABLED_CLIS']) saved[k] = process.env[k];
    process.env['PATH'] = emptyBin;
    // opencode is multi-vendor and has no family slot; without its binary it
    // is not a candidate the expert stage could succeed on.
    process.env['NEXUS_DISABLED_CLIS'] = 'opencode';
    setGatewaySlotCatalog(Object.values(FAMILY_MODEL).map((id) => fakeGatewayModel(id)));
  });
  afterEach(() => {
    _resetGatewaySlotCatalog();
    resetGlobalRegistry();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) Reflect.deleteProperty(process.env, k);
      else process.env[k] = v;
    }
    rmSync(emptyBin, { recursive: true, force: true });
  });

  it('execute_expert: a model preference reaches its family model', async () => {
    const adapter = resolveAdapterForModelPreference('claude-opus', undefined, logger);
    expect(await servedModel(adapter)).toBe(FAMILY_MODEL.claude);
    expect(adapter?.providerId).toBe('cli-claude');
  });

  it('orchestrate workers: each role reaches the family of its routed slot', async () => {
    const registry = getGlobalRegistry();
    const slotsSeen = new Set<string>();
    for (const [role, category] of Object.entries(ROLE_TO_TASK_CATEGORY)) {
      const slot = registry.getRouting(category)?.primaryCli as keyof typeof FAMILY_MODEL;
      slotsSeen.add(slot);
      const adapter = resolveAdapterForRole(role, undefined, logger);
      expect({ role, served: await servedModel(adapter) }).toEqual({
        role,
        served: FAMILY_MODEL[slot],
      });
    }
    // The roles cover every vendor slot, so each family is exercised.
    expect([...slotsSeen].sort()).toEqual(['claude', 'codex', 'gemini']);
  });

  it("run_dev_pipeline's expert stage: the routed slot is served by its family", async () => {
    const result = await executeExpert('code', 'write a CSV parser');
    expect(result.success).toBe(true);
    const slot = result.cli as keyof typeof FAMILY_MODEL;
    expect(Object.keys(FAMILY_MODEL)).toContain(slot);
    expect(result.model).toBe(FAMILY_MODEL[slot]);
  });
});

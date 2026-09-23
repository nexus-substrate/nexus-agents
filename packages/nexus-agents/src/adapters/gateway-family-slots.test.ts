/**
 * Family-slot resolution in gateway mode (#6604, panel option A).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ILogger } from '../core/index.js';
import { fakeGatewayModel } from '../testing/adapters/fake-gateway-model.js';
import {
  _resetGatewaySlotCatalog,
  createGatewaySlotAdapter,
  rankFamilyModels,
  resolveGatewaySlot,
  setGatewaySlotCatalog,
} from './gateway-family-slots.js';

function silentLogger(): ILogger & { warn: ReturnType<typeof vi.fn> } {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  } as unknown as ILogger & { warn: ReturnType<typeof vi.fn> };
}

const THREE_FAMILY = ['gpt-5.5', 'anthropic/claude-sonnet-4-6', 'gemini-2.5-pro'];

function modelOf(cli: 'claude' | 'codex' | 'gemini', env: NodeJS.ProcessEnv = {}): string {
  const r = resolveGatewaySlot(cli, env, silentLogger());
  return r.kind === 'resolved' ? r.adapter.modelId : r.kind;
}

describe('resolveGatewaySlot (#6604)', () => {
  beforeEach(() => {
    _resetGatewaySlotCatalog();
  });

  it('is inactive with no gateway catalogue, so callers keep their old path', () => {
    expect(resolveGatewaySlot('claude', {}, silentLogger())).toEqual({ kind: 'inactive' });
  });

  it('treats an empty catalogue as no gateway, not as every slot unavailable', () => {
    setGatewaySlotCatalog([]);
    expect(resolveGatewaySlot('codex', {}, silentLogger())).toEqual({ kind: 'inactive' });
  });

  it('routes each slot of a three-family catalogue to its own family', () => {
    setGatewaySlotCatalog(THREE_FAMILY.map((id) => fakeGatewayModel(id)));
    expect(modelOf('claude')).toBe('anthropic/claude-sonnet-4-6');
    expect(modelOf('codex')).toBe('gpt-5.5');
    expect(modelOf('gemini')).toBe('gemini-2.5-pro');
  });

  it('makes the slot of a missing family unavailable, never another family', () => {
    setGatewaySlotCatalog(['gpt-5.5', 'claude-sonnet-4-6'].map((id) => fakeGatewayModel(id)));
    expect(resolveGatewaySlot('gemini', {}, silentLogger())).toEqual({
      kind: 'unavailable',
      family: 'google',
    });
  });

  it('leaves opencode inactive: it has no family', () => {
    setGatewaySlotCatalog(THREE_FAMILY.map((id) => fakeGatewayModel(id)));
    expect(resolveGatewaySlot('opencode', {}, silentLogger())).toEqual({ kind: 'inactive' });
  });

  it('honours NEXUS_GATEWAY_MODEL_<FAMILY> when the model is in the catalogue', () => {
    setGatewaySlotCatalog(
      ['claude-opus', 'claude-haiku', 'gpt-5.5'].map((id) => fakeGatewayModel(id))
    );
    const r = resolveGatewaySlot(
      'claude',
      { NEXUS_GATEWAY_MODEL_ANTHROPIC: 'claude-haiku' },
      silentLogger()
    );
    expect(r).toMatchObject({ kind: 'resolved', via: 'override' });
    expect(r.kind === 'resolved' && r.adapter.modelId).toBe('claude-haiku');
  });

  it('warns once and falls back when the override names an absent model', () => {
    setGatewaySlotCatalog(['claude-opus', 'claude-haiku'].map((id) => fakeGatewayModel(id)));
    const logger = silentLogger();
    const env = { NEXUS_GATEWAY_MODEL_ANTHROPIC: 'claude-nonexistent-9' };
    const first = resolveGatewaySlot('claude', env, logger);
    resolveGatewaySlot('claude', env, logger);
    expect(first).toMatchObject({ kind: 'resolved', via: 'preference' });
    expect(first.kind === 'resolved' && first.adapter.modelId).toBe('claude-opus');
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(String(logger.warn.mock.calls[0]?.[0])).toContain('NEXUS_GATEWAY_MODEL_ANTHROPIC');
  });

  it('refuses an override that names another family, keeping the slot in its family', () => {
    setGatewaySlotCatalog(['claude-opus', 'gpt-5.5'].map((id) => fakeGatewayModel(id)));
    const logger = silentLogger();
    const r = resolveGatewaySlot('claude', { NEXUS_GATEWAY_MODEL_ANTHROPIC: 'gpt-5.5' }, logger);
    expect(r.kind === 'resolved' && r.adapter.modelId).toBe('claude-opus');
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});

describe('rankFamilyModels (#6604)', () => {
  it('puts registry-scored models first, best quality first', () => {
    expect(rankFamilyModels(['claude-haiku', 'claude-sonnet', 'claude-opus'])).toEqual([
      'claude-opus',
      'claude-sonnet',
      'claude-haiku',
    ]);
  });

  it('ranks unscored models after scored ones, newest version first', () => {
    expect(
      rankFamilyModels(['anthropic/claude-opus-4-1', 'claude-haiku', 'anthropic/claude-opus-4-8'])
    ).toEqual(['claude-haiku', 'anthropic/claude-opus-4-8', 'anthropic/claude-opus-4-1']);
  });

  it('is empty for an empty family', () => {
    expect(rankFamilyModels([])).toEqual([]);
  });
});

describe('createGatewaySlotAdapter (#6604)', () => {
  it('keeps the slot key as providerId and the served model as modelId', async () => {
    const model = fakeGatewayModel('claude-opus', 'api:openai-compat');
    const view = createGatewaySlotAdapter('claude', model);
    expect(view.providerId).toBe('cli-claude');
    expect(view.modelId).toBe('claude-opus');
    expect((view as { gatewayArm?: string }).gatewayArm).toBe('api:openai-compat');
    await view.complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(model.complete).toHaveBeenCalledTimes(1);
  });

  it('carries no gateway arm for a model that has none', () => {
    const view = createGatewaySlotAdapter('codex', fakeGatewayModel('gpt-5.5'));
    expect('gatewayArm' in view).toBe(false);
  });
});

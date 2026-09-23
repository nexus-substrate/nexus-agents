/**
 * Tests for per-role voter model overrides (#4055).
 */

import { afterEach, describe, it, expect, vi } from 'vitest';

import type { ILogger, IModelAdapter } from '../core/index.js';
import { resolveVoterModelOverrides, voterModelOverrideEnvKey } from './voter-model-overrides.js';
import { resolveGatewayRoleAdapters } from './voter-agents.js';
import { vendorFamilyOf } from './voter-family-dealing.js';
import type { VoterRole } from './vote-types.js';
import { THREE_FAMILY_CHAT_IDS } from '../testing/gateway/three-family-catalog.js';

/** Minimal adapter stub — the resolver only reads `modelId`. */
function adapter(modelId: string): IModelAdapter {
  return { modelId } as unknown as IModelAdapter;
}

function fakeLogger(): ILogger & {
  warn: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
} {
  return {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  } as unknown as ILogger & { warn: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };
}

const GATEWAY = [adapter('gpt-4o'), adapter('claude_4_5_opus'), adapter('gemini-3-pro')];
const ENV_KEYS = [
  'NEXUS_VOTER_MODEL_ARCHITECT',
  'NEXUS_VOTER_MODEL_SECURITY',
  'NEXUS_VOTER_MODEL_AI_ML',
];

describe('voterModelOverrideEnvKey (#4055)', () => {
  it('derives the env key from the role (underscores preserved, upper-cased)', () => {
    expect(voterModelOverrideEnvKey('architect')).toBe('NEXUS_VOTER_MODEL_ARCHITECT');
    expect(voterModelOverrideEnvKey('ai_ml')).toBe('NEXUS_VOTER_MODEL_AI_ML');
    expect(voterModelOverrideEnvKey('scope_steward')).toBe('NEXUS_VOTER_MODEL_SCOPE_STEWARD');
  });
});

describe('resolveVoterModelOverrides (#4055)', () => {
  afterEach(() => {
    for (const k of ENV_KEYS) Reflect.deleteProperty(process.env, k);
  });

  it('returns an empty map when no overrides are set (round-robin unchanged)', () => {
    const logger = fakeLogger();
    const out = resolveVoterModelOverrides(['architect', 'security'], GATEWAY, logger);
    expect(out.size).toBe(0);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('pins a role to a valid gateway model id', () => {
    process.env['NEXUS_VOTER_MODEL_ARCHITECT'] = 'claude_4_5_opus';
    const logger = fakeLogger();
    const out = resolveVoterModelOverrides(['architect', 'security'], GATEWAY, logger);
    expect(out.get('architect')?.modelId).toBe('claude_4_5_opus');
    expect(out.has('security')).toBe(false); // no override → round-robin
  });

  it('matches case-insensitively as a convenience', () => {
    process.env['NEXUS_VOTER_MODEL_ARCHITECT'] = 'CLAUDE_4_5_OPUS';
    const out = resolveVoterModelOverrides(['architect'], GATEWAY, fakeLogger());
    expect(out.get('architect')?.modelId).toBe('claude_4_5_opus');
  });

  it('warns and falls back (omits the role) when the override id is not in the catalog', () => {
    process.env['NEXUS_VOTER_MODEL_SECURITY'] = 'not-a-real-model';
    const logger = fakeLogger();
    const out = resolveVoterModelOverrides(['security'], GATEWAY, logger);
    expect(out.has('security')).toBe(false);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [message] = logger.warn.mock.calls[0] as [string];
    expect(message).toContain('not-a-real-model');
  });

  it('ignores a blank override value', () => {
    process.env['NEXUS_VOTER_MODEL_ARCHITECT'] = '   ';
    const out = resolveVoterModelOverrides(['architect'], GATEWAY, fakeLogger());
    expect(out.size).toBe(0);
  });

  it('handles multiple roles with distinct overrides', () => {
    process.env['NEXUS_VOTER_MODEL_ARCHITECT'] = 'gpt-4o';
    process.env['NEXUS_VOTER_MODEL_AI_ML'] = 'gemini-3-pro';
    const out = resolveVoterModelOverrides(
      ['architect', 'security', 'ai_ml'],
      GATEWAY,
      fakeLogger()
    );
    expect(out.get('architect')?.modelId).toBe('gpt-4o');
    expect(out.get('ai_ml')?.modelId).toBe('gemini-3-pro');
    expect(out.has('security')).toBe(false);
  });

  it('returns empty when there are no gateway adapters', () => {
    process.env['NEXUS_VOTER_MODEL_ARCHITECT'] = 'gpt-4o';
    const out = resolveVoterModelOverrides(['architect'], [], fakeLogger());
    expect(out.size).toBe(0);
  });
});

describe('resolveGatewayRoleAdapters — override + round-robin integration (#4055)', () => {
  afterEach(() => {
    for (const k of ENV_KEYS) Reflect.deleteProperty(process.env, k);
  });

  const fallback = adapter('fallback-model');

  it('pins the overridden role and round-robins the rest', () => {
    process.env['NEXUS_VOTER_MODEL_ARCHITECT'] = 'claude_4_5_opus';
    const assigned = resolveGatewayRoleAdapters(
      ['architect', 'security', 'ai_ml'],
      GATEWAY,
      fallback,
      fakeLogger()
    );
    // architect is pinned; the other two are NOT (they round-robin, so they are not
    // the override-only model unless round-robin lands there).
    expect(assigned.get('architect')?.modelId).toBe('claude_4_5_opus');
    expect(assigned.size).toBe(3);
  });

  it('warns when overrides collapse the whole panel to one model (governance guard)', () => {
    process.env['NEXUS_VOTER_MODEL_ARCHITECT'] = 'gpt-4o';
    process.env['NEXUS_VOTER_MODEL_SECURITY'] = 'gpt-4o';
    process.env['NEXUS_VOTER_MODEL_AI_ML'] = 'gpt-4o';
    const logger = fakeLogger();
    const assigned = resolveGatewayRoleAdapters(
      ['architect', 'security', 'ai_ml'],
      GATEWAY,
      fallback,
      logger
    );
    expect([...assigned.values()].every((a) => a.modelId === 'gpt-4o')).toBe(true);
    const collapseWarn = logger.warn.mock.calls.find((c) =>
      String(c[0]).includes('collapsed to a single gateway model via overrides')
    );
    expect(collapseWarn).toBeDefined();
  });

  it('does NOT warn collapse when diversity is preserved', () => {
    // architect pinned to gemini-3-pro; security is dealt to the least-seated
    // family (#6606), which is not google → 2 distinct models, no collapse.
    process.env['NEXUS_VOTER_MODEL_ARCHITECT'] = 'gemini-3-pro';
    const logger = fakeLogger();
    const assigned = resolveGatewayRoleAdapters(
      ['architect', 'security'],
      GATEWAY,
      fallback,
      logger
    );
    expect(new Set([...assigned.values()].map((a) => a.modelId)).size).toBe(2);
    const collapseWarn = logger.warn.mock.calls.find((c) =>
      String(c[0]).includes('collapsed to a single gateway model via overrides')
    );
    expect(collapseWarn).toBeUndefined();
  });
});

describe('resolveGatewayRoleAdapters — family-first dealing (#6606)', () => {
  afterEach(() => {
    for (const k of ENV_KEYS) Reflect.deleteProperty(process.env, k);
  });

  const SEVEN: readonly VoterRole[] = [
    'architect',
    'security',
    'devex',
    'ai_ml',
    'pm',
    'catfish',
    'scope_steward',
  ];
  const CATALOG = THREE_FAMILY_CHAT_IDS.map(adapter);
  const fallback = adapter('fallback-model');
  const familiesOf = (assigned: Map<VoterRole, IModelAdapter>): string[] =>
    SEVEN.map((r) => vendorFamilyOf(assigned.get(r)?.modelId ?? ''));

  it('seats seven roles on all three families of a listing-skewed catalogue', () => {
    const assigned = resolveGatewayRoleAdapters(SEVEN, CATALOG, fallback, fakeLogger());
    expect(new Set(familiesOf(assigned))).toEqual(new Set(['anthropic', 'openai', 'google']));
  });

  it('assigns the same model to each role whatever the listing order', () => {
    const listed = resolveGatewayRoleAdapters(SEVEN, CATALOG, fallback, fakeLogger());
    const reversed = resolveGatewayRoleAdapters(
      SEVEN,
      [...CATALOG].reverse(),
      fallback,
      fakeLogger()
    );
    expect(SEVEN.map((r) => reversed.get(r)?.modelId)).toEqual(
      SEVEN.map((r) => listed.get(r)?.modelId)
    );
  });

  it('lets a pin win and deals the other roles around it', () => {
    process.env['NEXUS_VOTER_MODEL_ARCHITECT'] = 'openai/o3';
    process.env['NEXUS_VOTER_MODEL_SECURITY'] = 'gpt-5.2';
    const assigned = resolveGatewayRoleAdapters(SEVEN, CATALOG, fallback, fakeLogger());
    expect(assigned.get('architect')?.modelId).toBe('openai/o3');
    expect(assigned.get('security')?.modelId).toBe('gpt-5.2');
    // Two pinned OpenAI seats: the five dealt seats go to the other families first.
    const families = familiesOf(assigned);
    expect(families.filter((f) => f === 'openai')).toHaveLength(2);
    expect(families.filter((f) => f === 'anthropic')).toHaveLength(3);
    expect(families.filter((f) => f === 'google')).toHaveLength(2);
  });

  it('warns that a one-family catalogue collapsed the panel to one family', () => {
    const logger = fakeLogger();
    resolveGatewayRoleAdapters(
      SEVEN,
      [adapter('gpt-5.2'), adapter('openai/o3'), adapter('openai/gpt-4o')],
      fallback,
      logger
    );
    const warned = logger.warn.mock.calls.find((c) =>
      String(c[0]).includes('collapsed to a single model family')
    );
    expect(warned).toBeDefined();
  });

  it('does not warn of a family collapse on a three-family catalogue', () => {
    const logger = fakeLogger();
    resolveGatewayRoleAdapters(SEVEN, CATALOG, fallback, logger);
    const warned = logger.warn.mock.calls.find((c) =>
      String(c[0]).includes('collapsed to a single model family')
    );
    expect(warned).toBeUndefined();
  });
});

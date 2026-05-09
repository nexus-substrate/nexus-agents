/**
 * Tests for the OpenAI-compatible gateway adapter (#2468).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readOpenAICompatEnv,
  discoverModels,
  buildOpenAICompatAdapters,
  createOpenAICompatAdapter,
  type OpenAICompatConfig,
} from './openai-compat-adapter.js';
import { ConfigError } from '../core/index.js';

// Mock the OpenAI SDK so tests don't make real HTTP calls.
const { mockList } = vi.hoisted(() => ({ mockList: vi.fn() }));
vi.mock('openai', () => {
  class MockOpenAI {
    models = { list: mockList };
    chat = { completions: { create: vi.fn() } };
  }
  return { default: MockOpenAI };
});

describe('readOpenAICompatEnv (#2468)', () => {
  beforeEach(() => {
    delete process.env['NEXUS_OPENAI_COMPAT_URL'];
    delete process.env['NEXUS_OPENAI_COMPAT_KEY'];
  });

  it('returns null when both env vars are unset', () => {
    expect(readOpenAICompatEnv()).toBeNull();
  });

  it('returns null when only URL is set', () => {
    process.env['NEXUS_OPENAI_COMPAT_URL'] = 'https://gateway.example/v1';
    expect(readOpenAICompatEnv()).toBeNull();
  });

  it('returns null when only key is set', () => {
    process.env['NEXUS_OPENAI_COMPAT_KEY'] = 'sk-test';
    expect(readOpenAICompatEnv()).toBeNull();
  });

  it('returns null when env var is empty string', () => {
    process.env['NEXUS_OPENAI_COMPAT_URL'] = '';
    process.env['NEXUS_OPENAI_COMPAT_KEY'] = 'sk-test';
    expect(readOpenAICompatEnv()).toBeNull();
  });

  it('returns config when both vars are set', () => {
    process.env['NEXUS_OPENAI_COMPAT_URL'] = 'https://gateway.example/v1';
    process.env['NEXUS_OPENAI_COMPAT_KEY'] = 'sk-test';
    const result = readOpenAICompatEnv();
    expect(result).toEqual({ baseUrl: 'https://gateway.example/v1', apiKey: 'sk-test' });
  });

  it('trims whitespace from env vars', () => {
    process.env['NEXUS_OPENAI_COMPAT_URL'] = '  https://gateway.example/v1  ';
    process.env['NEXUS_OPENAI_COMPAT_KEY'] = '  sk-test  ';
    const result = readOpenAICompatEnv();
    expect(result?.baseUrl).toBe('https://gateway.example/v1');
    expect(result?.apiKey).toBe('sk-test');
  });
});

describe('discoverModels (#2468)', () => {
  beforeEach(() => {
    mockList.mockReset();
  });

  const config: OpenAICompatConfig = {
    baseUrl: 'https://gateway.example/v1',
    apiKey: 'sk-test',
  };

  it('returns all models the gateway exposes', async () => {
    mockList.mockResolvedValue({
      data: [
        { id: 'gpt-4o', created: 1700000000, owned_by: 'openai' },
        { id: 'claude-sonnet-4', created: 1710000000, owned_by: 'anthropic' },
        { id: 'gemini-2-pro', created: 1720000000, owned_by: 'google' },
      ],
    });
    const result = await discoverModels(config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
    expect(result.value.map((m) => m.id)).toEqual(['gpt-4o', 'claude-sonnet-4', 'gemini-2-pro']);
  });

  it('preserves created + ownedBy fields when present', async () => {
    mockList.mockResolvedValue({
      data: [{ id: 'm1', created: 1234567890, owned_by: 'someone' }],
    });
    const result = await discoverModels(config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.created).toBe(1234567890);
    expect(result.value[0]?.ownedBy).toBe('someone');
  });

  it('handles models without optional fields', async () => {
    mockList.mockResolvedValue({ data: [{ id: 'minimal-model' }] });
    const result = await discoverModels(config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.id).toBe('minimal-model');
    expect(result.value[0]?.created).toBeUndefined();
    expect(result.value[0]?.ownedBy).toBeUndefined();
  });

  it('returns ConfigError with actionable message when gateway fails', async () => {
    mockList.mockRejectedValue(new Error('connect ECONNREFUSED'));
    const result = await discoverModels(config);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ConfigError);
    expect(result.error.message).toContain('https://gateway.example/v1');
    expect(result.error.message).toContain('NEXUS_OPENAI_COMPAT_URL');
    expect(result.error.message).toContain('connect ECONNREFUSED');
  });

  it('handles 401 / auth failures with the same actionable message', async () => {
    mockList.mockRejectedValue(new Error('401 Unauthorized'));
    const result = await discoverModels(config);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('NEXUS_OPENAI_COMPAT_KEY');
  });
});

describe('createOpenAICompatAdapter (#2468)', () => {
  it('creates an OpenAIAdapter pointed at the gateway', () => {
    const adapter = createOpenAICompatAdapter('any-model', {
      baseUrl: 'https://gateway.example/v1',
      apiKey: 'sk-test',
    });
    expect(adapter).toBeDefined();
    // BaseAdapter.providerId is 'openai' by construction; modelId is what we passed.
    expect(adapter.modelId).toBe('any-model');
  });
});

describe('buildOpenAICompatAdapters (#2468)', () => {
  let originalUrl: string | undefined;
  let originalKey: string | undefined;

  beforeEach(() => {
    originalUrl = process.env['NEXUS_OPENAI_COMPAT_URL'];
    originalKey = process.env['NEXUS_OPENAI_COMPAT_KEY'];
    mockList.mockReset();
  });

  afterEach(() => {
    if (originalUrl === undefined) delete process.env['NEXUS_OPENAI_COMPAT_URL'];
    else process.env['NEXUS_OPENAI_COMPAT_URL'] = originalUrl;
    if (originalKey === undefined) delete process.env['NEXUS_OPENAI_COMPAT_KEY'];
    else process.env['NEXUS_OPENAI_COMPAT_KEY'] = originalKey;
  });

  it('returns null when env not configured (caller treats as "no source")', async () => {
    delete process.env['NEXUS_OPENAI_COMPAT_URL'];
    delete process.env['NEXUS_OPENAI_COMPAT_KEY'];
    const result = await buildOpenAICompatAdapters();
    expect(result).toBeNull();
  });

  it('returns one adapter per discovered model when configured', async () => {
    process.env['NEXUS_OPENAI_COMPAT_URL'] = 'https://gateway.example/v1';
    process.env['NEXUS_OPENAI_COMPAT_KEY'] = 'sk-test';
    mockList.mockResolvedValue({
      data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    });
    const result = await buildOpenAICompatAdapters();
    expect(result).not.toBeNull();
    expect(result?.ok).toBe(true);
    if (result === null) return;
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
    expect(result.value.map((a) => a.modelId)).toEqual(['a', 'b', 'c']);
  });

  it('propagates discovery errors', async () => {
    process.env['NEXUS_OPENAI_COMPAT_URL'] = 'https://gateway.example/v1';
    process.env['NEXUS_OPENAI_COMPAT_KEY'] = 'sk-test';
    mockList.mockRejectedValue(new Error('gateway down'));
    const result = await buildOpenAICompatAdapters();
    expect(result?.ok).toBe(false);
  });
});

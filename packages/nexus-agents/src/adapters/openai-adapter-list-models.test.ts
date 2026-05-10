/**
 * Tests for `OpenAIAdapter.listModels` (#2529 — `GET /v1/models` probe).
 *
 * Mocks the openai SDK at the `client.models.list` level so no real
 * HTTP requests happen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  return {
    mockCreate: vi.fn(),
    mockModelsList: vi.fn(),
  };
});

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: { create: mocks.mockCreate },
    };
    models = {
      list: mocks.mockModelsList,
    };
  },
}));

import { createOpenAIAdapter } from './openai-adapter.js';

describe('OpenAIAdapter.listModels', () => {
  beforeEach(() => {
    mocks.mockModelsList.mockReset();
  });

  it('returns normalised ModelMetadata from /v1/models', async () => {
    mocks.mockModelsList.mockResolvedValue({
      data: [
        { id: 'gpt-4o', object: 'model', created: 1715367049, owned_by: 'system' },
        {
          id: 'anthropic/claude-sonnet-4-6',
          object: 'model',
          created: 1715367050,
          owned_by: 'anthropic',
        },
      ],
    });

    const adapter = createOpenAIAdapter({ modelId: 'gpt-4o', apiKey: 'k' });
    const models = await adapter.listModels();
    expect(models).toHaveLength(2);
    expect(models[0]).toEqual({
      id: 'gpt-4o',
      ownedBy: 'system',
      createdAt: 1715367049,
    });
    expect(models[1]?.ownedBy).toBe('anthropic');
  });

  it('caches results — second call within TTL does not re-fetch', async () => {
    mocks.mockModelsList.mockResolvedValue({
      data: [{ id: 'gpt-4o', object: 'model', created: 1, owned_by: 'system' }],
    });

    const adapter = createOpenAIAdapter({ modelId: 'gpt-4o', apiKey: 'k' });
    await adapter.listModels();
    await adapter.listModels();
    expect(mocks.mockModelsList).toHaveBeenCalledTimes(1);
  });

  it('shares the in-flight promise across concurrent callers', async () => {
    let resolve: (v: unknown) => void = () => {};
    mocks.mockModelsList.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    );

    const adapter = createOpenAIAdapter({ modelId: 'gpt-4o', apiKey: 'k' });
    const a = adapter.listModels();
    const b = adapter.listModels();
    resolve({ data: [{ id: 'x', object: 'model', owned_by: 'system' }] });
    await Promise.all([a, b]);
    expect(mocks.mockModelsList).toHaveBeenCalledTimes(1);
  });

  it('throws on /v1/models error so identity resolver knows to fall back', async () => {
    mocks.mockModelsList.mockRejectedValue(new Error('endpoint not supported'));
    const adapter = createOpenAIAdapter({ modelId: 'gpt-4o', apiKey: 'k' });
    await expect(adapter.listModels()).rejects.toThrow('endpoint not supported');
  });

  it('handles models without owned_by gracefully', async () => {
    mocks.mockModelsList.mockResolvedValue({
      data: [{ id: 'mystery-model', object: 'model', created: 1234 }],
    });
    const adapter = createOpenAIAdapter({ modelId: 'gpt-4o', apiKey: 'k' });
    const models = await adapter.listModels();
    expect(models[0]).toEqual({ id: 'mystery-model', createdAt: 1234 });
  });
});

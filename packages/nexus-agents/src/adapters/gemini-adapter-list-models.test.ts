/**
 * Tests for `GeminiAdapter.listModels` (#2540 PR 5 — Google
 * `client.models.list()` probe). Mocks `@google/genai` at the
 * `client.models.list` level. The SDK returns a Pager (AsyncIterable),
 * so the mock yields rows asynchronously.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  return {
    mockGenerateContent: vi.fn(),
    mockGenerateContentStream: vi.fn(),
    mockModelsList: vi.fn(),
  };
});

function asPager<T>(items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next(): Promise<IteratorResult<T>> {
          if (i < items.length) {
            const value = items[i++];
            return Promise.resolve({ value, done: false } as IteratorResult<T>);
          }
          return Promise.resolve({ value: undefined as unknown as T, done: true });
        },
      };
    },
  };
}

vi.mock('@google/genai', () => ({
  GoogleGenAI: class MockGoogleGenAI {
    models = {
      generateContent: mocks.mockGenerateContent,
      generateContentStream: mocks.mockGenerateContentStream,
      list: mocks.mockModelsList,
    };
  },
}));

import { GeminiAdapter } from './gemini-adapter.js';

describe('GeminiAdapter.listModels (#2540)', () => {
  beforeEach(() => {
    mocks.mockModelsList.mockReset();
  });

  it('strips the `models/` prefix and tags ownedBy=google', async () => {
    mocks.mockModelsList.mockResolvedValue(
      asPager([
        {
          name: 'models/gemini-3-pro',
          displayName: 'Gemini 3 Pro',
          supportedActions: ['generateContent', 'streamGenerateContent'],
        },
        { name: 'models/gemini-3-flash' },
      ])
    );
    const adapter = new GeminiAdapter({ apiKey: 'k', modelId: 'gemini-3-pro' });
    const models = await adapter.listModels();
    expect(models).toHaveLength(2);
    expect(models[0]).toEqual({
      id: 'gemini-3-pro',
      ownedBy: 'google',
      capabilities: ['generateContent', 'streamGenerateContent'],
    });
    expect(models[1]).toEqual({ id: 'gemini-3-flash', ownedBy: 'google' });
  });

  it('caches within the 5-min TTL', async () => {
    mocks.mockModelsList.mockResolvedValue(asPager([{ name: 'models/gemini-3-pro' }]));
    const adapter = new GeminiAdapter({ apiKey: 'k', modelId: 'gemini-3-pro' });
    await adapter.listModels();
    await adapter.listModels();
    expect(mocks.mockModelsList).toHaveBeenCalledTimes(1);
  });

  it('skips rows with empty/missing names', async () => {
    mocks.mockModelsList.mockResolvedValue(asPager([{ name: '' }, { name: 'models/x' }, {}]));
    const adapter = new GeminiAdapter({ apiKey: 'k', modelId: 'gemini-3-pro' });
    const models = await adapter.listModels();
    expect(models).toEqual([{ id: 'x', ownedBy: 'google' }]);
  });

  it('throws on probe failure so identity resolver can fall back', async () => {
    mocks.mockModelsList.mockRejectedValue(new Error('quota exceeded'));
    const adapter = new GeminiAdapter({ apiKey: 'k', modelId: 'gemini-3-pro' });
    await expect(adapter.listModels()).rejects.toThrow('quota exceeded');
  });
});

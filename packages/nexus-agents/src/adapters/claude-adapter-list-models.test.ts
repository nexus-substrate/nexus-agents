/**
 * Tests for `ClaudeAdapter.listModels` (#2540 PR 5 — Anthropic
 * `client.models.list()` probe). Mocks `@anthropic-ai/sdk` at the
 * `client.models.list` level so no real HTTP requests happen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  return {
    mockCreate: vi.fn(),
    mockStream: vi.fn(),
    mockModelsList: vi.fn(),
  };
});

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = {
      create: mocks.mockCreate,
      stream: mocks.mockStream,
    };
    models = {
      list: mocks.mockModelsList,
    };
  },
}));

import { ClaudeAdapter } from './claude-adapter.js';

describe('ClaudeAdapter.listModels (#2540)', () => {
  beforeEach(() => {
    mocks.mockModelsList.mockReset();
  });

  it('normalises Anthropic model rows to ModelMetadata', async () => {
    mocks.mockModelsList.mockResolvedValue({
      data: [
        {
          id: 'claude-opus-4-7',
          type: 'model',
          display_name: 'Claude Opus 4.7',
          created_at: '2026-04-01T00:00:00Z',
        },
        {
          id: 'claude-sonnet-4-6',
          type: 'model',
          display_name: 'Claude Sonnet 4.6',
          created_at: '2026-02-01T00:00:00Z',
        },
      ],
    });
    const adapter = new ClaudeAdapter({ apiKey: 'k', modelId: 'claude-opus-4-7' });
    const models = await adapter.listModels();
    expect(models).toHaveLength(2);
    expect(models[0]?.id).toBe('claude-opus-4-7');
    expect(models[0]?.ownedBy).toBe('anthropic');
    expect(typeof models[0]?.createdAt).toBe('number');
  });

  it('caches within the 5-min TTL', async () => {
    mocks.mockModelsList.mockResolvedValue({
      data: [{ id: 'claude-opus-4-7', type: 'model' }],
    });
    const adapter = new ClaudeAdapter({ apiKey: 'k', modelId: 'claude-opus-4-7' });
    await adapter.listModels();
    await adapter.listModels();
    expect(mocks.mockModelsList).toHaveBeenCalledTimes(1);
  });

  it('shares the in-flight promise across concurrent callers', async () => {
    let resolveFn: (v: unknown) => void = () => {};
    mocks.mockModelsList.mockImplementation(
      () =>
        new Promise((r) => {
          resolveFn = r;
        })
    );
    const adapter = new ClaudeAdapter({ apiKey: 'k', modelId: 'claude-opus-4-7' });
    const a = adapter.listModels();
    const b = adapter.listModels();
    resolveFn({ data: [{ id: 'claude-opus-4-7', type: 'model' }] });
    await Promise.all([a, b]);
    expect(mocks.mockModelsList).toHaveBeenCalledTimes(1);
  });

  it('throws on probe failure so identity resolver can fall back', async () => {
    mocks.mockModelsList.mockRejectedValue(new Error('unauthorized'));
    const adapter = new ClaudeAdapter({ apiKey: 'k', modelId: 'claude-opus-4-7' });
    await expect(adapter.listModels()).rejects.toThrow('unauthorized');
  });
});

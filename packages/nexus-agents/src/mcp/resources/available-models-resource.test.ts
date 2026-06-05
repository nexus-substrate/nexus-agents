/**
 * Tests for the available-models resource payload (#3406).
 */
import { describe, it, expect } from 'vitest';

import { buildAvailableModelsPayload } from './available-models-resource.js';
import { AvailableModelsCache } from '../../config/available-models-cache.js';

describe('buildAvailableModelsPayload (#3406)', () => {
  it('returns an empty payload when nothing is discovered', async () => {
    const cache = new AvailableModelsCache({ sources: [] });
    const payload = (await buildAvailableModelsPayload(cache)) as {
      total: number;
      sources: unknown[];
    };
    expect(payload.total).toBe(0);
    expect(payload.sources).toEqual([]);
  });

  it('groups discovered models by source', async () => {
    const cache = new AvailableModelsCache({
      sources: [
        { name: 'openrouter', listModels: () => Promise.resolve([{ id: 'a' }, { id: 'b' }]) },
        { name: 'claude', listModels: () => Promise.resolve([{ id: 'claude-x' }]) },
      ],
    });
    const payload = (await buildAvailableModelsPayload(cache)) as {
      total: number;
      sources: { source: string; modelCount: number; ids: string[] }[];
    };
    expect(payload.total).toBe(3);
    const or = payload.sources.find((s) => s.source === 'openrouter');
    expect(or?.modelCount).toBe(2);
    expect(or?.ids).toEqual(['a', 'b']);
    expect(payload.sources.find((s) => s.source === 'claude')?.ids).toEqual(['claude-x']);
  });
});

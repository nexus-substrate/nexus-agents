/**
 * Tests for the OpenRouter live-catalog source (#3404).
 */
import { describe, it, expect, vi } from 'vitest';

import { createOpenRouterModelsSource } from './openrouter-models-source.js';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

describe('createOpenRouterModelsSource (#3404)', () => {
  it('returns the catalog ids on a valid response', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          data: [{ id: 'qwen/qwen3-coder:free' }, { id: 'nvidia/nemotron-nano-9b-v2:free' }],
        })
      )
    ) as unknown as typeof fetch;
    const src = createOpenRouterModelsSource({ fetchImpl });
    expect(src.name).toBe('openrouter');
    const ids = await src.listModels();
    expect(ids.map((m) => m.id)).toEqual([
      'qwen/qwen3-coder:free',
      'nvidia/nemotron-nano-9b-v2:free',
    ]);
  });

  it('fails open (empty) on a non-OK status', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(jsonResponse({}, false, 503))
    ) as unknown as typeof fetch;
    const src = createOpenRouterModelsSource({ fetchImpl });
    expect(await src.listModels()).toEqual([]);
  });

  it('fails open (empty) on a network/timeout error', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error('aborted'))) as unknown as typeof fetch;
    const src = createOpenRouterModelsSource({ fetchImpl });
    expect(await src.listModels()).toEqual([]);
  });

  it('fails open (empty) on a schema-invalid payload (untrusted input)', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(jsonResponse({ data: [{ notId: 1 }, 'garbage'] }))
    ) as unknown as typeof fetch;
    const src = createOpenRouterModelsSource({ fetchImpl });
    expect(await src.listModels()).toEqual([]);
  });

  it('fails open (empty) when the body exceeds the byte cap', async () => {
    const huge = 'x'.repeat(8_000_001);
    const fetchImpl = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(huge),
      } as unknown as Response)
    ) as unknown as typeof fetch;
    const src = createOpenRouterModelsSource({ fetchImpl });
    expect(await src.listModels()).toEqual([]);
  });

  it('caps the number of returned ids', async () => {
    const data = Array.from({ length: 6000 }, (_, i) => ({ id: `m-${String(i)}` }));
    const fetchImpl = vi.fn(() =>
      Promise.resolve(jsonResponse({ data }))
    ) as unknown as typeof fetch;
    const src = createOpenRouterModelsSource({ fetchImpl });
    const ids = await src.listModels();
    expect(ids.length).toBe(5000);
  });
});

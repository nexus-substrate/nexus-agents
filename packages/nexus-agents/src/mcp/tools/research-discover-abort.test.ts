/**
 * `executeDiscovery` forwards its abort signal to the source fetches and stops
 * the source fan-out on it (#6747).
 *
 * Runs the REAL discovery path down to `fetch`, which is stubbed: the seam
 * under test is the signal crossing executeDiscovery → queryAllSources →
 * discover* → fetchSource → fetch.
 *
 * @module mcp/tools/research-discover-abort.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeDiscovery, ResearchDiscoverInputSchema } from './research-discover.js';
import { AbortError } from '../../adapters/abort-utils.js';
import { createLogger } from '../../core/index.js';

const logger = createLogger({ component: 'research-discover-abort-test' });
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A fetch that stays pending until its request signal aborts. */
function pendingUntilAborted(_url: string, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const signal = init?.signal;
    if (signal?.aborted === true) {
      reject(new Error('aborted'));
      return;
    }
    signal?.addEventListener('abort', () => {
      reject(new Error('aborted'));
    });
  });
}

describe('executeDiscovery and the abort signal (#6747)', () => {
  it('aborts the fetch in flight and queries no further source', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const pending = pendingUntilAborted(url, init);
      controller.abort('cancel_job');
      return pending;
    });
    const input = ResearchDiscoverInputSchema.parse({ topic: 'agent orchestration' });
    expect(input.source).toBe('all');

    await expect(executeDiscovery(input, logger, controller.signal)).rejects.toBeInstanceOf(
      AbortError
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal?.aborted).toBe(true);
  });

  it('without a signal, queries every source as before', async () => {
    fetchMock.mockResolvedValue(new Response('<feed></feed>', { status: 200 }));
    const input = ResearchDiscoverInputSchema.parse({ topic: 'agent orchestration' });

    await executeDiscovery(input, logger);

    // arxiv, github, and the three independent sources.
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(5);
  });
});

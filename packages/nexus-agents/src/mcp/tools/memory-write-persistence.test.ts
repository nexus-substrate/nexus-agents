/**
 * `memory_write` must report what actually persisted (#4997).
 *
 * Drives the callback the tool really registers, with a controllable
 * ToolMemory, so the assertions are about the response a caller receives
 * rather than about a mock the test itself configured.
 *
 * @module mcp/tools/memory-write-persistence.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { registerMemoryWriteTool } from './memory-write.js';
import { RateLimiter } from '../middleware/rate-limiter.js';

const memory = {
  recordKnowledge: vi.fn(),
  recordBelief: vi.fn(),
  storeAdaptive: vi.fn(),
  storeTyped: vi.fn(),
  recordLearning: vi.fn(),
  getBeliefCount: vi.fn(() => 0),
  isAgenticMemoryAvailable: vi.fn(() => true),
  isAdaptiveMemoryAvailable: vi.fn(() => true),
  isTypedMemoryAvailable: vi.fn(() => true),
  // #5438: the backends start non-blocking, so the write path awaits them
  // before any availability guard runs. Absent from this mock the await throws
  // and the production catch swallows it — the fix would be untested while
  // every assertion still passed.
  awaitBackendInitialization: vi.fn((): Promise<void> => Promise.resolve()),
};

vi.mock('./tool-memory.js', () => ({
  getToolMemory: () => memory,
}));

type SdkCallback = (args: unknown) => Promise<{ content: readonly { text: string }[] }>;

async function callMemoryWrite(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  let registered: SdkCallback | undefined;
  const server = {
    registerTool: (_name: string, _config: unknown, callback: SdkCallback): void => {
      registered = callback;
    },
  };
  registerMemoryWriteTool(server as never, {
    rateLimiter: new RateLimiter({ capacity: 100, refillRate: 100 }),
  });
  if (registered === undefined) throw new Error('memory_write registered no callback');
  const result = await registered(args);
  return JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
}

describe('memory_write reports persistence, not intent (#4997)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memory.isAgenticMemoryAvailable.mockReturnValue(true);
    memory.getBeliefCount.mockReturnValue(0);
    memory.awaitBackendInitialization.mockImplementation((): Promise<void> => Promise.resolve());
  });

  it('waits for in-flight initialization before refusing a write (#5438)', async () => {
    // The most damaging instance of the race: this path does not merely
    // misreport, it DROPS the write and blames SQLite. Reproduced live on
    // memory_stats — five backends reported absent, then all five present 55s
    // later with 519 entries already stored.
    memory.isAgenticMemoryAvailable.mockReturnValue(false);
    memory.awaitBackendInitialization.mockImplementation((): Promise<void> => {
      memory.isAgenticMemoryAvailable.mockReturnValue(true);
      return Promise.resolve();
    });
    memory.recordKnowledge.mockResolvedValue({ persisted: true });

    const body = await callMemoryWrite({ key: 'k', content: 'v', backend: 'agentic' });

    expect(memory.awaitBackendInitialization).toHaveBeenCalled();
    expect(body['success']).toBe(true);
    expect(memory.recordKnowledge).toHaveBeenCalled();
  });

  it('still refuses when initialization finished and the backend is genuinely absent', async () => {
    // The pair, so the await cannot become a blanket "always available".
    // A distinct key: an identical repeat hits the content-hash dedup (#1455)
    // and returns before dispatch, so the await would never run and the
    // assertion below would fail for the wrong reason.
    memory.isAgenticMemoryAvailable.mockReturnValue(false);

    const body = await callMemoryWrite({
      key: 'genuinely-absent',
      content: 'v2',
      backend: 'agentic',
    });

    expect(memory.awaitBackendInitialization).toHaveBeenCalled();
    expect(body['success']).toBe(false);
    expect(String(body['error'])).toContain('unavailable');
    expect(memory.recordKnowledge).not.toHaveBeenCalled();
  });

  it('reports failure when the backend rejected the write', async () => {
    // The store helpers used to return `void`, logging a rejected Result at
    // debug — so the tool had nothing to inspect and said `success: true` for
    // a write that never landed. A configured backend whose SQLite file has
    // gone read-only is the realistic case.
    memory.recordKnowledge.mockResolvedValue({ persisted: false, reason: 'disk is read-only' });

    const body = await callMemoryWrite({
      key: 'k',
      content: 'some knowledge',
      backend: 'agentic',
    });

    expect(body['success']).toBe(false);
    expect(String(body['error'])).toContain('read-only');
  });

  it('reports success when the backend persisted', async () => {
    // The pair: a hardcoded `success: false` would pass the test above.
    memory.recordKnowledge.mockResolvedValue({ persisted: true });

    const body = await callMemoryWrite({ key: 'k2', content: 'c2', backend: 'agentic' });

    expect(body['success']).toBe(true);
  });

  it('does not treat a retry after a failed write as already stored', async () => {
    // The dedup cache recorded intent: it was populated BEFORE dispatch, so a
    // failed write poisoned it and the identical retry came back
    // `success: true, deduplicated: true` — asserting content was stored that
    // nothing had ever stored.
    memory.recordKnowledge.mockResolvedValueOnce({ persisted: false, reason: 'backend down' });
    const first = await callMemoryWrite({ key: 'retry', content: 'c', backend: 'agentic' });
    expect(first['success']).toBe(false);

    memory.recordKnowledge.mockResolvedValueOnce({ persisted: true });
    const second = await callMemoryWrite({ key: 'retry', content: 'c', backend: 'agentic' });

    expect(second['success']).toBe(true);
    expect(second).not.toHaveProperty('deduplicated');
    expect(memory.recordKnowledge).toHaveBeenCalledTimes(2);
  });

  it('does not dedup across different backends', async () => {
    // The cache key was `${key}::${content.slice(0, 100)}` — no backend. So
    // writing the same content to `agentic` and then `typed` reported the
    // second as already stored while the typed store never received it.
    memory.recordKnowledge.mockResolvedValue({ persisted: true });
    memory.storeTyped.mockResolvedValue({ persisted: true });

    await callMemoryWrite({ key: 'shared', content: 'same text', backend: 'agentic' });
    const second = await callMemoryWrite({ key: 'shared', content: 'same text', backend: 'typed' });

    expect(second).not.toHaveProperty('deduplicated');
    expect(memory.storeTyped).toHaveBeenCalledTimes(1);
  });

  it('still dedups a genuine repeat to the same backend', async () => {
    // Guard the guard: the fixes above must not disable deduplication.
    memory.recordKnowledge.mockResolvedValue({ persisted: true });

    await callMemoryWrite({ key: 'dup', content: 'same text', backend: 'agentic' });
    const second = await callMemoryWrite({ key: 'dup', content: 'same text', backend: 'agentic' });

    expect(second['deduplicated']).toBe(true);
    expect(memory.recordKnowledge).toHaveBeenCalledTimes(1);
  });
});

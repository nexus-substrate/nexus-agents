/**
 * `memory_write` redacts credentials and records the content's trust tier
 * (#6751 hardening).
 *
 * Drives the callback the tool really registers, with a controllable
 * ToolMemory, so the assertions are about what reaches the store.
 *
 * @module mcp/tools/memory-write-provenance.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { memory, measured } = vi.hoisted(() => ({
  memory: {
    recordKnowledge: vi.fn(),
    recordBelief: vi.fn(),
    storeAdaptive: vi.fn(),
    storeTyped: vi.fn(),
    recordLearning: vi.fn(),
    getBeliefCount: vi.fn(() => 0),
    isAgenticMemoryAvailable: vi.fn(() => true),
    isAdaptiveMemoryAvailable: vi.fn(() => true),
    isTypedMemoryAvailable: vi.fn(() => true),
    awaitBackendInitialization: vi.fn((): Promise<void> => Promise.resolve()),
  },
  measured: { tier: undefined as string | undefined },
}));

vi.mock('./tool-memory.js', () => ({
  getToolMemory: () => memory,
}));

// Called without a connected server, the request tier is the unmeasured
// fallback. Controlling the measured tier here lets the test state a caller
// tier explicitly (a stdio server measures '1', #6795).
vi.mock('../middleware/request-context.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../middleware/request-context.js')>()),
  measuredTrustTier: () => measured.tier,
}));

import { registerMemoryWriteTool } from './memory-write.js';
import { RateLimiter } from '../middleware/rate-limiter.js';
import { summarizeContextForPrompt, type UnifiedContext } from '../../context/context-retriever.js';
import { MemoryImportance } from '../../context/memory-backend-types.js';

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
  const text = result.content[0]?.text ?? '{}';
  // Validation errors come back as plain text, not JSON.
  if (!text.startsWith('{')) return { rawError: text };
  return JSON.parse(text) as Record<string, unknown>;
}

let seq = 0;
/** A unique key per call so the session dedup cache never short-circuits a write. */
function uniqueKey(): string {
  seq += 1;
  return `provenance-${String(seq)}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  measured.tier = undefined;
  memory.recordKnowledge.mockResolvedValue({ persisted: true });
  memory.recordBelief.mockResolvedValue({ persisted: true });
  memory.storeAdaptive.mockResolvedValue({ persisted: true });
  memory.storeTyped.mockResolvedValue({ persisted: true });
  memory.recordLearning.mockReturnValue({ persisted: true });
});

describe('memory_write redacts credentials before storing (#6751)', () => {
  it('stores the content with credential values replaced', async () => {
    const secretValue = 'not-a-real-value-0123456789';
    const body = await callMemoryWrite({
      key: uniqueKey(),
      content: `deploy notes: password=${secretValue} and Authorization: Bearer ${secretValue}`,
      backend: 'adaptive',
    });

    expect(body['success']).toBe(true);
    const stored = String(memory.storeAdaptive.mock.calls[0]?.[1]);
    expect(stored).toContain('deploy notes');
    expect(stored).not.toContain(secretValue);
  });

  it('leaves content without credentials unchanged', async () => {
    await callMemoryWrite({ key: uniqueKey(), content: 'plain fact', backend: 'adaptive' });
    expect(memory.storeAdaptive.mock.calls[0]?.[1]).toBe('plain fact');
  });
});

describe('memory_write records the content trust tier (#6751)', () => {
  it('stores an undeclared write from a tier-1 caller as tier 3 (#6795)', async () => {
    // Unknown provenance is untrusted however trusted the caller.
    measured.tier = '1';
    await callMemoryWrite({ key: uniqueKey(), content: 'pasted text', backend: 'belief' });
    expect(memory.recordBelief.mock.calls[0]?.[4]).toBe('3');
  });

  it('keeps tier 1 for content a tier-1 caller declares as its own (#6795)', async () => {
    measured.tier = '1';
    await callMemoryWrite({
      key: uniqueKey(),
      content: 'caller fact',
      backend: 'belief',
      sourceTrustTier: '1',
    });
    expect(memory.recordBelief.mock.calls[0]?.[4]).toBe('1');
  });

  it('clamps a declaration above the caller tier to the caller tier (#6795)', async () => {
    measured.tier = '2';
    await callMemoryWrite({
      key: uniqueKey(),
      content: 'caller fact',
      backend: 'belief',
      sourceTrustTier: '1',
    });
    expect(memory.recordBelief.mock.calls[0]?.[4]).toBe('2');
  });

  it('keeps a declared tier for an unmeasured caller, unchanged by #6795', async () => {
    await callMemoryWrite({
      key: uniqueKey(),
      content: 'declared fact',
      backend: 'belief',
      sourceTrustTier: '1',
    });
    expect(memory.recordBelief.mock.calls[0]?.[4]).toBe('1');
  });

  it('records the external source tier when the content is flagged as external', async () => {
    measured.tier = '1';
    await callMemoryWrite({
      key: uniqueKey(),
      content: 'fetched fact',
      backend: 'adaptive',
      sourceTrustTier: '3',
    });
    expect(memory.storeAdaptive.mock.calls[0]?.[3]).toBe('3');
  });

  it('tags agentic entries with the tier', async () => {
    await callMemoryWrite({
      key: uniqueKey(),
      content: 'fetched knowledge',
      backend: 'agentic',
      sourceTrustTier: '3',
    });
    const metadata = memory.recordKnowledge.mock.calls[0]?.[2] as { tags: string[] };
    expect(metadata.tags).toContain('trust-tier:3');
  });

  it('never records the unmeasured caller fallback as a tier', async () => {
    await callMemoryWrite({ key: uniqueKey(), content: 'unlabelled fact', backend: 'typed' });
    expect(memory.storeTyped).toHaveBeenCalledTimes(1);
    expect(memory.storeTyped.mock.calls[0]?.[3]).toBeUndefined();
  });

  it('keeps an undeclared tier-1 write out of privileged prompts unless allowed (#6795)', async () => {
    measured.tier = '1';
    await callMemoryWrite({ key: uniqueKey(), content: 'pasted issue text', backend: 'agentic' });
    const { tags } = memory.recordKnowledge.mock.calls[0]?.[2] as { tags: string[] };
    expect(tags).toContain('trust-tier:3');

    // Feed the entry exactly as stored into the prompt-prefix renderer.
    const entry: UnifiedContext['recentLearnings'][number] = {
      entry: {
        key: 'k',
        value: 'pasted issue text',
        metadata: { importance: MemoryImportance.MEDIUM, tags },
        createdAt: new Date('2026-06-01'),
        accessedAt: new Date('2026-06-01'),
      },
      priority: { score: 0.5, components: { recency: 0.5, importance: 0.5, relevance: 0.5 } },
    };
    const ctx: UnifiedContext = {
      beliefs: [],
      similarMemories: [],
      recentLearnings: [entry],
      experiencePatterns: [],
      outcomes: null,
      priorStrategies: [],
      researchInsights: [],
      rankedMemories: [],
    };
    const previousRanked = process.env['NEXUS_CONTEXT_RANKED'];
    delete process.env['NEXUS_CONTEXT_RANKED'];
    try {
      expect(summarizeContextForPrompt(ctx)).not.toContain('pasted issue text');
      expect(summarizeContextForPrompt(ctx, undefined, { allowUntrustedMemory: true })).toContain(
        '[tier 3] pasted issue text'
      );
    } finally {
      if (previousRanked !== undefined) process.env['NEXUS_CONTEXT_RANKED'] = previousRanked;
    }
  });

  it('carries the tier on session learnings', async () => {
    measured.tier = '2';
    await callMemoryWrite({
      key: uniqueKey(),
      content: 'session fact',
      backend: 'session',
      sourceTrustTier: '2',
    });
    const learning = memory.recordLearning.mock.calls[0]?.[0] as { trustTier?: string };
    expect(learning.trustTier).toBe('2');
  });

  it('rejects a source tier outside the tier scale', async () => {
    const body = await callMemoryWrite({
      key: uniqueKey(),
      content: 'x',
      backend: 'adaptive',
      sourceTrustTier: '5',
    });
    expect(String(body['rawError'])).toContain('Validation error');
    expect(memory.storeAdaptive).not.toHaveBeenCalled();
  });
});

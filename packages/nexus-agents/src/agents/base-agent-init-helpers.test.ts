/**
 * Tests for BaseAgent Initialization Helpers
 * @module agents/base-agent-init-helpers.test
 */

import { describe, it, expect, vi } from 'vitest';
import {
  validateNotInitialized,
  loadMemoryOnInit,
  performInitialization,
} from './base-agent-init-helpers.js';
import type { InitializationContext } from './base-agent-init-helpers.js';

vi.mock('./base-agent-memory-init.js', () => ({
  loadMemoryState: vi.fn(() =>
    Promise.resolve({ ok: true, value: { agentId: 'a1', role: 'code_expert' } })
  ),
  loadRelevantTypedMemories: vi.fn(() =>
    Promise.resolve({ ok: true, value: [{ id: 'm1', content: 'test' }] })
  ),
}));

// ============================================================================
// Test Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockLogger() {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeInitCtx(overrides: Partial<InitializationContext> = {}): InitializationContext {
  return {
    agentId: 'agent-1',
    role: 'code_expert',
    initialized: false,
    memoryEnabled: true,
    memoryBackend: { get: vi.fn(), set: vi.fn(), delete: vi.fn(), list: vi.fn() } as never,
    typedMemory: { get: vi.fn(), query: vi.fn() } as never,
    maxInitialLoadEntries: 10,
    autoLoadOnInit: true,
    logger: makeMockLogger() as never,
    ...overrides,
  };
}

// ============================================================================
// validateNotInitialized
// ============================================================================

describe('validateNotInitialized', () => {
  it('returns ok when not initialized', () => {
    const result = validateNotInitialized('agent-1', false);
    expect(result.ok).toBe(true);
  });

  it('returns err when already initialized', () => {
    const result = validateNotInitialized('agent-1', true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('already initialized');
    }
  });
});

// ============================================================================
// loadMemoryOnInit
// ============================================================================

describe('loadMemoryOnInit', () => {
  it('loads memory state from backend', async () => {
    const ctx = makeInitCtx();
    const result = await loadMemoryOnInit(ctx);
    expect(result.memoryState).toBeDefined();
    expect(result.memoryState).toEqual({ agentId: 'a1', role: 'code_expert' });
  });

  it('loads relevant typed memories', async () => {
    const ctx = makeInitCtx();
    const result = await loadMemoryOnInit(ctx);
    expect(result.relevantMemories).toEqual([{ id: 'm1', content: 'test' }]);
  });

  it('returns null state when no memory backend', async () => {
    const ctx = makeInitCtx({ memoryBackend: undefined });
    const result = await loadMemoryOnInit(ctx);
    expect(result.memoryState).toBeNull();
  });

  it('returns empty memories when no typed memory', async () => {
    const ctx = makeInitCtx({ typedMemory: undefined });
    const result = await loadMemoryOnInit(ctx);
    expect(result.relevantMemories).toEqual([]);
  });

  it('returns null state and empty memories when both undefined', async () => {
    const ctx = makeInitCtx({ memoryBackend: undefined, typedMemory: undefined });
    const result = await loadMemoryOnInit(ctx);
    expect(result.memoryState).toBeNull();
    expect(result.relevantMemories).toEqual([]);
  });
});

// ============================================================================
// performInitialization
// ============================================================================

describe('performInitialization', () => {
  it('returns err if already initialized', async () => {
    const ctx = makeInitCtx({ initialized: true });
    const agentCtx = { config: { modelId: 'test' }, tools: [] } as never;
    const result = await performInitialization(ctx, agentCtx);
    expect(result.ok).toBe(false);
  });

  it('returns ok with memory state when memory enabled', async () => {
    const ctx = makeInitCtx();
    const agentCtx = { config: { modelId: 'test' }, tools: [] } as never;
    const result = await performInitialization(ctx, agentCtx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.memoryState).toBeDefined();
    }
  });

  it('skips memory load when memory disabled', async () => {
    const ctx = makeInitCtx({ memoryEnabled: false });
    const agentCtx = { config: { modelId: 'test' }, tools: [] } as never;
    const result = await performInitialization(ctx, agentCtx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.memoryState).toBeNull();
      expect(result.value.relevantMemories).toEqual([]);
    }
  });

  it('skips memory load when autoLoadOnInit is false', async () => {
    const ctx = makeInitCtx({ autoLoadOnInit: false });
    const agentCtx = { config: { modelId: 'test' }, tools: [] } as never;
    const result = await performInitialization(ctx, agentCtx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.memoryState).toBeNull();
    }
  });

  it('logs initialization info', async () => {
    const logger = makeMockLogger();
    const ctx = makeInitCtx({ logger: logger as never });
    const agentCtx = { config: { modelId: 'test-model' }, tools: ['tool1'] } as never;
    await performInitialization(ctx, agentCtx);
    expect(logger.info).toHaveBeenCalledWith(
      'Initializing agent',
      expect.objectContaining({ modelId: 'test-model', hasTools: true })
    );
  });
});

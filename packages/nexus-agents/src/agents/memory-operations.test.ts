/**
 * Tests for memory-operations.ts
 *
 * Covers persistMemoryState, loadMemoryState, and loadRelevantTypedMemories.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ILogger } from '../core/index.js';
import type { IMemoryBackend } from '../context/memory-backend-types.js';
import { MemoryError } from '../context/memory-backend-types.js';
import type { ITypedMemory, TypedMemoryEntry } from '../context/memory-types.js';
import { MemoryImportance } from '../context/memory-backend-types.js';
import type { AgentMemoryState } from './memory-state-types.js';
import { AgentMemoryError } from './memory-state-types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../core/index.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    getTimeProvider: () => ({ now: () => 1700000000000 }),
  };
});

vi.mock('./memory-state-types.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./memory-state-types.js')>();
  return {
    ...original,
    createInitialMemoryState: vi.fn((agentId: string, role: string) => ({
      agentId,
      role,
      persistedAt: new Date(1700000000000),
      taskLearnings: [],
      executionPatterns: [],
      errorResolutions: [],
    })),
  };
});

vi.mock('./memory-keys.js', () => ({
  getAgentStateKey: vi.fn((id: string) => `agent-state:${id}`),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockBackend(): IMemoryBackend {
  const mock = {
    store: vi.fn(() => Promise.resolve({ ok: true, value: undefined })),
    retrieve: vi.fn(() => Promise.resolve({ ok: true, value: {} })),
    search: vi.fn(() => Promise.resolve({ ok: true, value: [] })),
    prune: vi.fn(() => Promise.resolve({ ok: true, value: 0 })),
  } as unknown as IMemoryBackend;
  return mock;
}

function createMockLogger(): ILogger {
  const mock = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as ILogger;
  return mock;
}

function createMockState(overrides?: Partial<AgentMemoryState>): AgentMemoryState {
  return {
    agentId: 'agent-1',
    role: 'code_expert',
    persistedAt: new Date(1700000000000),
    taskLearnings: [],
    executionPatterns: [],
    errorResolutions: [],
    ...overrides,
  } as unknown as AgentMemoryState;
}

function createMockTypedMemory(
  result: { ok: true; value: readonly TypedMemoryEntry[] } | { ok: false; error: MemoryError }
): ITypedMemory {
  return {
    filterByRelevance: vi.fn(() => Promise.resolve(result)),
  } as unknown as ITypedMemory;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Import after mocks are defined
const { persistMemoryState, loadMemoryState, loadRelevantTypedMemories } =
  await import('./memory-operations.js');

afterEach(() => {
  vi.clearAllMocks();
});

describe('persistMemoryState', () => {
  it('should store state to backend and return ok', async () => {
    const backend = createMockBackend();
    const logger = createMockLogger();
    const state = createMockState();

    const result = await persistMemoryState(backend, state, logger);

    expect(result.ok).toBe(true);
    expect(backend.store).toHaveBeenCalledOnce();
    expect(backend.store).toHaveBeenCalledWith(
      'agent-state:agent-1',
      expect.objectContaining({ agentId: 'agent-1', role: 'code_expert' }),
      expect.objectContaining({
        importance: MemoryImportance.HIGH,
        tags: ['agent-state', 'code_expert'],
      })
    );
  });

  it('should return error when backend.store fails', async () => {
    const storeError = new MemoryError('disk full');
    const backend = createMockBackend();
    (backend.store as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      error: storeError,
    });
    const logger = createMockLogger();
    const state = createMockState();

    const result = await persistMemoryState(backend, state, logger);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(AgentMemoryError);
      expect(result.error.message).toBe('Failed to persist memory state');
    }
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('should log debug on success', async () => {
    const backend = createMockBackend();
    const logger = createMockLogger();
    const state = createMockState({
      taskLearnings: [
        { id: 'l1', taskType: 'code', insight: 'test', confidence: 0.9, learnedAt: new Date() },
      ],
    } as unknown as Partial<AgentMemoryState>);

    await persistMemoryState(backend, state, logger);

    expect(logger.debug).toHaveBeenCalledWith(
      'Persisted agent memory state',
      expect.objectContaining({
        agentId: 'agent-1',
        learningsCount: 1,
        patternsCount: 0,
        errorsCount: 0,
      })
    );
  });
});

describe('loadMemoryState', () => {
  it('should return loaded state when backend.retrieve succeeds', async () => {
    const backend = createMockBackend();
    const storedState = {
      agentId: 'agent-2',
      role: 'security_expert',
      persistedAt: new Date(1700000000000),
      taskLearnings: [
        { id: 'l1', taskType: 'sec', insight: 'finding', confidence: 0.8, learnedAt: new Date() },
      ],
      executionPatterns: [],
      errorResolutions: [],
    };
    (backend.retrieve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      value: storedState,
    });
    const logger = createMockLogger();

    const result = await loadMemoryState(backend, 'agent-2', 'security_expert', logger);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.agentId).toBe('agent-2');
      expect(result.value.role).toBe('security_expert');
      expect(result.value.taskLearnings).toHaveLength(1);
    }
  });

  it('should return fresh state when backend.retrieve fails', async () => {
    const backend = createMockBackend();
    (backend.retrieve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      error: new MemoryError('not found'),
    });
    const logger = createMockLogger();

    const result = await loadMemoryState(backend, 'agent-3', 'code_expert', logger);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.agentId).toBe('agent-3');
      expect(result.value.role).toBe('code_expert');
      expect(result.value.taskLearnings).toEqual([]);
      expect(result.value.executionPatterns).toEqual([]);
      expect(result.value.errorResolutions).toEqual([]);
    }
    expect(logger.debug).toHaveBeenCalledWith(
      'No existing memory state found, creating fresh state',
      expect.objectContaining({ agentId: 'agent-3' })
    );
  });

  it('should return fresh state when loaded data is null', async () => {
    const backend = createMockBackend();
    (backend.retrieve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      value: null,
    });
    const logger = createMockLogger();

    const result = await loadMemoryState(backend, 'agent-4', 'testing_expert', logger);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.agentId).toBe('agent-4');
      expect(result.value.role).toBe('testing_expert');
      expect(result.value.taskLearnings).toEqual([]);
    }
    expect(logger.warn).toHaveBeenCalledWith(
      'Invalid memory state format, creating fresh state',
      expect.objectContaining({ agentId: 'agent-4' })
    );
  });

  it('should fill defaults for missing arrays in partial state', async () => {
    const backend = createMockBackend();
    // Return a partial object missing taskLearnings and executionPatterns
    (backend.retrieve as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      value: { agentId: 'agent-5', role: 'architecture_expert' },
    });
    const logger = createMockLogger();

    const result = await loadMemoryState(backend, 'agent-5', 'architecture_expert', logger);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.agentId).toBe('agent-5');
      expect(result.value.role).toBe('architecture_expert');
      expect(result.value.taskLearnings).toEqual([]);
      expect(result.value.executionPatterns).toEqual([]);
      expect(result.value.errorResolutions).toEqual([]);
    }
  });
});

describe('loadRelevantTypedMemories', () => {
  it('should return memories on success', async () => {
    const entries: TypedMemoryEntry[] = [
      {
        id: 'mem-1',
        type: 'core',
        key: 'test-key',
        value: { data: 'test' },
        metadata: { importance: MemoryImportance.HIGH },
        createdAt: new Date(),
        accessedAt: new Date(),
      } as unknown as TypedMemoryEntry,
    ];
    const typedMemory = createMockTypedMemory({ ok: true, value: entries });
    const logger = createMockLogger();

    const result = await loadRelevantTypedMemories(typedMemory, 'code_expert', 10, logger);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].id).toBe('mem-1');
    }
    expect(typedMemory.filterByRelevance).toHaveBeenCalledWith('code_expert', 10);
  });

  it('should return error on failure', async () => {
    const memError = new MemoryError('backend unavailable');
    const typedMemory = createMockTypedMemory({ ok: false, error: memError });
    const logger = createMockLogger();

    const result = await loadRelevantTypedMemories(typedMemory, 'security_expert', 5, logger);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(MemoryError);
      expect(result.error.message).toBe('backend unavailable');
    }
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to load relevant typed memories',
      expect.objectContaining({ role: 'security_expert' })
    );
  });

  it('should log loaded types on success', async () => {
    const entries: TypedMemoryEntry[] = [
      {
        id: 'mem-1',
        type: 'core',
        key: 'k1',
        value: null,
        metadata: { importance: MemoryImportance.MEDIUM },
        createdAt: new Date(),
        accessedAt: new Date(),
      } as unknown as TypedMemoryEntry,
      {
        id: 'mem-2',
        type: 'episodic',
        key: 'k2',
        value: null,
        metadata: { importance: MemoryImportance.LOW },
        createdAt: new Date(),
        accessedAt: new Date(),
      } as unknown as TypedMemoryEntry,
    ];
    const typedMemory = createMockTypedMemory({ ok: true, value: entries });
    const logger = createMockLogger();

    await loadRelevantTypedMemories(typedMemory, 'documentation_expert', 20, logger);

    expect(logger.debug).toHaveBeenCalledWith(
      'Loaded relevant typed memories',
      expect.objectContaining({
        role: 'documentation_expert',
        count: 2,
        types: expect.arrayContaining(['core', 'episodic']),
      })
    );
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { initializeMemoryInfrastructure } from './base-agent-memory-init.js';
import type { ILogger } from '../core/index.js';
import type { MemoryInitOptions } from './memory-state-types.js';

vi.mock('./memory-state-types.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./memory-state-types.js')>();
  return {
    ...original,
    createInitialMemoryState: vi.fn((agentId: string, role: string) => ({
      agentId,
      role,
      persistedAt: new Date(),
      taskLearnings: [],
      executionPatterns: [],
      errorResolutions: [],
    })),
  };
});

function createMockLogger(): ILogger {
  const mock = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as ILogger;
  return mock;
}

function createOptions(overrides: Partial<MemoryInitOptions> = {}): MemoryInitOptions {
  const opts = {
    agentId: 'test-agent',
    role: 'code_expert' as const,
    logger: createMockLogger(),
    ...overrides,
  } as unknown as MemoryInitOptions;
  return opts;
}

describe('initializeMemoryInfrastructure', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return disabled when config.enabled is false', () => {
    const result = initializeMemoryInfrastructure(createOptions({ config: { enabled: false } }));
    expect(result.memoryEnabled).toBe(false);
    expect(result.state).toBeNull();
  });

  it('should return disabled when no backend provided', () => {
    const logger = createMockLogger();
    const result = initializeMemoryInfrastructure(
      createOptions({ config: { enabled: true }, logger })
    );
    expect(result.memoryEnabled).toBe(false);
    expect(result.state).toBeNull();
  });

  it('should warn when enabled but no backend', () => {
    const logger = createMockLogger();
    initializeMemoryInfrastructure(createOptions({ config: { enabled: true }, logger }));
    expect(logger.warn).toHaveBeenCalledWith(
      'Memory enabled but no backend provided',
      expect.objectContaining({ agentId: 'test-agent' })
    );
  });

  it('should return enabled when backend provided', () => {
    const mockBackend = { store: vi.fn(), retrieve: vi.fn() };
    const result = initializeMemoryInfrastructure(
      createOptions({
        config: { enabled: true, backend: mockBackend as never },
      })
    );
    expect(result.memoryEnabled).toBe(true);
    expect(result.state).not.toBeNull();
  });

  it('should return enabled when typedMemory provided', () => {
    const mockTypedMemory = { filterByRelevance: vi.fn() };
    const result = initializeMemoryInfrastructure(
      createOptions({
        config: { enabled: true, typedMemory: mockTypedMemory as never },
      })
    );
    expect(result.memoryEnabled).toBe(true);
  });

  it('should create initial state with agent id and role', () => {
    const mockBackend = { store: vi.fn(), retrieve: vi.fn() };
    const result = initializeMemoryInfrastructure(
      createOptions({
        agentId: 'my-agent',
        role: 'security_expert' as never,
        config: { enabled: true, backend: mockBackend as never },
      })
    );
    expect(result.state).toBeDefined();
    expect(result.state?.agentId).toBe('my-agent');
  });

  it('should log info when memory enabled', () => {
    const logger = createMockLogger();
    const mockBackend = { store: vi.fn(), retrieve: vi.fn() };
    initializeMemoryInfrastructure(
      createOptions({
        config: { enabled: true, backend: mockBackend as never },
        logger,
      })
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Memory integration enabled',
      expect.objectContaining({ agentId: 'test-agent' })
    );
  });

  it('should include config in result', () => {
    const result = initializeMemoryInfrastructure(createOptions());
    expect(result.config).toBeDefined();
  });
});

/**
 * CLI Server Experts Initialization Tests
 *
 * Tests for expert initialization from configuration.
 * (Source: Issue #486 - Wire experts config to expert system)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initializeExperts } from './cli-server-experts.js';
import type { ILogger } from './core/index.js';
import type { CustomExpertDefinition } from './config/index.js';

// Mock modules
vi.mock('./agents/index.js', () => ({
  ExpertFactory: {
    createAllBuiltIn: vi.fn(),
    create: vi.fn(),
  },
  getExpertRegistry: vi.fn(),
}));

function createMockLogger(): ILogger {
  const mock: ILogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
  (mock.child as ReturnType<typeof vi.fn>).mockReturnValue(mock);
  return mock;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMockRegistry() {
  return {
    register: vi.fn(
      () => ({ ok: true, value: undefined }) as { ok: boolean; value?: unknown; error?: Error }
    ),
    registerMany: vi.fn(
      () => ({ ok: true, value: undefined }) as { ok: boolean; value?: unknown; error?: Error }
    ),
  };
}

describe('initializeExperts', () => {
  let mockRegistry: ReturnType<typeof createMockRegistry>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRegistry = createMockRegistry();
    const { getExpertRegistry } = await import('./agents/index.js');
    (getExpertRegistry as ReturnType<typeof vi.fn>).mockReturnValue(mockRegistry);
  });

  it('should create built-in experts by default', async () => {
    const { ExpertFactory } = await import('./agents/index.js');
    const mockExperts = [
      { id: 'code_expert', name: 'Code Expert', role: 'code_expert' },
      { id: 'security_expert', name: 'Security Expert', role: 'security_expert' },
    ];
    (ExpertFactory.createAllBuiltIn as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: true,
      value: mockExperts,
    });

    const logger = createMockLogger();
    const result = initializeExperts({ logger });

    expect(result.builtInCount).toBe(2);
    expect(result.customCount).toBe(0);
    expect(result.totalCount).toBe(2);
    expect(result.registeredIds).toEqual(['code_expert', 'security_expert']);
  });

  it('should skip built-in experts when disabled', async () => {
    const { ExpertFactory } = await import('./agents/index.js');
    const logger = createMockLogger();

    const result = initializeExperts({
      expertConfig: { builtin: false },
      logger,
    });

    expect(ExpertFactory.createAllBuiltIn).not.toHaveBeenCalled();
    expect(result.builtInCount).toBe(0);
  });

  it('should create custom experts from config', async () => {
    const { ExpertFactory } = await import('./agents/index.js');
    (ExpertFactory.createAllBuiltIn as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: true,
      value: [],
    });
    (ExpertFactory.create as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: true,
      value: { id: 'custom_expert', name: 'Custom Expert', role: 'custom' },
    });

    const customDef: CustomExpertDefinition = {
      domain: 'code',
      description: 'My Custom Expert',
      systemPrompt: 'You are a custom expert',
      capabilities: ['code_generation'],
      temperature: 0.7,
      tier: 'fast' as const,
      weight: 1.0,
      available: true,
    };

    const logger = createMockLogger();
    const result = initializeExperts({
      expertConfig: { builtin: true, custom: { my_expert: customDef } },
      logger,
    });

    expect(result.customCount).toBe(1);
    expect(result.registeredIds).toContain('my_expert');
  });

  it('should skip unavailable custom experts', async () => {
    const { ExpertFactory } = await import('./agents/index.js');
    (ExpertFactory.createAllBuiltIn as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: true,
      value: [],
    });

    const customDef: CustomExpertDefinition = {
      domain: 'code',
      systemPrompt: 'Test',
      capabilities: [],
      tier: 'fast' as const,
      temperature: 0.3,
      weight: 1.0,
      available: false,
    };

    const logger = createMockLogger();
    const result = initializeExperts({
      expertConfig: { builtin: true, custom: { unavailable: customDef } },
      logger,
    });

    expect(ExpertFactory.create).not.toHaveBeenCalled();
    expect(result.customCount).toBe(0);
  });

  it('should filter invalid capabilities', async () => {
    const { ExpertFactory } = await import('./agents/index.js');
    (ExpertFactory.createAllBuiltIn as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: true,
      value: [],
    });
    (ExpertFactory.create as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: true,
      value: { id: 'expert', name: 'Expert', role: 'custom' },
    });

    const customDef: CustomExpertDefinition = {
      domain: 'code',
      systemPrompt: 'Test',
      capabilities: ['code_generation', 'invalid_capability', 'tool_use'],
      tier: 'fast' as const,
      temperature: 0.3,
      weight: 1.0,
      available: true,
    };

    const logger = createMockLogger();
    initializeExperts({
      expertConfig: { builtin: true, custom: { expert: customDef } },
      logger,
    });

    const createCall = (ExpertFactory.create as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const config = createCall[0];
    expect(config.capabilities).toEqual(['code_generation', 'tool_use']);
  });

  it('should warn on factory failure and continue', async () => {
    const { ExpertFactory } = await import('./agents/index.js');
    (ExpertFactory.createAllBuiltIn as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: false,
      error: new Error('Factory failed'),
    });

    const logger = createMockLogger();
    const result = initializeExperts({ logger });

    expect(logger.warn).toHaveBeenCalledWith('Failed to create built-in experts', {
      error: 'Factory failed',
    });
    expect(result.builtInCount).toBe(0);
  });

  it('should warn on registration failure and continue', async () => {
    const { ExpertFactory } = await import('./agents/index.js');
    (ExpertFactory.createAllBuiltIn as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: true,
      value: [{ id: 'expert', name: 'Expert', role: 'custom' }],
    });
    mockRegistry.registerMany.mockReturnValue({
      ok: false,
      error: new Error('Registration failed'),
    });

    const logger = createMockLogger();
    const result = initializeExperts({ logger });

    expect(logger.warn).toHaveBeenCalledWith('Failed to register built-in experts', {
      error: 'Registration failed',
    });
    expect(result.builtInCount).toBe(0);
  });

  it('should pass model adapter through to CreateExpertOptions', async () => {
    const { ExpertFactory } = await import('./agents/index.js');
    (ExpertFactory.createAllBuiltIn as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: true,
      value: [],
    });

    const mockAdapter = { execute: vi.fn() };
    const logger = createMockLogger();

    initializeExperts({
      logger,
      modelAdapter: mockAdapter as never,
    });

    expect(ExpertFactory.createAllBuiltIn).toHaveBeenCalledWith({
      adapter: mockAdapter,
    });
  });

  it('should handle empty custom experts config', async () => {
    const { ExpertFactory } = await import('./agents/index.js');
    (ExpertFactory.createAllBuiltIn as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: true,
      value: [],
    });

    const logger = createMockLogger();
    const result = initializeExperts({
      expertConfig: { builtin: true, custom: {} },
      logger,
    });

    expect(result.customCount).toBe(0);
  });

  it('should warn on custom expert creation failure', async () => {
    const { ExpertFactory } = await import('./agents/index.js');
    (ExpertFactory.createAllBuiltIn as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: true,
      value: [],
    });
    (ExpertFactory.create as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: false,
      error: new Error('Creation failed'),
    });

    const customDef: CustomExpertDefinition = {
      domain: 'code',
      systemPrompt: 'Test',
      capabilities: [],
      tier: 'fast' as const,
      temperature: 0.3,
      weight: 1.0,
      available: true,
    };

    const logger = createMockLogger();
    initializeExperts({
      expertConfig: { builtin: true, custom: { failing_expert: customDef } },
      logger,
    });

    expect(logger.warn).toHaveBeenCalledWith('Failed to create custom expert', {
      id: 'failing_expert',
      error: 'Creation failed',
    });
  });

  it('should return correct counts with mixed success', async () => {
    const { ExpertFactory } = await import('./agents/index.js');
    const mockExperts = [{ id: 'built_in', name: 'Built In', role: 'code_expert' }];
    (ExpertFactory.createAllBuiltIn as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: true,
      value: mockExperts,
    });
    (ExpertFactory.create as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      ok: true,
      value: { id: 'custom1', name: 'Custom 1', role: 'custom' },
    });

    const customDef: CustomExpertDefinition = {
      domain: 'code',
      systemPrompt: 'Test',
      capabilities: [],
      tier: 'fast' as const,
      temperature: 0.3,
      weight: 1.0,
      available: true,
    };

    const logger = createMockLogger();
    const result = initializeExperts({
      expertConfig: { builtin: true, custom: { custom1: customDef } },
      logger,
    });

    expect(result.builtInCount).toBe(1);
    expect(result.customCount).toBe(1);
    expect(result.totalCount).toBe(2);
    expect(result.registeredIds).toEqual(['built_in', 'custom1']);
  });
});

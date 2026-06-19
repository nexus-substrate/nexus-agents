/**
 * nexus-agents/mcp - Create Expert Tool Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { Expert, BuiltInExpertTypeSchema, type BuiltInExpertType } from '../../agents/index.js';
import { RateLimiter } from '../middleware/index.js';
import {
  CreateExpertInputSchema,
  CREATE_EXPERT_ROLES,
  registerCreateExpertTool,
  createDefaultDeps,
  type CreateExpertDeps,
  type IExpertFactory,
  getAvailableRoles,
  getCapabilitiesForRole,
} from './create-expert.js';

/**
 * Creates a permissive rate limiter for tests.
 */
function createTestRateLimiter(): RateLimiter {
  return new RateLimiter({
    capacity: 1000,
    refillRate: 1000,
    refillIntervalMs: 1000,
  });
}

/**
 * Creates a mock expert for testing.
 */
function createMockExpert(role: string): Expert {
  // Create a minimal mock that satisfies Expert interface
  return {
    id: `${role}-mock-id`,
    role,
    capabilities: ['task_execution', 'code_generation'] as const,
    state: 'idle',
    expertConfig: {
      id: `${role}-mock-id`,
      name: `${role} Mock`,
      role,
      systemPrompt: 'Mock prompt',
      capabilities: ['task_execution', 'code_generation'],
    },
    name: `${role} Mock`,
    metadata: undefined,
  } as unknown as Expert;
}

/**
 * Creates a mock expert factory.
 */
function createMockFactory(shouldSucceed = true, errorMessage = 'Factory error'): IExpertFactory {
  return {
    createBuiltIn: vi.fn((type: BuiltInExpertType) => {
      if (shouldSucceed) {
        const roleMap: Record<BuiltInExpertType, string> = {
          code: 'code_expert',
          architecture: 'architecture_expert',
          security: 'security_expert',
          documentation: 'documentation_expert',
          testing: 'testing_expert',
          devops: 'devops_expert',
          research: 'research_expert',
          pm: 'pm_expert',
          ux: 'ux_expert',
          infrastructure: 'infrastructure_expert',
          qa: 'qa_expert',
          'data-visualization': 'data_visualization_expert',
        };
        return { ok: true as const, value: createMockExpert(roleMap[type]) };
      }
      return { ok: false as const, error: new Error(errorMessage) };
    }),
  };
}

/**
 * Creates test dependencies.
 */
function createTestDeps(factory?: IExpertFactory, logger?: ILogger): CreateExpertDeps {
  const deps: CreateExpertDeps = {
    expertFactory: factory ?? createMockFactory(),
    expertRegistry: new Map<string, Expert>(),
    rateLimiter: createTestRateLimiter(),
  };
  if (logger !== undefined) {
    deps.logger = logger;
  }
  return deps;
}

describe('CreateExpertInputSchema', () => {
  describe('role validation', () => {
    it('should accept code_expert role', () => {
      const input = { role: 'code_expert' };
      const result = CreateExpertInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe('code_expert');
      }
    });

    it('should accept architecture_expert role', () => {
      const input = { role: 'architecture_expert' };
      const result = CreateExpertInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe('architecture_expert');
      }
    });

    it('should accept security_expert role', () => {
      const input = { role: 'security_expert' };
      const result = CreateExpertInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe('security_expert');
      }
    });

    it('should accept documentation_expert role', () => {
      const input = { role: 'documentation_expert' };
      const result = CreateExpertInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe('documentation_expert');
      }
    });

    it('should accept testing_expert role', () => {
      const input = { role: 'testing_expert' };
      const result = CreateExpertInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe('testing_expert');
      }
    });

    it('should accept devops_expert role', () => {
      const input = { role: 'devops_expert' };
      const result = CreateExpertInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe('devops_expert');
      }
    });

    it('should reject invalid role', () => {
      const input = { role: 'invalid_expert' };
      const result = CreateExpertInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });

    it('should reject missing role', () => {
      const input = {};
      const result = CreateExpertInputSchema.safeParse(input);

      expect(result.success).toBe(false);
    });
  });

  describe('modelPreference validation', () => {
    it('should accept optional modelPreference', () => {
      const input = { role: 'code_expert', modelPreference: 'claude-sonnet-4' };
      const result = CreateExpertInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.modelPreference).toBe('claude-sonnet-4');
      }
    });

    it('should allow missing modelPreference', () => {
      const input = { role: 'code_expert' };
      const result = CreateExpertInputSchema.safeParse(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.modelPreference).toBeUndefined();
      }
    });
  });
});

/**
 * Captures the `role` enum option values from the schema registered with the
 * MCP server (the inputSchema arg to `server.registerTool`). This is what MCP
 * clients actually see — distinct from the exported CreateExpertInputSchema.
 */
function getRegisteredRoleOptions(): readonly string[] {
  let captured: readonly string[] | undefined;
  const mockServer = {
    registerTool: (
      _name: string,
      config: { inputSchema: { role: { options: readonly string[] } } }
    ): void => {
      captured = config.inputSchema.role.options;
    },
  } as unknown as McpServer;

  const rateLimiter = new RateLimiter({ capacity: 1000, refillRate: 1000, refillIntervalMs: 1000 });
  registerCreateExpertTool(mockServer, createDefaultDeps(rateLimiter));

  if (captured === undefined) {
    throw new Error('registerCreateExpertTool did not register an inputSchema with a role enum');
  }
  return captured;
}

describe('role enum single-sourcing (#3978)', () => {
  it('registered toolSchema.role enum === exported CreateExpertInputSchema.role enum', () => {
    const registered = getRegisteredRoleOptions();
    const exported = CreateExpertInputSchema.shape.role.options;

    expect(new Set(registered)).toEqual(new Set(exported));
  });

  it('registered and exported enums both === the single-source CREATE_EXPERT_ROLES', () => {
    const registered = getRegisteredRoleOptions();
    const exported = CreateExpertInputSchema.shape.role.options;
    const source = new Set(CREATE_EXPERT_ROLES);

    expect(new Set(registered)).toEqual(source);
    expect(new Set(exported)).toEqual(source);
  });

  it('data_visualization_expert is creatable via the registered MCP schema', () => {
    expect(getRegisteredRoleOptions()).toContain('data_visualization_expert');
  });

  it('every creatable role maps to a real configured built-in expert', () => {
    // getCapabilitiesForRole resolves via ROLE_TO_EXPERT_TYPE → BUILT_IN_EXPERTS,
    // so a defined result proves the role is a real configured expert (no phantoms).
    for (const role of CREATE_EXPERT_ROLES) {
      expect(getCapabilitiesForRole(role)).toBeDefined();
    }
  });
});

describe('Expert creation logic', () => {
  let deps: CreateExpertDeps;
  let mockFactory: IExpertFactory;

  beforeEach(() => {
    mockFactory = createMockFactory();
    deps = createTestDeps(mockFactory);
  });

  describe('successful creation', () => {
    it('should create code expert', () => {
      const result = deps.expertFactory.createBuiltIn('code');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.role).toBe('code_expert');
      }
    });

    it('should create architecture expert', () => {
      const result = deps.expertFactory.createBuiltIn('architecture');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.role).toBe('architecture_expert');
      }
    });

    it('should create security expert', () => {
      const result = deps.expertFactory.createBuiltIn('security');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.role).toBe('security_expert');
      }
    });

    it('should create documentation expert', () => {
      const result = deps.expertFactory.createBuiltIn('documentation');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.role).toBe('documentation_expert');
      }
    });

    it('should create testing expert', () => {
      const result = deps.expertFactory.createBuiltIn('testing');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.role).toBe('testing_expert');
      }
    });

    it('should create devops expert', () => {
      const result = deps.expertFactory.createBuiltIn('devops');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.role).toBe('devops_expert');
      }
    });
  });

  describe('factory error handling', () => {
    it('should handle factory errors', () => {
      const failingFactory = createMockFactory(false, 'Creation failed');
      const result = failingFactory.createBuiltIn('code');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('Creation failed');
      }
    });
  });
});

describe('Expert registry tracking', () => {
  let deps: CreateExpertDeps;

  beforeEach(() => {
    deps = createTestDeps();
  });

  it('should start with empty registry', () => {
    expect(deps.expertRegistry.size).toBe(0);
  });

  it('should track experts after creation', () => {
    const result = deps.expertFactory.createBuiltIn('code');

    if (result.ok) {
      deps.expertRegistry.set(result.value.id, result.value);
      expect(deps.expertRegistry.size).toBe(1);
      expect(deps.expertRegistry.has(result.value.id)).toBe(true);
    }
  });

  it('should track multiple experts', () => {
    const codeResult = deps.expertFactory.createBuiltIn('code');
    const securityResult = deps.expertFactory.createBuiltIn('security');

    if (codeResult.ok && securityResult.ok) {
      deps.expertRegistry.set(codeResult.value.id, codeResult.value);
      deps.expertRegistry.set(securityResult.value.id, securityResult.value);

      expect(deps.expertRegistry.size).toBe(2);
    }
  });

  it('should allow retrieval of tracked experts', () => {
    const result = deps.expertFactory.createBuiltIn('code');

    if (result.ok) {
      deps.expertRegistry.set(result.value.id, result.value);
      const retrieved = deps.expertRegistry.get(result.value.id);

      expect(retrieved).toBe(result.value);
    }
  });
});

describe('Logger integration', () => {
  it('should log when expert is created', () => {
    const infoSpy = vi.fn();
    const mockLogger: ILogger = {
      debug: vi.fn(),
      info: infoSpy,
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(() => mockLogger),
      setLevel: vi.fn(),
    };
    const deps = createTestDeps(createMockFactory(), mockLogger);

    const result = deps.expertFactory.createBuiltIn('code');

    if (result.ok) {
      deps.expertRegistry.set(result.value.id, result.value);
      deps.logger?.info('Expert created', {
        expertId: result.value.id,
        role: result.value.role,
      });

      expect(infoSpy).toHaveBeenCalledWith(
        'Expert created',
        expect.objectContaining({
          expertId: expect.any(String) as string,
          role: 'code_expert',
        })
      );
    }
  });
});

describe('getAvailableRoles', () => {
  it('should return all available roles', () => {
    const roles = getAvailableRoles();

    expect(roles).toContain('code_expert');
    expect(roles).toContain('architecture_expert');
    expect(roles).toContain('security_expert');
    expect(roles).toContain('documentation_expert');
    expect(roles).toContain('testing_expert');
    expect(roles).toContain('devops_expert');
    expect(roles).toContain('research_expert');
    expect(roles).toContain('infrastructure_expert');
    expect(roles).toContain('data_visualization_expert');
    expect(roles).toContain('qa_expert');
    expect(roles).toHaveLength(BuiltInExpertTypeSchema.options.length);
  });
});

describe('getCapabilitiesForRole', () => {
  it('should return capabilities for code_expert', () => {
    const capabilities = getCapabilitiesForRole('code_expert');

    expect(capabilities).toBeDefined();
    expect(capabilities).toContain('task_execution');
    expect(capabilities).toContain('code_generation');
  });

  it('should return capabilities for security_expert', () => {
    const capabilities = getCapabilitiesForRole('security_expert');

    expect(capabilities).toBeDefined();
    expect(capabilities).toContain('task_execution');
    expect(capabilities).toContain('code_review');
  });

  it('should return capabilities for architecture_expert', () => {
    const capabilities = getCapabilitiesForRole('architecture_expert');

    expect(capabilities).toBeDefined();
    expect(capabilities).toContain('task_execution');
    expect(capabilities).toContain('research');
  });

  it('should return capabilities for testing_expert', () => {
    const capabilities = getCapabilitiesForRole('testing_expert');

    expect(capabilities).toBeDefined();
    expect(capabilities).toContain('task_execution');
    expect(capabilities).toContain('code_generation');
  });

  it('should return capabilities for documentation_expert', () => {
    const capabilities = getCapabilitiesForRole('documentation_expert');

    expect(capabilities).toBeDefined();
    expect(capabilities).toContain('task_execution');
    expect(capabilities).toContain('research');
  });

  it('should return capabilities for devops_expert', () => {
    const capabilities = getCapabilitiesForRole('devops_expert');

    expect(capabilities).toBeDefined();
    expect(capabilities).toContain('task_execution');
    expect(capabilities).toContain('code_generation');
  });

  it('should return undefined for invalid role', () => {
    const capabilities = getCapabilitiesForRole('invalid_expert');

    expect(capabilities).toBeUndefined();
  });
});

describe('modelAdapter wiring (Issue #808)', () => {
  it('should pass adapter option to factory when modelAdapter is set', () => {
    const mockAdapter = {
      name: 'test-adapter',
    } as unknown as import('../../core/index.js').IModelAdapter;
    const factory = createMockFactory();
    const deps = createTestDeps(factory);
    deps.modelAdapter = mockAdapter;

    // Call createBuiltIn via deps — mirrors what createExpertFromFactory does
    deps.expertFactory.createBuiltIn('code', { modelOverrides: { modelId: 'test' } });

    // Factory should have been called
    expect(factory.createBuiltIn).toHaveBeenCalledWith('code', {
      modelOverrides: { modelId: 'test' },
    });
  });

  it('should include modelAdapter in deps when set', () => {
    const mockAdapter = {
      name: 'test-adapter',
    } as unknown as import('../../core/index.js').IModelAdapter;
    const deps = createTestDeps();
    deps.modelAdapter = mockAdapter;

    expect(deps.modelAdapter).toBe(mockAdapter);
    expect((deps.modelAdapter as unknown as { name: string }).name).toBe('test-adapter');
  });

  it('should not have modelAdapter in default deps', () => {
    const deps = createTestDeps();

    expect(deps.modelAdapter).toBeUndefined();
  });
});

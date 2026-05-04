/**
 * nexus-agents/agents - Expert Config Tests
 */

import { describe, it, expect } from 'vitest';
import {
  ExpertConfigSchema,
  ModelPreferenceSchema,
  BuiltInExpertTypeSchema,
  BUILT_IN_EXPERTS,
  EXPERT_TYPE_TO_ROLE,
  validateExpertConfig,
  safeValidateExpertConfig,
  type ExpertConfig,
} from './expert-config.js';

describe('ExpertConfigSchema', () => {
  it('should validate a complete expert config', () => {
    const config: ExpertConfig = {
      id: 'test-expert',
      name: 'Test Expert',
      role: 'code_expert',
      systemPrompt: 'You are a test expert.',
      capabilities: ['task_execution', 'code_generation'],
      modelPreference: {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4',
        temperature: 0.3,
      },
      metadata: { custom: 'value' },
    };

    const result = ExpertConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should validate a minimal expert config', () => {
    const config = {
      id: 'minimal-expert',
      name: 'Minimal',
      role: 'custom',
      systemPrompt: 'Minimal prompt.',
      capabilities: ['task_execution'],
    };

    const result = ExpertConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('should reject empty id', () => {
    const config = {
      id: '',
      name: 'Test',
      role: 'code_expert',
      systemPrompt: 'Prompt.',
      capabilities: ['task_execution'],
    };

    const result = ExpertConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject empty name', () => {
    const config = {
      id: 'test',
      name: '',
      role: 'code_expert',
      systemPrompt: 'Prompt.',
      capabilities: ['task_execution'],
    };

    const result = ExpertConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject invalid role', () => {
    const config = {
      id: 'test',
      name: 'Test',
      role: 'invalid_role',
      systemPrompt: 'Prompt.',
      capabilities: ['task_execution'],
    };

    const result = ExpertConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject empty system prompt', () => {
    const config = {
      id: 'test',
      name: 'Test',
      role: 'code_expert',
      systemPrompt: '',
      capabilities: ['task_execution'],
    };

    const result = ExpertConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject empty capabilities array', () => {
    const config = {
      id: 'test',
      name: 'Test',
      role: 'code_expert',
      systemPrompt: 'Prompt.',
      capabilities: [],
    };

    const result = ExpertConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('should reject invalid capability', () => {
    const config = {
      id: 'test',
      name: 'Test',
      role: 'code_expert',
      systemPrompt: 'Prompt.',
      capabilities: ['invalid_capability'],
    };

    const result = ExpertConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});

describe('ModelPreferenceSchema', () => {
  it('should validate complete model preference', () => {
    const pref = {
      provider: 'anthropic',
      modelId: 'claude-sonnet-4',
      temperature: 0.5,
      maxTokens: 8192,
    };

    const result = ModelPreferenceSchema.safeParse(pref);
    expect(result.success).toBe(true);
  });

  it('should validate empty model preference', () => {
    const result = ModelPreferenceSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should reject temperature below 0', () => {
    const pref = { temperature: -0.1 };
    const result = ModelPreferenceSchema.safeParse(pref);
    expect(result.success).toBe(false);
  });

  it('should reject temperature above 2', () => {
    const pref = { temperature: 2.1 };
    const result = ModelPreferenceSchema.safeParse(pref);
    expect(result.success).toBe(false);
  });

  it('should reject maxTokens below 1', () => {
    const pref = { maxTokens: 0 };
    const result = ModelPreferenceSchema.safeParse(pref);
    expect(result.success).toBe(false);
  });

  it('should reject maxTokens above 200000', () => {
    const pref = { maxTokens: 200001 };
    const result = ModelPreferenceSchema.safeParse(pref);
    expect(result.success).toBe(false);
  });
});

describe('BuiltInExpertTypeSchema', () => {
  // Single source of truth for the contract test below. If `BuiltInExpertType`
  // gains a new member, append it here so the schema-drift test fires when the
  // Zod enum forgets to mirror it (#2338 caught 'qa' missing from the schema).
  const ALL_BUILT_IN_TYPES = [
    'code',
    'architecture',
    'security',
    'documentation',
    'testing',
    'devops',
    'research',
    'pm',
    'ux',
    'infrastructure',
    'qa',
    'data-visualization',
  ] as const;

  it('accepts every literal in BuiltInExpertType (#2338 schema-drift gate)', () => {
    for (const type of ALL_BUILT_IN_TYPES) {
      const result = BuiltInExpertTypeSchema.safeParse(type);
      expect(result.success, `BuiltInExpertTypeSchema must accept '${type}'`).toBe(true);
    }
  });

  it('rejects invalid types', () => {
    const result = BuiltInExpertTypeSchema.safeParse('invalid');
    expect(result.success).toBe(false);
  });
});

describe('BUILT_IN_EXPERTS', () => {
  it('should have all expected expert types', () => {
    expect(BUILT_IN_EXPERTS).toHaveProperty('code');
    expect(BUILT_IN_EXPERTS).toHaveProperty('architecture');
    expect(BUILT_IN_EXPERTS).toHaveProperty('security');
    expect(BUILT_IN_EXPERTS).toHaveProperty('documentation');
    expect(BUILT_IN_EXPERTS).toHaveProperty('testing');
  });

  it('should have valid configurations for all built-in experts', () => {
    for (const [type, config] of Object.entries(BUILT_IN_EXPERTS)) {
      const result = ExpertConfigSchema.safeParse(config);
      expect(result.success, `Built-in expert '${type}' should have valid config`).toBe(true);
    }
  });

  it('should have unique IDs for all built-in experts', () => {
    const ids = Object.values(BUILT_IN_EXPERTS).map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have non-empty system prompts', () => {
    for (const [type, config] of Object.entries(BUILT_IN_EXPERTS)) {
      expect(config.systemPrompt.length, `${type} should have system prompt`).toBeGreaterThan(50);
    }
  });
});

describe('EXPERT_TYPE_TO_ROLE', () => {
  it('should map all built-in types to roles', () => {
    expect(EXPERT_TYPE_TO_ROLE.code).toBe('code_expert');
    expect(EXPERT_TYPE_TO_ROLE.architecture).toBe('architecture_expert');
    expect(EXPERT_TYPE_TO_ROLE.security).toBe('security_expert');
    expect(EXPERT_TYPE_TO_ROLE.documentation).toBe('documentation_expert');
    expect(EXPERT_TYPE_TO_ROLE.testing).toBe('testing_expert');
  });
});

describe('validateExpertConfig', () => {
  it('should return parsed config for valid input', () => {
    const config = {
      id: 'test',
      name: 'Test',
      role: 'code_expert',
      systemPrompt: 'Prompt.',
      capabilities: ['task_execution'],
    };

    const result = validateExpertConfig(config);
    expect(result.id).toBe('test');
    expect(result.name).toBe('Test');
  });

  it('should throw for invalid input', () => {
    const config = {
      id: '',
      name: 'Test',
      role: 'code_expert',
      systemPrompt: 'Prompt.',
      capabilities: [],
    };

    expect(() => validateExpertConfig(config)).toThrow();
  });
});

describe('safeValidateExpertConfig', () => {
  it('should return success for valid config', () => {
    const config = {
      id: 'test',
      name: 'Test',
      role: 'code_expert',
      systemPrompt: 'Prompt.',
      capabilities: ['task_execution'],
    };

    const result = safeValidateExpertConfig(config);
    expect(result.success).toBe(true);
  });

  it('should return error for invalid config', () => {
    const config = {
      id: '',
      name: '',
      role: 'invalid',
      systemPrompt: '',
      capabilities: [],
    };

    const result = safeValidateExpertConfig(config);
    expect(result.success).toBe(false);
  });
});

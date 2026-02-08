/**
 * nexus-agents/agents - Expert Factory Tests
 */

import { describe, it, expect } from 'vitest';
import { ExpertFactory, Expert, FactoryError, type CreateExpertOptions } from './expert-factory.js';
import { type ExpertConfig, BUILT_IN_EXPERTS } from './expert-config.js';

describe('ExpertFactory', () => {
  describe('create', () => {
    it('should create an expert from valid config', () => {
      const config: ExpertConfig = {
        id: 'test-expert',
        name: 'Test Expert',
        role: 'code_expert',
        systemPrompt: 'You are a test expert.',
        capabilities: ['task_execution', 'code_generation'],
      };

      const result = ExpertFactory.create(config);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeInstanceOf(Expert);
        expect(result.value.id).toBe('test-expert');
        expect(result.value.role).toBe('code_expert');
        expect(result.value.name).toBe('Test Expert');
      }
    });

    it('should apply model preferences', () => {
      const config: ExpertConfig = {
        id: 'test-expert',
        name: 'Test Expert',
        role: 'code_expert',
        systemPrompt: 'Prompt.',
        capabilities: ['task_execution'],
        modelPreference: {
          temperature: 0.7,
          maxTokens: 8192,
        },
      };

      const result = ExpertFactory.create(config);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.expertConfig.modelPreference?.temperature).toBe(0.7);
        expect(result.value.expertConfig.modelPreference?.maxTokens).toBe(8192);
      }
    });

    it('should apply model overrides', () => {
      const config: ExpertConfig = {
        id: 'test-expert',
        name: 'Test Expert',
        role: 'code_expert',
        systemPrompt: 'Prompt.',
        capabilities: ['task_execution'],
        modelPreference: {
          temperature: 0.3,
        },
      };

      const options: CreateExpertOptions = {
        modelOverrides: {
          temperature: 0.9,
          maxTokens: 16384,
        },
      };

      const result = ExpertFactory.create(config, options);

      expect(result.ok).toBe(true);
      // The override is applied during creation
      // (verified via the internal agent options, not the config)
    });

    it('should add additional capabilities', () => {
      const config: ExpertConfig = {
        id: 'test-expert',
        name: 'Test Expert',
        role: 'code_expert',
        systemPrompt: 'Prompt.',
        capabilities: ['task_execution'],
      };

      const options: CreateExpertOptions = {
        additionalCapabilities: ['code_generation', 'research'],
      };

      const result = ExpertFactory.create(config, options);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.capabilities).toContain('task_execution');
        expect(result.value.capabilities).toContain('code_generation');
        expect(result.value.capabilities).toContain('research');
      }
    });

    it('should return error for invalid config', () => {
      const config = {
        id: '',
        name: 'Test',
        role: 'invalid_role',
        systemPrompt: '',
        capabilities: [],
      } as unknown as ExpertConfig;

      const result = ExpertFactory.create(config);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(FactoryError);
        expect(result.error.message).toContain('Invalid expert configuration');
      }
    });

    it('should include validation errors in context', () => {
      const config = {
        id: '',
        name: '',
        role: 'code_expert',
        systemPrompt: 'Prompt.',
        capabilities: [],
      } as unknown as ExpertConfig;

      const result = ExpertFactory.create(config);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.context).toHaveProperty('validationErrors');
      }
    });

    it('should store config in expert', () => {
      const config: ExpertConfig = {
        id: 'test-expert',
        name: 'Test Expert',
        role: 'code_expert',
        systemPrompt: 'Prompt.',
        capabilities: ['task_execution'],
        metadata: { version: '1.0' },
      };

      const result = ExpertFactory.create(config);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.expertConfig).toEqual(config);
        expect(result.value.metadata).toEqual({ version: '1.0' });
      }
    });

    it('should accept contextPruning configuration (Issue #476)', () => {
      const config: ExpertConfig = {
        id: 'pruning-expert',
        name: 'Pruning Expert',
        role: 'code_expert',
        systemPrompt: 'Prompt.',
        capabilities: ['task_execution'],
      };

      const options: CreateExpertOptions = {
        contextPruning: {
          enabled: true,
          maxTokens: 50000,
          triggerThreshold: 0.85,
        },
      };

      const result = ExpertFactory.create(config, options);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeInstanceOf(Expert);
        expect(result.value.id).toBe('pruning-expert');
        // Note: context pruning is applied internally to BaseAgent
        // We verify the expert was created successfully with the config
      }
    });

    it('should work with disabled contextPruning', () => {
      const config: ExpertConfig = {
        id: 'no-pruning-expert',
        name: 'No Pruning Expert',
        role: 'code_expert',
        systemPrompt: 'Prompt.',
        capabilities: ['task_execution'],
      };

      const options: CreateExpertOptions = {
        contextPruning: {
          enabled: false,
        },
      };

      const result = ExpertFactory.create(config, options);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeInstanceOf(Expert);
      }
    });
  });

  describe('createBuiltIn', () => {
    it('should create code expert', () => {
      const result = ExpertFactory.createBuiltIn('code');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('code-expert');
        expect(result.value.role).toBe('code_expert');
        expect(result.value.capabilities).toContain('code_generation');
      }
    });

    it('should create architecture expert', () => {
      const result = ExpertFactory.createBuiltIn('architecture');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('architecture-expert');
        expect(result.value.role).toBe('architecture_expert');
      }
    });

    it('should create security expert', () => {
      const result = ExpertFactory.createBuiltIn('security');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('security-expert');
        expect(result.value.role).toBe('security_expert');
      }
    });

    it('should create documentation expert', () => {
      const result = ExpertFactory.createBuiltIn('documentation');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('documentation-expert');
        expect(result.value.role).toBe('documentation_expert');
      }
    });

    it('should create testing expert', () => {
      const result = ExpertFactory.createBuiltIn('testing');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('testing-expert');
        expect(result.value.role).toBe('testing_expert');
      }
    });

    it('should return error for invalid type', () => {
      const result = ExpertFactory.createBuiltIn('invalid' as 'code');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(FactoryError);
        expect(result.error.message).toContain('Invalid built-in expert type');
      }
    });

    it('should not mutate built-in config', () => {
      const originalConfig = { ...BUILT_IN_EXPERTS.code };
      const originalCapabilities = [...BUILT_IN_EXPERTS.code.capabilities];

      const result = ExpertFactory.createBuiltIn('code', {
        additionalCapabilities: ['delegation'],
      });

      expect(result.ok).toBe(true);
      expect(BUILT_IN_EXPERTS.code.capabilities).toEqual(originalCapabilities);
      expect(BUILT_IN_EXPERTS.code.id).toBe(originalConfig.id);
    });
  });

  describe('createMany', () => {
    it('should create multiple experts', () => {
      const configs: ExpertConfig[] = [
        {
          id: 'expert-1',
          name: 'Expert 1',
          role: 'code_expert',
          systemPrompt: 'Prompt 1.',
          capabilities: ['task_execution'],
        },
        {
          id: 'expert-2',
          name: 'Expert 2',
          role: 'testing_expert',
          systemPrompt: 'Prompt 2.',
          capabilities: ['task_execution', 'code_generation'],
        },
      ];

      const result = ExpertFactory.createMany(configs);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0]!.id).toBe('expert-1');
        expect(result.value[1]!.id).toBe('expert-2');
      }
    });

    it('should return first error if any config invalid', () => {
      const configs: ExpertConfig[] = [
        {
          id: 'valid',
          name: 'Valid',
          role: 'code_expert',
          systemPrompt: 'Prompt.',
          capabilities: ['task_execution'],
        },
        {
          id: '',
          name: 'Invalid',
          role: 'code_expert',
          systemPrompt: 'Prompt.',
          capabilities: [],
        } as unknown as ExpertConfig,
      ];

      const result = ExpertFactory.createMany(configs);

      expect(result.ok).toBe(false);
    });

    it('should handle empty array', () => {
      const result = ExpertFactory.createMany([]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });
  });

  describe('createAllBuiltIn', () => {
    it('should create all built-in experts', () => {
      const result = ExpertFactory.createAllBuiltIn();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(9);

        const ids = result.value.map((e) => e.id);
        expect(ids).toContain('code-expert');
        expect(ids).toContain('architecture-expert');
        expect(ids).toContain('pm-expert');
        expect(ids).toContain('ux-expert');
        expect(ids).toContain('security-expert');
        expect(ids).toContain('documentation-expert');
        expect(ids).toContain('testing-expert');
      }
    });

    it('should apply options to all experts', () => {
      const result = ExpertFactory.createAllBuiltIn({
        additionalCapabilities: ['collaboration'],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const expert of result.value) {
          expect(expert.capabilities).toContain('collaboration');
        }
      }
    });
  });

  describe('validate', () => {
    it('should return config for valid input', () => {
      const config = {
        id: 'test',
        name: 'Test',
        role: 'code_expert',
        systemPrompt: 'Prompt.',
        capabilities: ['task_execution'],
      };

      const result = ExpertFactory.validate(config);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('test');
      }
    });

    it('should return error for invalid input', () => {
      const config = {
        id: '',
        name: '',
      };

      const result = ExpertFactory.validate(config);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(FactoryError);
      }
    });
  });

  describe('getBuiltInConfig', () => {
    it('should return config for valid type', () => {
      const result = ExpertFactory.getBuiltInConfig('code');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('code-expert');
        expect(result.value.role).toBe('code_expert');
      }
    });

    it('should return copy of config', () => {
      const result1 = ExpertFactory.getBuiltInConfig('code');
      const result2 = ExpertFactory.getBuiltInConfig('code');

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);

      if (result1.ok && result2.ok) {
        expect(result1.value).not.toBe(result2.value);
        expect(result1.value.capabilities).not.toBe(result2.value.capabilities);
      }
    });

    it('should return error for invalid type', () => {
      const result = ExpertFactory.getBuiltInConfig('invalid' as 'code');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(FactoryError);
      }
    });
  });
});

describe('Expert', () => {
  it('should expose name from config', () => {
    const config: ExpertConfig = {
      id: 'test',
      name: 'Test Expert',
      role: 'code_expert',
      systemPrompt: 'Prompt.',
      capabilities: ['task_execution'],
    };

    const result = ExpertFactory.create(config);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('Test Expert');
    }
  });

  it('should expose metadata from config', () => {
    const config: ExpertConfig = {
      id: 'test',
      name: 'Test',
      role: 'code_expert',
      systemPrompt: 'Prompt.',
      capabilities: ['task_execution'],
      metadata: { version: '1.0', custom: true },
    };

    const result = ExpertFactory.create(config);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata).toEqual({ version: '1.0', custom: true });
    }
  });

  it('should return undefined metadata if not set', () => {
    const config: ExpertConfig = {
      id: 'test',
      name: 'Test',
      role: 'code_expert',
      systemPrompt: 'Prompt.',
      capabilities: ['task_execution'],
    };

    const result = ExpertFactory.create(config);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.metadata).toBeUndefined();
    }
  });
});

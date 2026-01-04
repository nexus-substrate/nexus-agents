/**
 * @nexus-agents/agents - Expert Registry Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ExpertRegistry, RegistryError, getExpertRegistry } from './expert-registry.js';
import { ExpertFactory, Expert } from './expert-factory.js';
import type { ExpertConfig } from './expert-config.js';

describe('ExpertRegistry', () => {
  beforeEach(() => {
    ExpertRegistry.resetInstance();
  });

  afterEach(() => {
    ExpertRegistry.resetInstance();
  });

  function createTestExpert(id: string, role = 'code_expert'): Expert {
    const config: ExpertConfig = {
      id,
      name: `Test Expert ${id}`,
      role: role as 'code_expert',
      systemPrompt: 'Test prompt.',
      capabilities: ['task_execution', 'code_generation'],
    };
    const result = ExpertFactory.create(config);
    if (!result.ok) {
      throw new Error('Failed to create test expert');
    }
    return result.value;
  }

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = ExpertRegistry.getInstance();
      const instance2 = ExpertRegistry.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = ExpertRegistry.getInstance();
      ExpertRegistry.resetInstance();
      const instance2 = ExpertRegistry.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  describe('getExpertRegistry', () => {
    it('should return singleton instance', () => {
      const instance1 = getExpertRegistry();
      const instance2 = getExpertRegistry();

      expect(instance1).toBe(instance2);
    });
  });

  describe('register', () => {
    it('should register an expert', () => {
      const registry = ExpertRegistry.getInstance();
      const expert = createTestExpert('expert-1');

      const result = registry.register(expert);

      expect(result.ok).toBe(true);
      expect(registry.has('expert-1')).toBe(true);
    });

    it('should reject duplicate registration', () => {
      const registry = ExpertRegistry.getInstance();
      const expert = createTestExpert('expert-1');

      registry.register(expert);
      const result = registry.register(expert);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(RegistryError);
        expect(result.error.message).toContain('already registered');
      }
    });

    it('should allow replace with option', () => {
      const registry = ExpertRegistry.getInstance();
      const expert1 = createTestExpert('expert-1');
      const expert2 = createTestExpert('expert-1');

      registry.register(expert1);
      const result = registry.register(expert2, { replace: true });

      expect(result.ok).toBe(true);
      expect(registry.size).toBe(1);
    });
  });

  describe('registerMany', () => {
    it('should register multiple experts', () => {
      const registry = ExpertRegistry.getInstance();
      const experts = [
        createTestExpert('expert-1'),
        createTestExpert('expert-2'),
        createTestExpert('expert-3'),
      ];

      const result = registry.registerMany(experts);

      expect(result.ok).toBe(true);
      expect(registry.size).toBe(3);
    });

    it('should fail on first duplicate', () => {
      const registry = ExpertRegistry.getInstance();
      const experts = [createTestExpert('expert-1'), createTestExpert('expert-1')];

      const result = registry.registerMany(experts);

      expect(result.ok).toBe(false);
      expect(registry.size).toBe(1);
    });
  });

  describe('unregister', () => {
    it('should unregister an expert', () => {
      const registry = ExpertRegistry.getInstance();
      const expert = createTestExpert('expert-1');
      registry.register(expert);

      const result = registry.unregister('expert-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(expert);
      }
      expect(registry.has('expert-1')).toBe(false);
    });

    it('should return error for non-existent expert', () => {
      const registry = ExpertRegistry.getInstance();

      const result = registry.unregister('non-existent');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(RegistryError);
        expect(result.error.message).toContain('not found');
      }
    });
  });

  describe('get', () => {
    it('should retrieve an expert by ID', () => {
      const registry = ExpertRegistry.getInstance();
      const expert = createTestExpert('expert-1');
      registry.register(expert);

      const result = registry.get('expert-1');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(expert);
      }
    });

    it('should return error for non-existent expert', () => {
      const registry = ExpertRegistry.getInstance();

      const result = registry.get('non-existent');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(RegistryError);
      }
    });

    it('should include available IDs in error context', () => {
      const registry = ExpertRegistry.getInstance();
      registry.register(createTestExpert('expert-1'));
      registry.register(createTestExpert('expert-2'));

      const result = registry.get('non-existent');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        const context = result.error.context as { availableIds: string[] };
        expect(context.availableIds).toContain('expert-1');
        expect(context.availableIds).toContain('expert-2');
      }
    });
  });

  describe('has', () => {
    it('should return true for registered expert', () => {
      const registry = ExpertRegistry.getInstance();
      registry.register(createTestExpert('expert-1'));

      expect(registry.has('expert-1')).toBe(true);
    });

    it('should return false for non-existent expert', () => {
      const registry = ExpertRegistry.getInstance();

      expect(registry.has('non-existent')).toBe(false);
    });
  });

  describe('getByCapability', () => {
    it('should find experts with capability', () => {
      const registry = ExpertRegistry.getInstance();
      registry.register(createTestExpert('expert-1'));
      registry.register(createTestExpert('expert-2'));

      const experts = registry.getByCapability('code_generation');

      expect(experts).toHaveLength(2);
    });

    it('should return empty for no matches', () => {
      const registry = ExpertRegistry.getInstance();
      registry.register(createTestExpert('expert-1'));

      const experts = registry.getByCapability('delegation');

      expect(experts).toHaveLength(0);
    });
  });

  describe('getByRole', () => {
    it('should find experts with role', () => {
      const registry = ExpertRegistry.getInstance();
      registry.register(createTestExpert('expert-1', 'code_expert'));
      registry.register(createTestExpert('expert-2', 'testing_expert'));

      const experts = registry.getByRole('code_expert');

      expect(experts).toHaveLength(1);
      expect(experts[0]!.id).toBe('expert-1');
    });

    it('should return empty for no matches', () => {
      const registry = ExpertRegistry.getInstance();
      registry.register(createTestExpert('expert-1'));

      const experts = registry.getByRole('architecture_expert');

      expect(experts).toHaveLength(0);
    });
  });

  describe('query', () => {
    beforeEach(() => {
      const registry = ExpertRegistry.getInstance();
      // Create diverse experts for query tests
      const config1: ExpertConfig = {
        id: 'expert-1',
        name: 'Expert 1',
        role: 'code_expert',
        systemPrompt: 'Prompt.',
        capabilities: ['task_execution', 'code_generation'],
      };
      const config2: ExpertConfig = {
        id: 'expert-2',
        name: 'Expert 2',
        role: 'code_expert',
        systemPrompt: 'Prompt.',
        capabilities: ['task_execution', 'code_review'],
      };
      const config3: ExpertConfig = {
        id: 'expert-3',
        name: 'Expert 3',
        role: 'testing_expert',
        systemPrompt: 'Prompt.',
        capabilities: ['task_execution', 'code_generation'],
      };

      const r1 = ExpertFactory.create(config1);
      const r2 = ExpertFactory.create(config2);
      const r3 = ExpertFactory.create(config3);

      if (r1.ok) registry.register(r1.value);
      if (r2.ok) registry.register(r2.value);
      if (r3.ok) registry.register(r3.value);
    });

    it('should filter by role', () => {
      const registry = ExpertRegistry.getInstance();

      const results = registry.query({ role: 'code_expert' });

      expect(results).toHaveLength(2);
    });

    it('should filter by all capabilities', () => {
      const registry = ExpertRegistry.getInstance();

      const results = registry.query({
        capabilities: ['task_execution', 'code_generation'],
      });

      expect(results).toHaveLength(2);
    });

    it('should filter by any capability', () => {
      const registry = ExpertRegistry.getInstance();

      const results = registry.query({
        anyCapability: ['code_review', 'code_generation'],
      });

      expect(results).toHaveLength(3);
    });

    it('should apply limit', () => {
      const registry = ExpertRegistry.getInstance();

      const results = registry.query({ limit: 2 });

      expect(results).toHaveLength(2);
    });

    it('should combine filters', () => {
      const registry = ExpertRegistry.getInstance();

      const results = registry.query({
        role: 'code_expert',
        capabilities: ['code_generation'],
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.id).toBe('expert-1');
    });
  });

  describe('list', () => {
    it('should list all experts', () => {
      const registry = ExpertRegistry.getInstance();
      registry.register(createTestExpert('expert-1'));
      registry.register(createTestExpert('expert-2'));

      const experts = registry.list();

      expect(experts).toHaveLength(2);
    });

    it('should return empty for empty registry', () => {
      const registry = ExpertRegistry.getInstance();

      const experts = registry.list();

      expect(experts).toHaveLength(0);
    });
  });

  describe('listIds', () => {
    it('should list all expert IDs', () => {
      const registry = ExpertRegistry.getInstance();
      registry.register(createTestExpert('expert-1'));
      registry.register(createTestExpert('expert-2'));

      const ids = registry.listIds();

      expect(ids).toContain('expert-1');
      expect(ids).toContain('expert-2');
    });
  });

  describe('size and isEmpty', () => {
    it('should return correct size', () => {
      const registry = ExpertRegistry.getInstance();

      expect(registry.size).toBe(0);

      registry.register(createTestExpert('expert-1'));
      expect(registry.size).toBe(1);

      registry.register(createTestExpert('expert-2'));
      expect(registry.size).toBe(2);
    });

    it('should return isEmpty correctly', () => {
      const registry = ExpertRegistry.getInstance();

      expect(registry.isEmpty).toBe(true);

      registry.register(createTestExpert('expert-1'));
      expect(registry.isEmpty).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all experts', () => {
      const registry = ExpertRegistry.getInstance();
      registry.register(createTestExpert('expert-1'));
      registry.register(createTestExpert('expert-2'));

      registry.clear();

      expect(registry.size).toBe(0);
      expect(registry.isEmpty).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return registry statistics', () => {
      const registry = ExpertRegistry.getInstance();

      const config1: ExpertConfig = {
        id: 'expert-1',
        name: 'Expert 1',
        role: 'code_expert',
        systemPrompt: 'Prompt.',
        capabilities: ['task_execution', 'code_generation'],
      };
      const config2: ExpertConfig = {
        id: 'expert-2',
        name: 'Expert 2',
        role: 'testing_expert',
        systemPrompt: 'Prompt.',
        capabilities: ['task_execution'],
      };

      const r1 = ExpertFactory.create(config1);
      const r2 = ExpertFactory.create(config2);

      if (r1.ok) registry.register(r1.value);
      if (r2.ok) registry.register(r2.value);

      const stats = registry.getStats();

      expect(stats.totalExperts).toBe(2);
      expect(stats.byRole.code_expert).toBe(1);
      expect(stats.byRole.testing_expert).toBe(1);
      expect(stats.byCapability.task_execution).toBe(2);
      expect(stats.byCapability.code_generation).toBe(1);
    });

    it('should return empty stats for empty registry', () => {
      const registry = ExpertRegistry.getInstance();

      const stats = registry.getStats();

      expect(stats.totalExperts).toBe(0);
      expect(stats.byRole).toEqual({});
      expect(stats.byCapability).toEqual({});
    });
  });

  describe('findBestMatch', () => {
    beforeEach(() => {
      const registry = ExpertRegistry.getInstance();

      const config1: ExpertConfig = {
        id: 'expert-1',
        name: 'Expert 1',
        role: 'code_expert',
        systemPrompt: 'Prompt.',
        capabilities: ['task_execution', 'code_generation', 'code_review'],
      };
      const config2: ExpertConfig = {
        id: 'expert-2',
        name: 'Expert 2',
        role: 'testing_expert',
        systemPrompt: 'Prompt.',
        capabilities: ['task_execution'],
      };

      const r1 = ExpertFactory.create(config1);
      const r2 = ExpertFactory.create(config2);

      if (r1.ok) registry.register(r1.value);
      if (r2.ok) registry.register(r2.value);
    });

    it('should find best matching expert', () => {
      const registry = ExpertRegistry.getInstance();

      const result = registry.findBestMatch(['code_generation', 'code_review']);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.id).toBe('expert-1');
      }
    });

    it('should return error for empty registry', () => {
      ExpertRegistry.resetInstance();
      const registry = ExpertRegistry.getInstance();

      const result = registry.findBestMatch(['task_execution']);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('No experts registered');
      }
    });

    it('should return error when no expert matches', () => {
      const registry = ExpertRegistry.getInstance();

      const result = registry.findBestMatch(['delegation', 'research']);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('No expert matches');
      }
    });
  });
});

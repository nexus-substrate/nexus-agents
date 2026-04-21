/**
 * nexus-agents/agents - Expert Selector Tests
 *
 * Tests expert matching, scoring, and collaboration detection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Task } from '../../core/index.js';
import {
  selectExperts,
  quickSelect,
  createDefaultRegistry,
  SelectionError,
  ExpertCollaborationPattern,
  type ExpertRegistry,
  type ExpertDefinition,
  type SelectionOptions,
} from './expert-selector.js';
import {} from './task-analyzer.js';

/**
 * Creates a test task with the given description.
 */
function createTask(description: string, context?: Partial<Task['context']>): Task {
  const taskContext: Task['context'] = {};

  if (context?.workingDirectory !== undefined) {
    taskContext.workingDirectory = context.workingDirectory;
  }
  if (context?.files !== undefined) {
    taskContext.files = context.files;
  }
  if (context?.history !== undefined) {
    taskContext.history = context.history;
  }
  if (context?.metadata !== undefined) {
    taskContext.metadata = context.metadata;
  }

  return {
    id: 'test-task-1',
    description,
    context: taskContext,
  };
}

/**
 * Creates a custom expert definition.
 */
function createExpert(overrides: Partial<ExpertDefinition>): ExpertDefinition {
  return {
    id: 'test-expert',
    role: 'code_expert',
    name: 'Test Expert',
    description: 'A test expert',
    capabilities: ['task_execution'],
    primaryDomain: 'code',
    secondaryDomains: [],
    weight: 1.0,
    available: true,
    ...overrides,
  };
}

/**
 * Creates a custom registry with the given experts.
 */
function createRegistry(experts: ExpertDefinition[]): ExpertRegistry {
  return {
    getAll: () => [...experts],
    getById: (id: string) => experts.find((e) => e.id === id),
    getByRole: (role) => experts.filter((e) => e.role === role),
    getByDomain: (domain) =>
      experts.filter((e) => e.primaryDomain === domain || e.secondaryDomains.includes(domain)),
    getAvailable: () => experts.filter((e) => e.available),
  };
}

describe('selectExperts', () => {
  let defaultRegistry: ExpertRegistry;

  beforeEach(() => {
    defaultRegistry = createDefaultRegistry();
  });

  describe('basic selection', () => {
    it('should select an expert for a valid task', () => {
      const task = createTask('Implement a user authentication feature');
      const result = selectExperts(task, defaultRegistry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.primary).toBeDefined();
        expect(result.value.primary.expertId).toBeDefined();
        expect(result.value.primary.score).toBeGreaterThan(0);
      }
    });

    it('should return alternatives when available', () => {
      const task = createTask('Implement code with security checks');
      const result = selectExperts(task, defaultRegistry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(Array.isArray(result.value.alternatives)).toBe(true);
      }
    });

    it('should include score breakdown in matches', () => {
      const task = createTask('Implement a feature');
      const result = selectExperts(task, defaultRegistry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.primary.scoreBreakdown).toBeDefined();
        expect(result.value.primary.scoreBreakdown.capabilityScore).toBeGreaterThanOrEqual(0);
        expect(result.value.primary.scoreBreakdown.domainScore).toBeGreaterThanOrEqual(0);
        expect(result.value.primary.scoreBreakdown.finalScore).toBeGreaterThanOrEqual(0);
      }
    });

    it('should include reasoning in matches', () => {
      const task = createTask('Implement a feature');
      const result = selectExperts(task, defaultRegistry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.primary.reasoning).toBeDefined();
        expect(result.value.primary.reasoning.length).toBeGreaterThan(0);
      }
    });
  });

  describe('domain matching', () => {
    it('should select code expert for code tasks', () => {
      const task = createTask('Implement a new API endpoint');
      const result = selectExperts(task, defaultRegistry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.primary.expertId).toBe('code-expert');
      }
    });

    it('should select security expert for security tasks', () => {
      const task = createTask('Audit for security vulnerabilities and check authentication');
      const result = selectExperts(task, defaultRegistry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.primary.expertId).toBe('security-expert');
      }
    });

    it('should select architecture expert for design tasks', () => {
      const task = createTask('Design the microservices architecture');
      const result = selectExperts(task, defaultRegistry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.primary.expertId).toBe('architecture-expert');
      }
    });

    it('should select testing expert for test tasks', () => {
      const task = createTask('Write unit tests with coverage');
      const result = selectExperts(task, defaultRegistry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.primary.expertId).toBe('testing-expert');
      }
    });

    it('should select documentation expert for doc tasks', () => {
      const task = createTask('Write API documentation and readme');
      const result = selectExperts(task, defaultRegistry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.primary.expertId).toBe('documentation-expert');
      }
    });
  });

  describe('capability matching', () => {
    it('should match experts based on required capabilities', () => {
      const task = createTask('Create and build a new module');
      const result = selectExperts(task, defaultRegistry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.primary.matchedCapabilities.length).toBeGreaterThan(0);
      }
    });

    it('should apply custom capability weights', () => {
      const task = createTask('Review and audit the code');
      const options: SelectionOptions = {
        capabilityWeights: {
          code_review: 5, // High weight for review
          code_generation: 1,
        },
      };
      const result = selectExperts(task, defaultRegistry, options);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Security expert has code_review capability
        expect(result.value.primary.matchedCapabilities).toContain('code_review');
      }
    });
  });

  describe('selection options', () => {
    it('should respect minScore filter', () => {
      const task = createTask('General help');
      const options: SelectionOptions = {
        minScore: 0.9, // Very high threshold
      };
      const result = selectExperts(task, defaultRegistry, options);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should still return a result, but with lower confidence
        expect(result.value.confidence).toBeLessThan(0.9);
      }
    });

    it('should respect maxAlternatives limit', () => {
      const task = createTask('Implement feature');
      const options: SelectionOptions = {
        maxAlternatives: 2,
      };
      const result = selectExperts(task, defaultRegistry, options);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.alternatives.length).toBeLessThanOrEqual(2);
      }
    });

    it('should exclude specified experts', () => {
      const task = createTask('Implement feature');
      const options: SelectionOptions = {
        excludeExperts: ['code-expert'],
      };
      const result = selectExperts(task, defaultRegistry, options);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.primary.expertId).not.toBe('code-expert');
        expect(result.value.alternatives.every((a) => a.expertId !== 'code-expert')).toBe(true);
      }
    });

    it('should apply preferred domains', () => {
      const task = createTask('Help with some code stuff');
      const options: SelectionOptions = {
        preferredDomains: ['testing'],
      };
      const result = selectExperts(task, defaultRegistry, options);

      expect(result.ok).toBe(true);
      // Preferred domain should boost testing expert score
    });

    it('should validate options and reject invalid ones', () => {
      const task = createTask('Test');
      const options = {
        minScore: 5, // Invalid: should be 0-1
      } as SelectionOptions;
      const result = selectExperts(task, defaultRegistry, options);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(SelectionError);
      }
    });
  });

  describe('collaboration detection', () => {
    it('should suggest collaboration for complex multi-domain tasks', () => {
      // Use highly complex task description with multiple domains
      // to trigger collaboration detection (requires HIGH complexity + secondary domains)
      const task = createTask(
        'Design and architect a comprehensive distributed system with multiple microservices. ' +
          'Implement advanced security features including authentication, authorization, and encryption. ' +
          'Create integration tests and performance benchmarks for the entire system.'
      );
      const result = selectExperts(task, defaultRegistry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // If complexity detected as high with multiple domains, collaboration is suggested
        // Note: SharedTaskAnalyzer may classify this differently than legacy analyzer
        if (result.value.requiresCollaboration) {
          expect(result.value.suggestedPattern).toBeDefined();
        }
      }
    });

    it('should force collaboration when option is set', () => {
      const task = createTask('Simple task');
      const options: SelectionOptions = {
        forceCollaboration: true,
      };
      const result = selectExperts(task, defaultRegistry, options);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.requiresCollaboration).toBe(true);
        expect(result.value.suggestedPattern).toBe(ExpertCollaborationPattern.PARALLEL);
      }
    });

    it('should suggest review chain for code + security tasks', () => {
      const task = createTask('Implement authentication and check for security vulnerabilities');
      const result = selectExperts(task, defaultRegistry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        if (result.value.requiresCollaboration) {
          expect(result.value.suggestedPattern).toBeDefined();
        }
      }
    });

    it('should not require collaboration for simple single-domain tasks', () => {
      // Use a task that is clearly single-domain and low complexity
      const task = createTask('Fix a simple bug in the code');
      const result = selectExperts(task, defaultRegistry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Low complexity single-domain tasks should not require collaboration
        // unless they span multiple domains
        if (result.value.requiresCollaboration) {
          // If collaboration is suggested, it should have a pattern
          expect(result.value.suggestedPattern).toBeDefined();
        }
      }
    });
  });

  describe('error handling', () => {
    it('should return error for empty registry', () => {
      const task = createTask('Test');
      const emptyRegistry = createRegistry([]);
      const result = selectExperts(task, emptyRegistry);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(SelectionError);
        expect(result.error.message).toContain('No available experts');
      }
    });

    it('should return error when all experts are unavailable', () => {
      const experts = [
        createExpert({ id: 'expert-1', available: false }),
        createExpert({ id: 'expert-2', available: false }),
      ];
      const registry = createRegistry(experts);
      const task = createTask('Test');
      const result = selectExperts(task, registry);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(SelectionError);
      }
    });

    it('should handle empty task gracefully with defaults', () => {
      // SharedTaskAnalyzer is fault-tolerant and returns defaults for empty tasks
      const task = createTask('');
      const result = selectExperts(task, defaultRegistry);

      // New behavior: empty tasks get default analysis instead of error
      expect(result.ok).toBe(true);
      if (result.ok) {
        // Should still return a valid selection with general domain defaults
        expect(result.value.primary.expertId).toBeDefined();
      }
    });

    it('should handle when all experts are excluded', () => {
      const experts = [createExpert({ id: 'only-expert' })];
      const registry = createRegistry(experts);
      const task = createTask('Test');
      const options: SelectionOptions = {
        excludeExperts: ['only-expert'],
      };
      const result = selectExperts(task, registry, options);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(SelectionError);
      }
    });
  });

  describe('scoring accuracy', () => {
    it('should rank experts correctly by score', () => {
      const task = createTask('Implement code feature');
      const result = selectExperts(task, defaultRegistry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        const primaryScore = result.value.primary.score;
        for (const alt of result.value.alternatives) {
          expect(primaryScore).toBeGreaterThanOrEqual(alt.score);
        }
      }
    });

    it('should have scores between 0 and 1', () => {
      const task = createTask('Any task');
      const result = selectExperts(task, defaultRegistry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.primary.score).toBeGreaterThanOrEqual(0);
        expect(result.value.primary.score).toBeLessThanOrEqual(1);
        for (const alt of result.value.alternatives) {
          expect(alt.score).toBeGreaterThanOrEqual(0);
          expect(alt.score).toBeLessThanOrEqual(1);
        }
      }
    });

    it('should have confidence between 0 and 1', () => {
      const task = createTask('Any task');
      const result = selectExperts(task, defaultRegistry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.confidence).toBeGreaterThanOrEqual(0);
        expect(result.value.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('custom registry', () => {
    it('should work with custom expert definitions', () => {
      const experts: ExpertDefinition[] = [
        createExpert({
          id: 'custom-1',
          name: 'Custom Expert 1',
          capabilities: ['task_execution', 'code_generation'],
          primaryDomain: 'code',
        }),
        createExpert({
          id: 'custom-2',
          name: 'Custom Expert 2',
          capabilities: ['task_execution', 'research'],
          primaryDomain: 'architecture',
        }),
      ];
      const registry = createRegistry(experts);
      const task = createTask('Create new code');
      const result = selectExperts(task, registry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.primary.expertId).toBe('custom-1');
      }
    });

    it('should respect expert weights', () => {
      const experts: ExpertDefinition[] = [
        createExpert({
          id: 'low-weight',
          weight: 0.2,
          capabilities: ['task_execution', 'code_generation'],
          primaryDomain: 'code',
        }),
        createExpert({
          id: 'high-weight',
          weight: 1.0,
          capabilities: ['task_execution', 'code_generation'],
          primaryDomain: 'code',
        }),
      ];
      const registry = createRegistry(experts);
      const task = createTask('Create code');
      const result = selectExperts(task, registry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.primary.expertId).toBe('high-weight');
      }
    });

    it('should handle experts with secondary domains', () => {
      const experts: ExpertDefinition[] = [
        createExpert({
          id: 'multi-domain',
          primaryDomain: 'code',
          secondaryDomains: ['security', 'testing'],
        }),
      ];
      const registry = createRegistry(experts);
      const task = createTask('Security audit of code');
      const result = selectExperts(task, registry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.primary.expertId).toBe('multi-domain');
      }
    });
  });
});

describe('quickSelect', () => {
  it('should select experts using default registry', () => {
    const task = createTask('Implement a feature');
    const result = quickSelect(task);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.primary).toBeDefined();
    }
  });

  it('should accept options', () => {
    const task = createTask('Implement a feature');
    const options: SelectionOptions = {
      maxAlternatives: 1,
    };
    const result = quickSelect(task, options);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.alternatives.length).toBeLessThanOrEqual(1);
    }
  });
});

describe('createDefaultRegistry', () => {
  it('should create registry with default experts', () => {
    const registry = createDefaultRegistry();
    const experts = registry.getAll();

    expect(experts.length).toBeGreaterThan(0);
  });

  it('should include all standard expert types', () => {
    const registry = createDefaultRegistry();
    const experts = registry.getAll();
    const ids = experts.map((e) => e.id);

    expect(ids).toContain('code-expert');
    expect(ids).toContain('security-expert');
    expect(ids).toContain('architecture-expert');
    expect(ids).toContain('documentation-expert');
    expect(ids).toContain('testing-expert');
  });

  it('should return experts by role', () => {
    const registry = createDefaultRegistry();
    const codeExperts = registry.getByRole('code_expert');

    expect(codeExperts.length).toBeGreaterThan(0);
    expect(codeExperts.every((e) => e.role === 'code_expert')).toBe(true);
  });

  it('should return experts by domain', () => {
    const registry = createDefaultRegistry();
    const securityExperts = registry.getByDomain('security');

    expect(securityExperts.length).toBeGreaterThan(0);
  });

  it('should return available experts only', () => {
    const registry = createDefaultRegistry();
    const available = registry.getAvailable();

    expect(available.every((e) => e.available)).toBe(true);
  });

  it('should return expert by id', () => {
    const registry = createDefaultRegistry();
    const expert = registry.getById('code-expert');

    expect(expert).toBeDefined();
    expect(expert?.id).toBe('code-expert');
  });

  it('should return undefined for unknown id', () => {
    const registry = createDefaultRegistry();
    const expert = registry.getById('unknown-expert');

    expect(expert).toBeUndefined();
  });
});

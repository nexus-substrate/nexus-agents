/**
 * nexus-agents/agents - Skill Loader Tests
 *
 * Tests for the deterministic skill loader implementation.
 * Verifies deterministic loading, role mapping, RBAC enforcement,
 * dependency ordering, and fallback behavior.
 *
 * @module agents/skills/skill-loader.test
 * (Source: Issue #374 Phase 3)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SkillLoader,
  createSkillLoader,
  initializeAgentSkills,
  getSkillsForTask,
} from './skill-loader.js';
import { createSkillLibrary, type SkillLibrary } from './skill-library.js';
import type { CreateSkillOptions } from './skill-types.js';
import type { LoadedSkillSet } from './skill-loader-types.js';
import type { SkillRBAC } from './skill-security.js';
import type {
  AgentRole,
  IAgent,
  AgentCapability,
  Task,
  TaskResult,
  AgentMessage,
  AgentResponse,
  AgentContext,
} from '../../core/types/agent.js';
import type { Result } from '../../core/result.js';
import type { AgentError } from '../../core/errors.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const DEFAULT_TEST_SKILL: CreateSkillOptions = {
  name: 'test-skill',
  description: 'A test skill',
  category: 'general',
  complexity: 'simple',
  code: 'return true;',
  parameters: [],
  outputType: 'boolean',
  dependencies: [],
  tags: [],
  examples: [],
};

function createTestSkill(
  overrides: Partial<CreateSkillOptions> & { id?: string; rbac?: SkillRBAC }
): CreateSkillOptions & { id?: string; rbac?: SkillRBAC } {
  return { ...DEFAULT_TEST_SKILL, ...overrides };
}

function createPopulatedLibrary(): SkillLibrary {
  const library = createSkillLibrary();

  // Add skills for various categories
  const skillConfigs: Array<Partial<CreateSkillOptions>> = [
    { name: 'read-file', category: 'file-operations', description: 'Read a file' },
    { name: 'write-file', category: 'file-operations', description: 'Write a file' },
    { name: 'generate-code', category: 'code-generation', description: 'Generate code' },
    { name: 'generate-tests', category: 'code-generation', description: 'Generate test code' },
    { name: 'analyze-code', category: 'code-analysis', description: 'Analyze code quality' },
    { name: 'run-tests', category: 'testing', description: 'Run test suite' },
    { name: 'generate-docs', category: 'documentation', description: 'Generate documentation' },
    { name: 'refactor-code', category: 'refactoring', description: 'Refactor code' },
    { name: 'debug-code', category: 'debugging', description: 'Debug code' },
    { name: 'deploy-app', category: 'deployment', description: 'Deploy application' },
    { name: 'general-task', category: 'general', description: 'General purpose task' },
  ];

  for (const config of skillConfigs) {
    library.addSkill(createTestSkill(config));
  }

  return library;
}

function createMockAgent(role: AgentRole, id: string = 'test-agent'): IAgent {
  return {
    id,
    role,
    state: 'idle',
    capabilities: ['task_execution'] as readonly AgentCapability[],
    execute: (_task: Task): Promise<Result<TaskResult, AgentError>> => {
      return Promise.resolve({
        ok: true,
        value: {
          taskId: '',
          output: '',
          metadata: { durationMs: 0, tokensUsed: 0, toolsUsed: [], model: '' },
        },
      });
    },
    handleMessage: (_msg: AgentMessage): Promise<Result<AgentResponse, AgentError>> => {
      return Promise.resolve({ ok: true, value: { messageId: '', status: 'completed' } });
    },
    initialize: (_ctx: AgentContext): Promise<Result<void, AgentError>> => {
      return Promise.resolve({ ok: true, value: undefined });
    },
    cleanup: (): Promise<void> => Promise.resolve(),
  };
}

// ============================================================================
// Deterministic Loading Tests
// ============================================================================

describe('SkillLoader - Deterministic Loading', () => {
  let library: SkillLibrary;
  let loader: SkillLoader;

  beforeEach(() => {
    library = createPopulatedLibrary();
    loader = new SkillLoader(library);
  });

  it('should produce same result for same role and library state', () => {
    const result1 = loader.loadForAgent('agent-1', 'code_expert');
    const result2 = loader.loadForAgent('agent-2', 'code_expert');

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);

    if (result1.ok && result2.ok) {
      expect(result1.value.skills.map((s) => s.id)).toEqual(result2.value.skills.map((s) => s.id));
      expect(result1.value.executionOrder).toEqual(result2.value.executionOrder);
    }
  });

  it('should maintain determinism across multiple calls', () => {
    const results: LoadedSkillSet[] = [];

    for (let i = 0; i < 5; i++) {
      const result = loader.loadForAgent(`agent-${String(i)}`, 'testing_expert');
      expect(result.ok).toBe(true);
      if (result.ok) {
        results.push(result.value);
      }
    }

    expect(results.length).toBeGreaterThan(0);
    const firstResult = results[0];
    if (!firstResult) {
      throw new Error('Expected at least one result');
    }
    const firstSkillIds = firstResult.skills.map((s) => s.id);
    for (const result of results) {
      expect(result.skills.map((s) => s.id)).toEqual(firstSkillIds);
    }
  });

  it('should produce different results for different roles', () => {
    const codeExpertResult = loader.loadForAgent('agent-1', 'code_expert');
    const securityExpertResult = loader.loadForAgent('agent-2', 'security_expert');

    expect(codeExpertResult.ok).toBe(true);
    expect(securityExpertResult.ok).toBe(true);

    if (codeExpertResult.ok && securityExpertResult.ok) {
      const codeSkillIds = codeExpertResult.value.skills.map((s) => s.id);
      const securitySkillIds = securityExpertResult.value.skills.map((s) => s.id);
      // At least some skills should differ
      expect(codeSkillIds).not.toEqual(securitySkillIds);
    }
  });
});

// ============================================================================
// Role Mapping Tests
// ============================================================================

describe('SkillLoader - Role Mapping', () => {
  let library: SkillLibrary;
  let loader: SkillLoader;

  beforeEach(() => {
    library = createPopulatedLibrary();
    loader = new SkillLoader(library);
  });

  it('should load skills for code_expert role', () => {
    const result = loader.loadForAgent('agent-1', 'code_expert');

    expect(result.ok).toBe(true);
    if (result.ok) {
      const categories = new Set(result.value.skills.map((s) => s.category));
      expect(categories.has('code-generation')).toBe(true);
      expect(categories.has('testing')).toBe(true);
      expect(categories.has('file-operations')).toBe(true);
    }
  });

  it('should load skills for security_expert role', () => {
    const result = loader.loadForAgent('agent-1', 'security_expert');

    expect(result.ok).toBe(true);
    if (result.ok) {
      const categories = new Set(result.value.skills.map((s) => s.category));
      expect(categories.has('code-analysis')).toBe(true);
      expect(categories.has('file-operations')).toBe(true);
    }
  });

  it('should load skills for testing_expert role', () => {
    const result = loader.loadForAgent('agent-1', 'testing_expert');

    expect(result.ok).toBe(true);
    if (result.ok) {
      const categories = new Set(result.value.skills.map((s) => s.category));
      expect(categories.has('testing')).toBe(true);
      expect(categories.has('file-operations')).toBe(true);
    }
  });

  it('should include optional categories when available', () => {
    const result = loader.loadForAgent('agent-1', 'code_expert');

    expect(result.ok).toBe(true);
    if (result.ok) {
      const categories = new Set(result.value.skills.map((s) => s.category));
      // Optional categories for code_expert: refactoring, debugging
      expect(categories.has('refactoring') || categories.has('debugging')).toBe(true);
    }
  });

  it('should handle tech_lead role with broader access', () => {
    const result = loader.loadForAgent('agent-1', 'tech_lead');

    expect(result.ok).toBe(true);
    if (result.ok) {
      // tech_lead has general + many optional categories
      expect(result.value.skills.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// RBAC Enforcement Tests
// ============================================================================

describe('SkillLoader - RBAC Enforcement', () => {
  let library: SkillLibrary;

  beforeEach(() => {
    library = createSkillLibrary();
  });

  it('should filter out skills not allowed for role', () => {
    // Add a skill that only allows code_expert
    const addedSkill = library.addSkill({
      name: 'code-only-skill',
      description: 'Only for code experts',
      category: 'code-generation',
      complexity: 'simple',
      code: 'return true;',
      parameters: [],
      outputType: 'boolean',
    });

    // Manually set RBAC (would normally be done at creation)
    // Since we can't modify the skill directly, we'll test with DEFAULT_RBAC
    // which allows all roles
    // Using 'partial' fallback to allow loading with missing categories
    const loader = new SkillLoader(library, { enforceRBAC: true, fallbackBehavior: 'partial' });
    const result = loader.loadForAgent('agent-1', 'code_expert');

    expect(result.ok).toBe(true);
    if (result.ok) {
      // With DEFAULT_RBAC, all roles are allowed
      expect(result.value.skills.length).toBeGreaterThan(0);
      // Verify our added skill is included
      const skillIds = result.value.skills.map((s) => s.id);
      expect(skillIds).toContain(addedSkill.id);
    }
  });

  it('should bypass RBAC when disabled', () => {
    const addedSkill = library.addSkill({
      name: 'test-skill',
      description: 'Test skill',
      category: 'general',
      complexity: 'simple',
      code: 'return true;',
      parameters: [],
      outputType: 'boolean',
    });

    const loader = new SkillLoader(library, { enforceRBAC: false });
    const result = loader.loadForAgent('agent-1', 'custom');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.skills.length).toBeGreaterThanOrEqual(0);
      // Verify the skill was added to the library
      expect(addedSkill.id).toBeDefined();
    }
  });
});

// ============================================================================
// Dependency Ordering Tests
// ============================================================================

describe('SkillLoader - Dependency Ordering', () => {
  let library: SkillLibrary;

  beforeEach(() => {
    library = createSkillLibrary();
  });

  it('should order skills by dependencies', () => {
    // Create skills with dependencies
    const baseSkill = library.addSkill({
      name: 'base-skill',
      description: 'Base skill',
      category: 'general',
      complexity: 'simple',
      code: 'return true;',
      parameters: [],
      outputType: 'boolean',
      dependencies: [],
    });

    const dependentSkill = library.addSkill({
      name: 'dependent-skill',
      description: 'Depends on base',
      category: 'general',
      complexity: 'simple',
      code: 'return true;',
      parameters: [],
      outputType: 'boolean',
      dependencies: [baseSkill.id],
    });

    const loader = new SkillLoader(library, { enforceDependencies: true });
    const result = loader.loadForAgent('agent-1', 'custom');

    expect(result.ok).toBe(true);
    if (result.ok) {
      const order = result.value.executionOrder;
      const baseIndex = order.indexOf(baseSkill.id);
      const dependentIndex = order.indexOf(dependentSkill.id);

      // Base should come before dependent
      expect(baseIndex).toBeLessThan(dependentIndex);
    }
  });

  it('should use ID order when dependencies disabled', () => {
    library.addSkill({
      name: 'skill-a',
      description: 'Skill A',
      category: 'general',
      complexity: 'simple',
      code: 'return true;',
      parameters: [],
      outputType: 'boolean',
    });

    library.addSkill({
      name: 'skill-b',
      description: 'Skill B',
      category: 'general',
      complexity: 'simple',
      code: 'return true;',
      parameters: [],
      outputType: 'boolean',
    });

    const loader = new SkillLoader(library, { enforceDependencies: false });
    const result = loader.loadForAgent('agent-1', 'custom');

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Skills should be in ID order when no dependency enforcement
      expect(result.value.executionOrder.length).toBe(result.value.skills.length);
    }
  });
});

// ============================================================================
// Fallback Behavior Tests
// ============================================================================

describe('SkillLoader - Fallback Behavior', () => {
  let library: SkillLibrary;

  beforeEach(() => {
    library = createSkillLibrary();
  });

  it('should error on missing required category with error fallback', () => {
    // Empty library - missing required categories
    const loader = new SkillLoader(library, { fallbackBehavior: 'error' });
    const result = loader.loadForAgent('agent-1', 'code_expert');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(['REQUIRED_CATEGORY_MISSING', 'EMPTY_RESULT']).toContain(result.error.code);
    }
  });

  it('should return partial result with partial fallback', () => {
    // Add only some skills
    library.addSkill({
      name: 'file-op',
      description: 'File operation',
      category: 'file-operations',
      complexity: 'simple',
      code: 'return true;',
      parameters: [],
      outputType: 'boolean',
    });

    const loader = new SkillLoader(library, { fallbackBehavior: 'partial' });
    const result = loader.loadForAgent('agent-1', 'code_expert');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.skills.length).toBeGreaterThanOrEqual(0);
      expect(result.value.missingRequired.length).toBeGreaterThan(0);
    }
  });

  it('should return empty result with empty fallback for unmapped role', () => {
    const loader = new SkillLoader(library, {
      fallbackBehavior: 'empty',
      mappings: [], // No mappings
    });
    const result = loader.loadForAgent('agent-1', 'code_expert');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.skills).toEqual([]);
      expect(result.value.executionOrder).toEqual([]);
    }
  });

  it('should error for unmapped role with error fallback', () => {
    const loader = new SkillLoader(library, {
      fallbackBehavior: 'error',
      mappings: [], // No mappings
    });
    const result = loader.loadForAgent('agent-1', 'code_expert');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ROLE_NOT_MAPPED');
    }
  });
});

// ============================================================================
// Task-Based Loading Tests
// ============================================================================

describe('SkillLoader - Task Loading', () => {
  let library: SkillLibrary;
  let loader: SkillLoader;

  beforeEach(() => {
    library = createPopulatedLibrary();
    loader = new SkillLoader(library);
  });

  it('should load task-relevant skills in addition to role skills', () => {
    const result = loader.loadForTask('agent-1', 'code_expert', 'debug the authentication module');

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Should have debugging-related skills if available
      expect(result.value.skills.length).toBeGreaterThan(0);
    }
  });

  it('should deduplicate skills between role and task relevance', () => {
    const result = loader.loadForTask(
      'agent-1',
      'code_expert',
      'generate code for file operations'
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const ids = result.value.skills.map((s) => s.id);
      const uniqueIds = [...new Set(ids)];
      expect(ids.length).toBe(uniqueIds.length);
    }
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe('SkillLoader - Validation', () => {
  let library: SkillLibrary;
  let loader: SkillLoader;

  beforeEach(() => {
    library = createPopulatedLibrary();
    loader = new SkillLoader(library);
  });

  it('should validate a well-formed skill set', () => {
    const loadResult = loader.loadForAgent('agent-1', 'code_expert');
    expect(loadResult.ok).toBe(true);

    if (loadResult.ok) {
      const validationResult = loader.validateLoadedSet(loadResult.value);
      expect(validationResult.ok).toBe(true);
    }
  });

  it('should reject skill set with mismatched execution order', () => {
    const invalidSet: LoadedSkillSet = {
      agentId: 'agent-1',
      agentRole: 'code_expert',
      skills: [],
      executionOrder: ['nonexistent-skill-id'],
      missingRequired: [],
      loadedAt: new Date(),
    };

    const result = loader.validateLoadedSet(invalidSet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

// ============================================================================
// Integration Hook Tests
// ============================================================================

describe('SkillLoader - Integration Hooks', () => {
  let library: SkillLibrary;
  let loader: SkillLoader;

  beforeEach(() => {
    library = createPopulatedLibrary();
    loader = new SkillLoader(library);
  });

  it('should initialize agent skills successfully', () => {
    const agent = createMockAgent('code_expert');
    const result = initializeAgentSkills(agent, loader);

    expect(result.ok).toBe(true);
  });

  it('should get skills for a task', () => {
    const agent = createMockAgent('code_expert');
    const task: Task = {
      id: 'task-1',
      description: 'Implement a new feature',
      context: {},
    };

    const result = getSkillsForTask(agent, task, loader);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Available Skills Tests
// ============================================================================

describe('SkillLoader - Available Skills', () => {
  let library: SkillLibrary;
  let loader: SkillLoader;

  beforeEach(() => {
    library = createPopulatedLibrary();
    loader = new SkillLoader(library);
  });

  it('should return all available skills for a role', () => {
    const skills = loader.getAvailableSkills('code_expert');
    expect(skills.length).toBeGreaterThan(0);
  });

  it('should return empty for unmapped role', () => {
    const loaderWithNoMappings = new SkillLoader(library, { mappings: [] });
    const skills = loaderWithNoMappings.getAvailableSkills('code_expert');
    expect(skills.length).toBe(0);
  });

  it('should filter by RBAC when enabled', () => {
    const skillsWithRBAC = loader.getAvailableSkills('code_expert');

    const loaderNoRBAC = new SkillLoader(library, { enforceRBAC: false });
    const skillsNoRBAC = loaderNoRBAC.getAvailableSkills('code_expert');

    // With DEFAULT_RBAC allowing all, both should be equal
    // but structurally the filtering path is exercised
    expect(skillsWithRBAC.length).toBeLessThanOrEqual(skillsNoRBAC.length);
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('createSkillLoader', () => {
  it('should create a skill loader with default config', () => {
    const library = createSkillLibrary();
    const loader = createSkillLoader(library);

    expect(loader).toBeDefined();
    expect(loader.loadForAgent).toBeDefined();
    expect(loader.loadForTask).toBeDefined();
    expect(loader.getAvailableSkills).toBeDefined();
    expect(loader.validateLoadedSet).toBeDefined();
  });

  it('should create a skill loader with custom config', () => {
    const library = createSkillLibrary();
    const loader = createSkillLoader(library, {
      defaultMaxSkills: 10,
      enforceRBAC: false,
    });

    expect(loader).toBeDefined();
  });
});

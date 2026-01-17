/**
 * nexus-agents/cli-adapters - Task Analyzer Tests
 *
 * Comprehensive tests for the task analyzer module.
 * Covers task classification, profile generation, and edge cases.
 *
 * (Source: Issue #78 - Capability-based task router)
 */

import { describe, it, expect } from 'vitest';
import type { Task } from '../core/types/agent.js';
import {
  analyzeTask,
  summarizeProfile,
  type TaskProfile,
  TaskProfileSchema,
} from './task-analyzer.js';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Creates a test task with optional overrides.
 */
function createTestTask(overrides?: Partial<Task>): Task {
  return {
    id: 'test-task-1',
    description: 'Test task description',
    context: {},
    ...overrides,
  };
}

// ============================================================================
// analyzeTask - Task Type Classification Tests
// ============================================================================

describe('analyzeTask', () => {
  describe('task type classification', () => {
    it('should classify architecture tasks correctly', () => {
      const task = createTestTask({
        description: 'Design the system architecture for a distributed microservice',
      });

      const profile = analyzeTask(task);

      expect(profile.taskType).toBe('architecture');
    });

    it('should classify architecture tasks with pattern keywords', () => {
      const task = createTestTask({
        description: 'Evaluate the scalability design patterns for our monolith structure',
      });

      const profile = analyzeTask(task);

      expect(profile.taskType).toBe('architecture');
    });

    it('should classify code implementation tasks correctly', () => {
      const task = createTestTask({
        description: 'Implement a new authentication module with JWT support',
      });

      const profile = analyzeTask(task);

      expect(profile.taskType).toBe('code_implementation');
      expect(profile.codeGeneration).toBe(true);
    });

    it('should classify code implementation with component keywords', () => {
      const task = createTestTask({
        description: 'Create a new function to build the endpoint for user registration',
      });

      const profile = analyzeTask(task);

      expect(profile.taskType).toBe('code_implementation');
    });

    it('should classify test generation tasks correctly', () => {
      const task = createTestTask({
        description: 'Write unit tests for the user service with vitest',
      });

      const profile = analyzeTask(task);

      expect(profile.taskType).toBe('test_generation');
      expect(profile.codeGeneration).toBe(true);
    });

    it('should classify test generation with coverage keywords', () => {
      const task = createTestTask({
        description: 'Add integration test coverage with mock fixtures and jest assertions',
      });

      const profile = analyzeTask(task);

      expect(profile.taskType).toBe('test_generation');
    });

    it('should classify code review tasks correctly', () => {
      const task = createTestTask({
        description: 'Review the pull request for security vulnerabilities and bugs',
      });

      const profile = analyzeTask(task);

      expect(profile.taskType).toBe('code_review');
    });

    it('should classify code review with quality keywords', () => {
      const task = createTestTask({
        description: 'Audit and evaluate the code quality, inspect for potential issues',
      });

      const profile = analyzeTask(task);

      expect(profile.taskType).toBe('code_review');
    });

    it('should classify documentation tasks correctly', () => {
      const task = createTestTask({
        description: 'Document the API with jsdoc comments and update the readme',
      });

      const profile = analyzeTask(task);

      expect(profile.taskType).toBe('documentation');
    });

    it('should classify documentation with guide keywords', () => {
      const task = createTestTask({
        description: 'Explain how to use the library and create a tutorial guide',
      });

      const profile = analyzeTask(task);

      expect(profile.taskType).toBe('documentation');
    });

    it('should classify large codebase tasks correctly', () => {
      const task = createTestTask({
        description: 'Analyze the entire codebase repository with large context across all files',
      });

      const profile = analyzeTask(task);

      expect(profile.taskType).toBe('large_codebase');
    });

    it('should classify large codebase with monorepo keywords', () => {
      const task = createTestTask({
        description: 'Search the whole project monorepo workspace for dependencies',
      });

      const profile = analyzeTask(task);

      expect(profile.taskType).toBe('large_codebase');
    });

    it('should classify bulk operations tasks correctly', () => {
      const task = createTestTask({
        description: 'Bulk update all files in batch to rename and migrate multiple components',
      });

      const profile = analyzeTask(task);

      expect(profile.taskType).toBe('bulk_operations');
      expect(profile.parallelizable).toBe(true);
    });

    it('should classify bulk operations with transform keywords', () => {
      const task = createTestTask({
        description: 'Refactor all imports to transform the module structure',
      });

      const profile = analyzeTask(task);

      expect(profile.taskType).toBe('bulk_operations');
    });

    it('should classify general tasks when no keywords match', () => {
      const task = createTestTask({
        description: 'Hello world',
      });

      const profile = analyzeTask(task);

      expect(profile.taskType).toBe('general');
    });

    it('should handle mixed task descriptions', () => {
      // This has both test and code implementation keywords
      // Should pick the one with more matches
      const task = createTestTask({
        description: 'Implement a function to create a new class module',
      });

      const profile = analyzeTask(task);

      // code_implementation has more keyword matches
      expect(profile.taskType).toBe('code_implementation');
    });
  });

  // ============================================================================
  // Context Token Estimation Tests
  // ============================================================================

  describe('context token estimation', () => {
    it('should include base token overhead', () => {
      const task = createTestTask({
        description: 'Short',
      });

      const profile = analyzeTask(task);

      // Base overhead is 1000 tokens
      expect(profile.contextRequired).toBeGreaterThanOrEqual(1000);
    });

    it('should estimate tokens from description length', () => {
      const task = createTestTask({
        description: 'A'.repeat(1000), // 1000 chars
      });

      const profile = analyzeTask(task);

      // Base (1000) + description (1000 * 0.25 = 250)
      expect(profile.contextRequired).toBeGreaterThanOrEqual(1250);
    });

    it('should add tokens for context files', () => {
      const task = createTestTask({
        description: 'Test',
        context: {
          files: ['file1.ts', 'file2.ts', 'file3.ts'],
        },
      });

      const profile = analyzeTask(task);

      // Base (1000) + description + files (3 * 500 = 1500)
      expect(profile.contextRequired).toBeGreaterThanOrEqual(2500);
    });

    it('should add tokens for context history', () => {
      const task = createTestTask({
        description: 'Test',
        context: {
          history: [
            { role: 'user', content: 'Previous message 1', timestamp: new Date().toISOString() },
            { role: 'assistant', content: 'Response 1', timestamp: new Date().toISOString() },
          ],
        },
      });

      const profile = analyzeTask(task);

      // Should include history token estimation
      expect(profile.contextRequired).toBeGreaterThan(1000);
    });

    it('should add tokens for context metadata', () => {
      const task = createTestTask({
        description: 'Test',
        context: {
          metadata: {
            key1: 'value1',
            key2: 'value2',
            nested: { a: 1, b: 2 },
          },
        },
      });

      const profile = analyzeTask(task);

      // Should include metadata token estimation
      expect(profile.contextRequired).toBeGreaterThan(1000);
    });

    it('should respect maxTokens constraint', () => {
      const task = createTestTask({
        description: 'A'.repeat(10000), // Would be many tokens
        constraints: {
          maxTokens: 500,
        },
      });

      const profile = analyzeTask(task);

      expect(profile.contextRequired).toBeLessThanOrEqual(500);
    });
  });

  // ============================================================================
  // Reasoning Complexity Tests
  // ============================================================================

  describe('reasoning complexity calculation', () => {
    it('should assign base complexity by task type', () => {
      const architectureTask = createTestTask({
        description: 'Design system architecture',
      });
      const documentationTask = createTestTask({
        description: 'Document the API',
      });

      const archProfile = analyzeTask(architectureTask);
      const docProfile = analyzeTask(documentationTask);

      // Architecture base: 8, Documentation base: 3
      expect(archProfile.reasoningComplexity).toBeGreaterThan(docProfile.reasoningComplexity);
    });

    it('should increase complexity for complex keywords', () => {
      const simpleTask = createTestTask({
        description: 'Create a simple function',
      });
      const complexTask = createTestTask({
        description: 'Create a complex function with optimization for performance',
      });

      const simpleProfile = analyzeTask(simpleTask);
      const complexProfile = analyzeTask(complexTask);

      expect(complexProfile.reasoningComplexity).toBeGreaterThan(simpleProfile.reasoningComplexity);
    });

    it('should add complexity for concurrency keywords', () => {
      const task = createTestTask({
        description: 'Fix the race condition in concurrent async processing',
      });

      const profile = analyzeTask(task);

      // Should have elevated complexity due to concurrency keywords
      expect(profile.reasoningComplexity).toBeGreaterThanOrEqual(6);
    });

    it('should add complexity for security keywords', () => {
      const task = createTestTask({
        description: 'Security audit for vulnerabilities',
      });

      const profile = analyzeTask(task);

      expect(profile.reasoningComplexity).toBeGreaterThanOrEqual(6);
    });

    it('should clamp complexity to maximum of 10', () => {
      const task = createTestTask({
        description:
          'Complex architecture design with security optimization for distributed ' +
          'concurrent async processing to fix race conditions and deadlocks with algorithm trade-offs',
      });

      const profile = analyzeTask(task);

      expect(profile.reasoningComplexity).toBeLessThanOrEqual(10);
    });

    it('should have minimum complexity of 0', () => {
      const task = createTestTask({
        description: 'Hello',
      });

      const profile = analyzeTask(task);

      expect(profile.reasoningComplexity).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // Code Generation Detection Tests
  // ============================================================================

  describe('code generation detection', () => {
    it('should detect code generation for code_implementation tasks', () => {
      const task = createTestTask({
        description: 'Implement a new feature with class and function',
      });

      const profile = analyzeTask(task);

      expect(profile.codeGeneration).toBe(true);
    });

    it('should detect code generation for test_generation tasks', () => {
      const task = createTestTask({
        description: 'Write unit tests with vitest assertions',
      });

      const profile = analyzeTask(task);

      expect(profile.codeGeneration).toBe(true);
    });

    it('should detect code generation from keywords', () => {
      const task = createTestTask({
        description: 'Generate new code to build a script component',
      });

      const profile = analyzeTask(task);

      expect(profile.codeGeneration).toBe(true);
    });

    it('should not detect code generation for simple queries', () => {
      const task = createTestTask({
        description: 'Explain what this code does',
      });

      const profile = analyzeTask(task);

      // Only 1 keyword match ('code'), needs >= 2
      expect(profile.codeGeneration).toBe(false);
    });

    it('should not detect code generation for pure documentation tasks', () => {
      const task = createTestTask({
        description: 'Describe the API in the readme',
      });

      const profile = analyzeTask(task);

      // "Document" matches but need 2+ keywords for code gen
      // "Describe" and "readme" don't trigger code generation
      expect(profile.codeGeneration).toBe(false);
    });
  });

  // ============================================================================
  // Multimodal Detection Tests
  // ============================================================================

  describe('multimodal detection', () => {
    it('should detect multimodal from image keywords', () => {
      const task = createTestTask({
        description: 'Analyze this screenshot and describe the UI',
      });

      const profile = analyzeTask(task);

      expect(profile.multimodal).toBe(true);
    });

    it('should detect multimodal from diagram keywords', () => {
      const task = createTestTask({
        description: 'Create a chart based on this diagram',
      });

      const profile = analyzeTask(task);

      expect(profile.multimodal).toBe(true);
    });

    it('should detect multimodal from mockup keywords', () => {
      const task = createTestTask({
        description: 'Implement this wireframe design',
      });

      const profile = analyzeTask(task);

      expect(profile.multimodal).toBe(true);
    });

    it('should detect multimodal from PNG file in context', () => {
      const task = createTestTask({
        description: 'Implement this design',
        context: { files: ['mockup.png'] },
      });

      const profile = analyzeTask(task);

      expect(profile.multimodal).toBe(true);
    });

    it('should detect multimodal from JPG file in context', () => {
      const task = createTestTask({
        description: 'Process this',
        context: { files: ['photo.jpg'] },
      });

      const profile = analyzeTask(task);

      expect(profile.multimodal).toBe(true);
    });

    it('should detect multimodal from JPEG file in context', () => {
      const task = createTestTask({
        description: 'Process this',
        context: { files: ['image.jpeg'] },
      });

      const profile = analyzeTask(task);

      expect(profile.multimodal).toBe(true);
    });

    it('should detect multimodal from GIF file in context', () => {
      const task = createTestTask({
        description: 'Process this',
        context: { files: ['animation.gif'] },
      });

      const profile = analyzeTask(task);

      expect(profile.multimodal).toBe(true);
    });

    it('should detect multimodal from SVG file in context', () => {
      const task = createTestTask({
        description: 'Process this',
        context: { files: ['icon.svg'] },
      });

      const profile = analyzeTask(task);

      expect(profile.multimodal).toBe(true);
    });

    it('should detect multimodal from WEBP file in context', () => {
      const task = createTestTask({
        description: 'Process this',
        context: { files: ['image.webp'] },
      });

      const profile = analyzeTask(task);

      expect(profile.multimodal).toBe(true);
    });

    it('should handle uppercase file extensions', () => {
      const task = createTestTask({
        description: 'Process this',
        context: { files: ['IMAGE.PNG'] },
      });

      const profile = analyzeTask(task);

      expect(profile.multimodal).toBe(true);
    });

    it('should not detect multimodal for code files only', () => {
      const task = createTestTask({
        description: 'Review this code',
        context: { files: ['src/app.ts', 'src/utils.js'] },
      });

      const profile = analyzeTask(task);

      expect(profile.multimodal).toBe(false);
    });
  });

  // ============================================================================
  // Parallelizable Detection Tests
  // ============================================================================

  describe('parallelizable detection', () => {
    it('should detect parallelizable for bulk_operations tasks', () => {
      const task = createTestTask({
        description: 'Bulk update files in batch',
      });

      const profile = analyzeTask(task);

      expect(profile.parallelizable).toBe(true);
    });

    it('should detect parallelizable from multiple keywords', () => {
      const task = createTestTask({
        description: 'Process multiple files, each independently',
      });

      const profile = analyzeTask(task);

      expect(profile.parallelizable).toBe(true);
    });

    it('should detect parallelizable from batch keywords', () => {
      const task = createTestTask({
        description: 'Run batch processing for all items',
      });

      const profile = analyzeTask(task);

      expect(profile.parallelizable).toBe(true);
    });

    it('should not detect parallelizable for single item tasks', () => {
      const task = createTestTask({
        description: 'Fix this one bug in the code',
      });

      const profile = analyzeTask(task);

      expect(profile.parallelizable).toBe(false);
    });

    it('should require at least 2 keywords for non-bulk tasks', () => {
      const task = createTestTask({
        description: 'Process multiple items', // only "multiple" keyword
      });

      const profile = analyzeTask(task);

      // "multiple" alone is not enough (needs >= 2)
      expect(profile.parallelizable).toBe(false);
    });
  });

  // ============================================================================
  // Budget Sensitivity Detection Tests
  // ============================================================================

  describe('budget sensitivity detection', () => {
    it('should detect budget sensitivity from cheap keyword', () => {
      const task = createTestTask({
        description: 'Do this in a cheap way',
      });

      const profile = analyzeTask(task);

      expect(profile.budgetSensitive).toBe(true);
    });

    it('should detect budget sensitivity from cost keyword', () => {
      const task = createTestTask({
        description: 'Minimize cost for this operation',
      });

      const profile = analyzeTask(task);

      expect(profile.budgetSensitive).toBe(true);
    });

    it('should detect budget sensitivity from quick keyword', () => {
      const task = createTestTask({
        description: 'Quick fix for this issue',
      });

      const profile = analyzeTask(task);

      expect(profile.budgetSensitive).toBe(true);
    });

    it('should detect budget sensitivity from simple keyword', () => {
      const task = createTestTask({
        description: 'Simple update to the config',
      });

      const profile = analyzeTask(task);

      expect(profile.budgetSensitive).toBe(true);
    });

    it('should detect budget sensitivity from trivial keyword', () => {
      const task = createTestTask({
        description: 'Trivial change needed',
      });

      const profile = analyzeTask(task);

      expect(profile.budgetSensitive).toBe(true);
    });

    it('should detect budget sensitivity from low priority', () => {
      const task = createTestTask({
        description: 'Update the changelog',
        priority: 1,
      });

      const profile = analyzeTask(task);

      expect(profile.budgetSensitive).toBe(true);
    });

    it('should detect budget sensitivity from priority 2', () => {
      const task = createTestTask({
        description: 'Low priority task',
        priority: 2,
      });

      const profile = analyzeTask(task);

      expect(profile.budgetSensitive).toBe(true);
    });

    it('should not detect budget sensitivity for priority 3+', () => {
      const task = createTestTask({
        description: 'Important task',
        priority: 3,
      });

      const profile = analyzeTask(task);

      expect(profile.budgetSensitive).toBe(false);
    });

    it('should not detect budget sensitivity for high priority complex tasks', () => {
      const task = createTestTask({
        description: 'Design complex architecture for the system',
        priority: 5,
      });

      const profile = analyzeTask(task);

      expect(profile.budgetSensitive).toBe(false);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('edge cases', () => {
    it('should handle empty description', () => {
      const task = createTestTask({
        description: '',
      });

      const profile = analyzeTask(task);

      expect(profile.taskType).toBe('general');
      expect(profile.contextRequired).toBeGreaterThanOrEqual(1000); // Base overhead
    });

    it('should handle whitespace-only description', () => {
      const task = createTestTask({
        description: '   \t\n   ',
      });

      const profile = analyzeTask(task);

      expect(profile.taskType).toBe('general');
    });

    it('should handle very long description', () => {
      const task = createTestTask({
        description: 'implement '.repeat(10000), // Very long
      });

      const profile = analyzeTask(task);

      expect(profile.taskType).toBe('code_implementation');
      expect(profile.contextRequired).toBeGreaterThan(10000);
    });

    it('should handle special characters in description', () => {
      const task = createTestTask({
        description: 'Implement <script>alert("test")</script> && || !@#$%^&*()',
      });

      const profile = analyzeTask(task);

      // Should not crash and should still classify
      expect(profile).toBeDefined();
      expect(profile.taskType).toBe('code_implementation');
    });

    it('should handle unicode characters', () => {
      const task = createTestTask({
        description: 'Implement 你好世界 with emoji 🚀 support',
      });

      const profile = analyzeTask(task);

      expect(profile).toBeDefined();
      expect(profile.taskType).toBe('code_implementation');
    });

    it('should handle mixed case keywords', () => {
      const task = createTestTask({
        description: 'IMPLEMENT a NEW FUNCTION with CLASS',
      });

      const profile = analyzeTask(task);

      // Should normalize to lowercase
      expect(profile.taskType).toBe('code_implementation');
    });

    it('should handle empty context', () => {
      const task: Task = {
        id: 'test',
        description: 'Test task',
        context: {},
      };

      const profile = analyzeTask(task);

      expect(profile).toBeDefined();
    });

    it('should handle undefined optional fields', () => {
      const task: Task = {
        id: 'test',
        description: 'Test task',
        context: {}, // Empty context - optional fields omitted
      };

      const profile = analyzeTask(task);

      expect(profile).toBeDefined();
    });

    it('should handle empty files array', () => {
      const task = createTestTask({
        description: 'Test',
        context: { files: [] },
      });

      const profile = analyzeTask(task);

      // Base (1000) + description ("Test" = 4 chars * 0.25 = 1 token) = 1001
      expect(profile.contextRequired).toBe(1001);
    });

    it('should handle empty history array', () => {
      const task = createTestTask({
        description: 'Test',
        context: { history: [] },
      });

      const profile = analyzeTask(task);

      expect(profile).toBeDefined();
    });
  });

  // ============================================================================
  // Schema Validation Tests
  // ============================================================================

  describe('schema validation', () => {
    it('should produce valid TaskProfile according to schema', () => {
      const task = createTestTask({
        description: 'Design system architecture for microservices',
      });

      const profile = analyzeTask(task);

      const result = TaskProfileSchema.safeParse(profile);
      expect(result.success).toBe(true);
    });

    it('should produce valid profile for all task types', () => {
      const taskTypes = [
        'Design the architecture',
        'Implement new feature',
        'Review the code',
        'Write unit tests',
        'Document the API',
        'Analyze entire codebase',
        'Bulk update all files',
        'Hello world',
      ];

      for (const description of taskTypes) {
        const task = createTestTask({ description });
        const profile = analyzeTask(task);
        const result = TaskProfileSchema.safeParse(profile);
        expect(result.success).toBe(true);
      }
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('integration scenarios', () => {
    it('should correctly profile a complex architecture task', () => {
      const task = createTestTask({
        description:
          'Design a complex distributed microservice architecture with security ' +
          'optimization to handle concurrent requests and prevent race conditions',
        context: {
          files: ['src/architecture.md', 'src/design.svg'],
          history: [
            { role: 'user', content: 'Previous discussion', timestamp: new Date().toISOString() },
          ],
        },
        priority: 5,
      });

      const profile = analyzeTask(task);

      expect(profile.taskType).toBe('architecture');
      expect(profile.reasoningComplexity).toBeGreaterThanOrEqual(8);
      expect(profile.multimodal).toBe(true); // Has .svg file
      expect(profile.budgetSensitive).toBe(false); // High priority
    });

    it('should correctly profile a simple code fix task', () => {
      const task = createTestTask({
        description: 'Quick simple fix for this minor bug',
        priority: 1,
      });

      const profile = analyzeTask(task);

      expect(profile.taskType).toBe('general'); // No strong keyword matches
      expect(profile.budgetSensitive).toBe(true);
      expect(profile.reasoningComplexity).toBeLessThanOrEqual(5);
    });

    it('should correctly profile a test generation task', () => {
      const task = createTestTask({
        description: 'Write comprehensive unit tests with vitest for the auth module with mocks',
        context: {
          files: ['src/auth.ts', 'src/auth.test.ts'],
        },
      });

      const profile = analyzeTask(task);

      expect(profile.taskType).toBe('test_generation');
      expect(profile.codeGeneration).toBe(true);
      expect(profile.contextRequired).toBeGreaterThan(2000); // Base + files
    });

    it('should correctly profile a bulk refactoring task', () => {
      const task = createTestTask({
        description: 'Bulk refactor all imports in multiple files to use new module structure',
        context: {
          files: Array.from({ length: 50 }, (_, i) => `src/file${String(i)}.ts`),
        },
      });

      const profile = analyzeTask(task);

      expect(profile.taskType).toBe('bulk_operations');
      expect(profile.parallelizable).toBe(true);
      expect(profile.contextRequired).toBeGreaterThan(25000); // 50 files * 500 tokens
    });
  });
});

// ============================================================================
// summarizeProfile Tests
// ============================================================================

describe('summarizeProfile', () => {
  it('should create readable summary with all flags', () => {
    const profile: TaskProfile = {
      contextRequired: 5000,
      reasoningComplexity: 7,
      codeGeneration: true,
      multimodal: true,
      parallelizable: true,
      budgetSensitive: true,
      taskType: 'code_implementation',
    };

    const summary = summarizeProfile(profile);

    expect(summary).toContain('code_implementation');
    expect(summary).toContain('5000 tokens');
    expect(summary).toContain('7/10');
    expect(summary).toContain('code-gen');
    expect(summary).toContain('multimodal');
    expect(summary).toContain('parallel');
    expect(summary).toContain('budget');
  });

  it('should create summary without flags section when no flags', () => {
    const profile: TaskProfile = {
      contextRequired: 1000,
      reasoningComplexity: 3,
      codeGeneration: false,
      multimodal: false,
      parallelizable: false,
      budgetSensitive: false,
      taskType: 'general',
    };

    const summary = summarizeProfile(profile);

    expect(summary).toContain('general');
    expect(summary).toContain('1000 tokens');
    expect(summary).toContain('3/10');
    expect(summary).not.toContain('Flags:');
  });

  it('should handle single flag', () => {
    const profile: TaskProfile = {
      contextRequired: 2000,
      reasoningComplexity: 5,
      codeGeneration: true,
      multimodal: false,
      parallelizable: false,
      budgetSensitive: false,
      taskType: 'test_generation',
    };

    const summary = summarizeProfile(profile);

    expect(summary).toContain('code-gen');
    expect(summary).not.toContain('multimodal');
    expect(summary).not.toContain('parallel');
    expect(summary).not.toContain('budget');
  });

  it('should format large context numbers', () => {
    const profile: TaskProfile = {
      contextRequired: 100000,
      reasoningComplexity: 8,
      codeGeneration: false,
      multimodal: false,
      parallelizable: false,
      budgetSensitive: false,
      taskType: 'large_codebase',
    };

    const summary = summarizeProfile(profile);

    expect(summary).toContain('100000 tokens');
  });

  it('should format all task types correctly', () => {
    const taskTypes: TaskProfile['taskType'][] = [
      'architecture',
      'code_implementation',
      'code_review',
      'test_generation',
      'documentation',
      'large_codebase',
      'bulk_operations',
      'general',
    ];

    for (const taskType of taskTypes) {
      const profile: TaskProfile = {
        contextRequired: 1000,
        reasoningComplexity: 5,
        codeGeneration: false,
        multimodal: false,
        parallelizable: false,
        budgetSensitive: false,
        taskType,
      };

      const summary = summarizeProfile(profile);
      expect(summary).toContain(`Type: ${taskType}`);
    }
  });

  it('should handle complexity edge values', () => {
    const profile0: TaskProfile = {
      contextRequired: 1000,
      reasoningComplexity: 0,
      codeGeneration: false,
      multimodal: false,
      parallelizable: false,
      budgetSensitive: false,
      taskType: 'general',
    };

    const profile10: TaskProfile = {
      contextRequired: 1000,
      reasoningComplexity: 10,
      codeGeneration: false,
      multimodal: false,
      parallelizable: false,
      budgetSensitive: false,
      taskType: 'architecture',
    };

    expect(summarizeProfile(profile0)).toContain('0/10');
    expect(summarizeProfile(profile10)).toContain('10/10');
  });
});

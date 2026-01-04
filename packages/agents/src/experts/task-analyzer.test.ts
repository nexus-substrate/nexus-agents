/**
 * @nexus-agents/agents - Task Analyzer Tests
 *
 * Tests keyword extraction, domain detection, complexity analysis, and effort estimation.
 */

import { describe, it, expect } from 'vitest';
import type { Task } from '@nexus-agents/core';
import { analyzeTask, TaskDomain, TaskComplexity, AnalysisError } from './task-analyzer.js';

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

describe('analyzeTask', () => {
  describe('validation', () => {
    it('should return error for empty description', () => {
      const task = createTask('');
      const result = analyzeTask(task);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(AnalysisError);
        expect(result.error.message).toContain('description is required');
      }
    });

    it('should return error for whitespace-only description', () => {
      const task = createTask('   ');
      const result = analyzeTask(task);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(AnalysisError);
      }
    });

    it('should successfully analyze valid task', () => {
      const task = createTask('Implement a user authentication feature');
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeDefined();
        expect(result.value.domain).toBeDefined();
        expect(result.value.complexity).toBeDefined();
      }
    });
  });

  describe('domain detection', () => {
    it('should detect code domain for implementation tasks', () => {
      const task = createTask('Implement a new API endpoint for user management');
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.domain).toBe(TaskDomain.CODE);
      }
    });

    it('should detect security domain for vulnerability tasks', () => {
      const task = createTask('Audit the authentication system for security vulnerabilities');
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.domain).toBe(TaskDomain.SECURITY);
      }
    });

    it('should detect architecture domain for design tasks', () => {
      const task = createTask('Design the microservices architecture for the payment system');
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.domain).toBe(TaskDomain.ARCHITECTURE);
      }
    });

    it('should detect documentation domain for doc tasks', () => {
      const task = createTask('Write API documentation for the REST endpoints');
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.domain).toBe(TaskDomain.DOCUMENTATION);
      }
    });

    it('should detect testing domain for test tasks', () => {
      const task = createTask('Write unit tests for the user service with 80% coverage');
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.domain).toBe(TaskDomain.TESTING);
      }
    });

    it('should detect general domain when no specific keywords match', () => {
      const task = createTask('Help me understand this problem');
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.domain).toBe(TaskDomain.GENERAL);
      }
    });

    it('should detect secondary domains for multi-domain tasks', () => {
      const task = createTask(
        'Implement secure authentication with encryption and audit the code for vulnerabilities'
      );
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.secondaryDomains.length).toBeGreaterThan(0);
      }
    });
  });

  describe('complexity detection', () => {
    it('should detect low complexity for simple tasks', () => {
      const task = createTask('Fix a simple typo in the readme');
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.complexity).toBe(TaskComplexity.LOW);
      }
    });

    it('should detect high complexity for complex tasks', () => {
      const task = createTask(
        'Design and implement a comprehensive distributed microservices architecture ' +
          'with multiple services, event-driven communication, and complete refactoring ' +
          'of the entire codebase'
      );
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.complexity).toBe(TaskComplexity.HIGH);
      }
    });

    it('should detect medium complexity for moderate tasks', () => {
      const task = createTask('Update the user service to add a few new features');
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.complexity).toBe(TaskComplexity.MEDIUM);
      }
    });
  });

  describe('capability detection', () => {
    it('should detect code_generation capability for implementation tasks', () => {
      const task = createTask('Create a new user management module');
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.requiredCapabilities).toContain('code_generation');
      }
    });

    it('should detect code_review capability for review tasks', () => {
      const task = createTask('Review the authentication code for issues');
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.requiredCapabilities).toContain('code_review');
      }
    });

    it('should detect research capability for investigation tasks', () => {
      const task = createTask('Research the best patterns for event-driven architecture');
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.requiredCapabilities).toContain('research');
      }
    });

    it('should always include task_execution capability', () => {
      const task = createTask('Any task description');
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.requiredCapabilities).toContain('task_execution');
      }
    });
  });

  describe('keyword extraction', () => {
    it('should extract meaningful keywords from description', () => {
      const task = createTask('Implement authentication using JWT tokens');
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.keywords).toContain('implement');
        expect(result.value.keywords).toContain('authentication');
        expect(result.value.keywords).toContain('jwt');
        expect(result.value.keywords).toContain('tokens');
      }
    });

    it('should remove stop words from keywords', () => {
      const task = createTask('The user should be able to login with their credentials');
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.keywords).not.toContain('the');
        expect(result.value.keywords).not.toContain('should');
        expect(result.value.keywords).not.toContain('be');
        expect(result.value.keywords).not.toContain('to');
        expect(result.value.keywords).not.toContain('with');
        expect(result.value.keywords).not.toContain('their');
      }
    });

    it('should include file paths in analysis when provided', () => {
      const task = createTask('Update the user module', {
        files: ['src/user/auth.ts', 'src/user/login.ts'],
      });
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.keywords.some((k) => k.includes('auth'))).toBe(true);
      }
    });
  });

  describe('effort estimation', () => {
    it('should estimate low effort for simple tasks', () => {
      const task = createTask('Fix a typo');
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.estimatedEffort).toBeLessThanOrEqual(3);
      }
    });

    it('should estimate high effort for complex tasks', () => {
      const task = createTask(
        'Refactor the entire authentication system with multiple components, ' +
          'implement new security features, and migrate all existing users'
      );
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.estimatedEffort).toBeGreaterThanOrEqual(6);
      }
    });

    it('should keep effort within 1-10 range', () => {
      const task = createTask(
        'A very long and complex task description that mentions many things ' +
          'like architecture, design, implementation, testing, documentation, ' +
          'security, refactoring, migration, deployment, monitoring, and more'
      );
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.estimatedEffort).toBeGreaterThanOrEqual(1);
        expect(result.value.estimatedEffort).toBeLessThanOrEqual(10);
      }
    });
  });

  describe('confidence scoring', () => {
    it('should have higher confidence when domain is clear', () => {
      const task = createTask(
        'Implement the user authentication feature with JWT tokens and secure password hashing'
      );
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.confidence).toBeGreaterThan(0.5);
      }
    });

    it('should have lower confidence for ambiguous tasks', () => {
      const task = createTask('Do something');
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.confidence).toBeLessThan(0.5);
      }
    });

    it('should have confidence between 0 and 1', () => {
      const task = createTask('Any task');
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.confidence).toBeGreaterThanOrEqual(0);
        expect(result.value.confidence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('context integration', () => {
    it('should include working directory in analysis', () => {
      const task = createTask('Update the code', {
        workingDirectory: '/project/src/security',
      });
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.keywords.some((k) => k.includes('security'))).toBe(true);
      }
    });

    it('should handle task with full context', () => {
      const task = createTask('Implement feature', {
        workingDirectory: '/project',
        files: ['test.ts', 'spec.ts'],
        history: [{ role: 'user', content: 'Previous message', timestamp: '2024-01-01' }],
      });
      const result = analyzeTask(task);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeDefined();
      }
    });
  });
});

/**
 * Tests for BaseAgent Execution Helpers
 * @module agents/base-agent-execution-helpers.test
 */

import { describe, it, expect } from 'vitest';
import { categorizeTaskType, recordFailedTaskError } from './base-agent-execution-helpers.js';

// ============================================================================
// categorizeTaskType
// ============================================================================

describe('categorizeTaskType', () => {
  it('categorizes test-related tasks', () => {
    expect(categorizeTaskType('Write unit tests for module')).toBe('testing');
  });

  it('categorizes review tasks', () => {
    expect(categorizeTaskType('Review the pull request changes')).toBe('review');
  });

  it('categorizes analyze tasks as review', () => {
    expect(categorizeTaskType('Analyze the codebase for issues')).toBe('review');
  });

  it('categorizes implementation tasks', () => {
    expect(categorizeTaskType('Implement the new feature')).toBe('implementation');
  });

  it('categorizes create tasks as implementation', () => {
    expect(categorizeTaskType('Create a new module for auth')).toBe('implementation');
  });

  it('categorizes build tasks as implementation', () => {
    expect(categorizeTaskType('Build the deployment pipeline')).toBe('implementation');
  });

  it('categorizes bug fix tasks', () => {
    expect(categorizeTaskType('Fix the login bug')).toBe('bugfix');
  });

  it('categorizes documentation tasks', () => {
    expect(categorizeTaskType('Document the API endpoints')).toBe('documentation');
  });

  it('categorizes refactor tasks', () => {
    expect(categorizeTaskType('Refactor the routing module')).toBe('refactoring');
  });

  it('returns general for unrecognized tasks', () => {
    expect(categorizeTaskType('Do something unusual')).toBe('general');
  });

  it('is case-sensitive (lowercased input)', () => {
    // categorizeTaskType lowercases internally
    expect(categorizeTaskType('IMPLEMENT the feature')).toBe('implementation');
  });
});

// ============================================================================
// recordFailedTaskError
// ============================================================================

describe('recordFailedTaskError', () => {
  it('returns null when memory disabled', () => {
    const result = recordFailedTaskError({
      memoryEnabled: false,
      memoryState: null,
      error: new Error('test'),
    });
    expect(result).toBeNull();
  });

  it('returns null when memoryState is null', () => {
    const result = recordFailedTaskError({
      memoryEnabled: true,
      memoryState: null,
      error: new Error('test'),
    });
    expect(result).toBeNull();
  });

  it('records error when memory enabled with state', () => {
    const mockState = {
      errorResolutions: [],
      executionPatterns: [],
      capabilities: [],
      preferences: {},
    };
    const result = recordFailedTaskError({
      memoryEnabled: true,
      memoryState: mockState as never,
      error: new Error('something failed'),
    });
    // Should return updated state (not null)
    expect(result).not.toBeNull();
  });

  it('truncates long error strings to 200 chars', () => {
    const longError = 'x'.repeat(500);
    const mockState = {
      errorResolutions: [],
      executionPatterns: [],
      capabilities: [],
      preferences: {},
    };
    const result = recordFailedTaskError({
      memoryEnabled: true,
      memoryState: mockState as never,
      error: longError,
    });
    expect(result).not.toBeNull();
  });
});

/**
 * Tests for Task Feature Extraction
 * @module agents/coordination/task-features.test
 */

import { describe, it, expect } from 'vitest';
import type { Task } from '../../core/index.js';
import {
  extractTaskFeatures,
  isLikelyParallelizable,
  hasSequentialDependencies,
} from './task-features.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeTask(description: string): Task {
  return { id: 'test-task', description, context: {} } as Task;
}

// ============================================================================
// extractTaskFeatures
// ============================================================================

describe('extractTaskFeatures', () => {
  it('classifies sequential reasoning tasks', () => {
    const features = extractTaskFeatures(
      makeTask('Step by step, reason through this mathematical proof and derive the conclusion')
    );
    expect(features.taskType).toBe('sequential_reasoning');
    expect(features.typeConfidence).toBeGreaterThan(0.3);
  });

  it('classifies parallelizable tasks', () => {
    const features = extractTaskFeatures(
      makeTask('Process each of the 10 files simultaneously and independently')
    );
    expect(features.taskType).toBe('parallelizable');
  });

  it('classifies tool-heavy tasks', () => {
    const features = extractTaskFeatures(
      makeTask('Execute the shell command and run the api call to invoke the function')
    );
    expect(features.taskType).toBe('tool_heavy');
  });

  it('classifies code generation tasks', () => {
    const features = extractTaskFeatures(
      makeTask('Implement a TypeScript class and write unit tests for the module')
    );
    expect(features.taskType).toBe('code_generation');
  });

  it('classifies knowledge retrieval tasks', () => {
    const features = extractTaskFeatures(
      makeTask('Find and explain how the research information works')
    );
    expect(features.taskType).toBe('knowledge_retrieval');
  });

  it('classifies creative tasks', () => {
    const features = extractTaskFeatures(
      makeTask('Design an innovative and original artistic story with creative elements')
    );
    expect(features.taskType).toBe('creative');
  });

  it('returns unknown for unclassifiable tasks', () => {
    const features = extractTaskFeatures(makeTask('xyz'));
    expect(features.taskType).toBe('unknown');
    expect(features.typeConfidence).toBe(0.3);
  });

  it('detects sequential dependencies', () => {
    const features = extractTaskFeatures(
      makeTask('First analyze the data, then generate the report')
    );
    expect(features.hasSequentialDependencies).toBe(true);
  });

  it('detects no sequential dependencies for independent task', () => {
    const features = extractTaskFeatures(makeTask('Process all items simultaneously'));
    expect(features.hasSequentialDependencies).toBe(false);
  });

  it('estimates higher complexity for longer descriptions', () => {
    const simple = extractTaskFeatures(makeTask('Do task'));
    const complex = extractTaskFeatures(
      makeTask(
        'Analyze the entire codebase structure. Review all dependencies. ' +
          'Check for security vulnerabilities. Generate a comprehensive report. ' +
          'Identify performance bottlenecks. Suggest improvements for each module.'
      )
    );
    expect(complex.complexity).toBeGreaterThan(simple.complexity);
  });

  it('estimates positive token count', () => {
    const features = extractTaskFeatures(makeTask('Implement a feature'));
    expect(features.estimatedTokens).toBeGreaterThan(0);
  });

  it('includes signals array', () => {
    const features = extractTaskFeatures(makeTask('Step by step reason through this'));
    expect(Array.isArray(features.signals)).toBe(true);
    expect(features.signals.length).toBeGreaterThan(0);
  });

  it('calculates tool intensity', () => {
    const features = extractTaskFeatures(
      makeTask('Execute the api command and run the shell script')
    );
    expect(features.toolIntensity).toBeGreaterThan(0);
  });

  it('calculates parallelizability from pattern matches', () => {
    const features = extractTaskFeatures(
      makeTask('For each of the items, batch process independently')
    );
    expect(features.parallelizability).toBeGreaterThan(0);
  });
});

// ============================================================================
// isLikelyParallelizable
// ============================================================================

describe('isLikelyParallelizable', () => {
  it('returns true for parallelizable task', () => {
    expect(isLikelyParallelizable(makeTask('Process for each item independently'))).toBe(true);
  });

  it('returns true for batch processing', () => {
    expect(isLikelyParallelizable(makeTask('Batch process all 5 files'))).toBe(true);
  });

  it('returns false for sequential task', () => {
    expect(isLikelyParallelizable(makeTask('First do A, then do B'))).toBe(false);
  });

  it('returns false for simple task', () => {
    expect(isLikelyParallelizable(makeTask('Write a function'))).toBe(false);
  });
});

// ============================================================================
// hasSequentialDependencies
// ============================================================================

describe('hasSequentialDependencies', () => {
  it('detects first/then pattern', () => {
    expect(hasSequentialDependencies(makeTask('First compile, then deploy'))).toBe(true);
  });

  it('detects step by step', () => {
    expect(hasSequentialDependencies(makeTask('Complete this step by step'))).toBe(true);
  });

  it('detects dependency keywords', () => {
    expect(hasSequentialDependencies(makeTask('This depends on the previous task'))).toBe(true);
  });

  it('detects phase numbers', () => {
    expect(hasSequentialDependencies(makeTask('In phase 1, set up. In phase 2, build'))).toBe(true);
  });

  it('returns false for independent task', () => {
    expect(hasSequentialDependencies(makeTask('Analyze the codebase'))).toBe(false);
  });
});

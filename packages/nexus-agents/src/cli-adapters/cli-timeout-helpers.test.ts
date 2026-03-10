/**
 * Tests for CLI Timeout Helpers.
 *
 * @module cli-adapters/cli-timeout-helpers.test
 */

import { describe, it, expect } from 'vitest';
import { estimateTaskComplexity } from './cli-timeout-helpers.js';

describe('estimateTaskComplexity', () => {
  describe('complex tasks', () => {
    it('returns complex for codebase-wide tasks', () => {
      expect(estimateTaskComplexity('Analyze the entire codebase for issues')).toBe('complex');
    });

    it('returns complex for architecture tasks', () => {
      expect(estimateTaskComplexity('Review the architecture of the system')).toBe('complex');
    });

    it('returns complex for refactoring tasks', () => {
      expect(estimateTaskComplexity('Refactor the authentication module')).toBe('complex');
    });

    it('returns complex for comprehensive analysis', () => {
      expect(estimateTaskComplexity('Do a comprehensive security audit')).toBe('complex');
    });

    it('returns complex for deep analysis', () => {
      expect(estimateTaskComplexity('Perform deep analysis of performance')).toBe('complex');
    });

    it('returns complex for system-wide tasks', () => {
      expect(estimateTaskComplexity('System-wide error handling review')).toBe('complex');
    });

    it('returns complex for all-files tasks', () => {
      expect(estimateTaskComplexity('Update all files with new header')).toBe('complex');
    });

    it('is case-insensitive', () => {
      expect(estimateTaskComplexity('ARCHITECTURE review')).toBe('complex');
      expect(estimateTaskComplexity('REFACTOR the module')).toBe('complex');
    });

    it('returns complex for security tasks (#1401)', () => {
      expect(estimateTaskComplexity('Run a security scan on the module')).toBe('complex');
    });

    it('returns complex for audit tasks (#1401)', () => {
      expect(estimateTaskComplexity('Audit the authentication flow')).toBe('complex');
    });

    it('returns complex for vulnerability tasks (#1401)', () => {
      expect(estimateTaskComplexity('Check for vulnerability in dependencies')).toBe('complex');
    });
  });

  describe('simple tasks', () => {
    it('returns simple for single-item tasks', () => {
      expect(estimateTaskComplexity('Fix a single typo in the readme')).toBe('simple');
    });

    it('returns simple for quick tasks', () => {
      expect(estimateTaskComplexity('Quick check on the build output')).toBe('simple');
    });

    it('returns simple for one-function tasks', () => {
      expect(estimateTaskComplexity('Update one function signature')).toBe('simple');
    });

    it('returns simple for explicitly simple tasks', () => {
      expect(estimateTaskComplexity('A simple rename of a variable')).toBe('simple');
    });

    it('returns simple for small tasks', () => {
      expect(estimateTaskComplexity('Make a small adjustment to config')).toBe('simple');
    });

    it('returns simple for brief tasks', () => {
      expect(estimateTaskComplexity('Brief review of the PR description')).toBe('simple');
    });

    it('returns simple for short tasks', () => {
      expect(estimateTaskComplexity('Short summary of changes')).toBe('simple');
    });
  });

  describe('standard tasks (default)', () => {
    it('returns standard for generic tasks', () => {
      expect(estimateTaskComplexity('Implement the new feature')).toBe('standard');
    });

    it('returns standard for empty description', () => {
      expect(estimateTaskComplexity('')).toBe('standard');
    });

    it('returns standard for moderate tasks', () => {
      expect(estimateTaskComplexity('Add tests for the router module')).toBe('standard');
    });

    it('returns standard for tasks with no keyword matches', () => {
      expect(estimateTaskComplexity('Debug the flaky test')).toBe('standard');
    });
  });

  describe('priority rules', () => {
    it('complex indicators take priority over simple', () => {
      // "simple" is present but "codebase" makes it complex
      expect(estimateTaskComplexity('Simple codebase scan')).toBe('complex');
    });

    it('complex indicators win when both present', () => {
      expect(estimateTaskComplexity('Quick architecture review')).toBe('complex');
    });
  });
});

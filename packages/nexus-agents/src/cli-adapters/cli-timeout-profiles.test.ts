/**
 * nexus-agents/cli-adapters - CLI Timeout Profiles Tests
 *
 * Unit tests for the configurable timeout profiles per CLI tool.
 *
 * (Source: Issue #357 - CLI delegation testing 2026-01-18)
 */

import { describe, it, expect } from 'vitest';
import {
  CLI_TIMEOUT_PROFILES,
  DEFAULT_TIMEOUT_PROFILE,
  getTimeoutForTask,
  estimateTaskComplexity,
  getTimeoutForTaskAuto,
  type TaskComplexity,
} from './cli-timeout-profiles.js';

// ============================================================================
// getTimeoutForTask Tests
// ============================================================================

describe('getTimeoutForTask', () => {
  describe('returns correct timeout for each CLI and complexity', () => {
    it('should return correct timeouts for claude', () => {
      expect(getTimeoutForTask('claude', 'simple')).toBe(30_000);
      expect(getTimeoutForTask('claude', 'standard')).toBe(60_000);
      expect(getTimeoutForTask('claude', 'complex')).toBe(120_000);
    });

    it('should return correct timeouts for gemini', () => {
      // Updated per Issue #366 (30s/60s/180s)
      expect(getTimeoutForTask('gemini', 'simple')).toBe(30_000);
      expect(getTimeoutForTask('gemini', 'standard')).toBe(60_000);
      expect(getTimeoutForTask('gemini', 'complex')).toBe(180_000);
    });

    it('should return correct timeouts for codex', () => {
      expect(getTimeoutForTask('codex', 'simple')).toBe(10_000);
      expect(getTimeoutForTask('codex', 'standard')).toBe(30_000);
      expect(getTimeoutForTask('codex', 'complex')).toBe(60_000);
    });
  });

  describe('uses default profile for unknown CLI', () => {
    it('should return default timeout for unknown CLI with simple complexity', () => {
      expect(getTimeoutForTask('unknown-cli', 'simple')).toBe(DEFAULT_TIMEOUT_PROFILE.simple);
      expect(getTimeoutForTask('unknown-cli', 'simple')).toBe(30_000);
    });

    it('should return default timeout for unknown CLI with standard complexity', () => {
      expect(getTimeoutForTask('unknown-cli', 'standard')).toBe(DEFAULT_TIMEOUT_PROFILE.standard);
      expect(getTimeoutForTask('unknown-cli', 'standard')).toBe(60_000);
    });

    it('should return default timeout for unknown CLI with complex complexity', () => {
      expect(getTimeoutForTask('unknown-cli', 'complex')).toBe(DEFAULT_TIMEOUT_PROFILE.complex);
      expect(getTimeoutForTask('unknown-cli', 'complex')).toBe(120_000);
    });

    it('should handle empty string as unknown CLI', () => {
      expect(getTimeoutForTask('', 'standard')).toBe(DEFAULT_TIMEOUT_PROFILE.standard);
    });

    it('should handle various unknown CLI names', () => {
      const unknownClis = ['gpt', 'llama', 'mistral', 'custom-ai'];
      for (const cli of unknownClis) {
        expect(getTimeoutForTask(cli, 'simple')).toBe(DEFAULT_TIMEOUT_PROFILE.simple);
        expect(getTimeoutForTask(cli, 'standard')).toBe(DEFAULT_TIMEOUT_PROFILE.standard);
        expect(getTimeoutForTask(cli, 'complex')).toBe(DEFAULT_TIMEOUT_PROFILE.complex);
      }
    });
  });
});

// ============================================================================
// estimateTaskComplexity Tests
// ============================================================================

describe('estimateTaskComplexity', () => {
  describe('correctly identifies simple tasks', () => {
    it('should identify tasks with "single" as simple', () => {
      expect(estimateTaskComplexity('Fix a single function bug')).toBe('simple');
    });

    it('should identify tasks with "quick" as simple', () => {
      expect(estimateTaskComplexity('Quick fix for typo')).toBe('simple');
    });

    it('should identify tasks with "one function" as simple', () => {
      expect(estimateTaskComplexity('Update one function signature')).toBe('simple');
    });

    it('should identify tasks with "simple" as simple', () => {
      expect(estimateTaskComplexity('Simple change to config')).toBe('simple');
    });

    it('should identify tasks with "small" as simple', () => {
      expect(estimateTaskComplexity('Make a small update')).toBe('simple');
    });

    it('should identify tasks with "brief" as simple', () => {
      expect(estimateTaskComplexity('Brief code review')).toBe('simple');
    });

    it('should identify tasks with "short" as simple', () => {
      expect(estimateTaskComplexity('Short description update')).toBe('simple');
    });

    it('should be case insensitive for simple indicators', () => {
      expect(estimateTaskComplexity('QUICK fix')).toBe('simple');
      expect(estimateTaskComplexity('SIMPLE update')).toBe('simple');
      expect(estimateTaskComplexity('Small Change')).toBe('simple');
    });
  });

  describe('correctly identifies complex tasks', () => {
    it('should identify tasks with "codebase" as complex', () => {
      expect(estimateTaskComplexity('Analyze the entire codebase')).toBe('complex');
    });

    it('should identify tasks with "architecture" as complex', () => {
      expect(estimateTaskComplexity('Design system architecture')).toBe('complex');
    });

    it('should identify tasks with "refactor" as complex', () => {
      expect(estimateTaskComplexity('Refactor the authentication module')).toBe('complex');
    });

    it('should identify tasks with "all files" as complex', () => {
      expect(estimateTaskComplexity('Update all files to new standard')).toBe('complex');
    });

    it('should identify tasks with "entire" as complex', () => {
      expect(estimateTaskComplexity('Review the entire module')).toBe('complex');
    });

    it('should identify tasks with "comprehensive" as complex', () => {
      expect(estimateTaskComplexity('Comprehensive security audit')).toBe('complex');
    });

    it('should identify tasks with "deep analysis" as complex', () => {
      expect(estimateTaskComplexity('Perform deep analysis of performance')).toBe('complex');
    });

    it('should identify tasks with "system-wide" as complex', () => {
      expect(estimateTaskComplexity('System-wide migration to new API')).toBe('complex');
    });

    it('should be case insensitive for complex indicators', () => {
      expect(estimateTaskComplexity('REFACTOR the code')).toBe('complex');
      expect(estimateTaskComplexity('ARCHITECTURE design')).toBe('complex');
      expect(estimateTaskComplexity('Comprehensive Review')).toBe('complex');
    });
  });

  describe('defaults to standard complexity', () => {
    it('should default to standard for generic task descriptions', () => {
      expect(estimateTaskComplexity('Implement new feature')).toBe('standard');
    });

    it('should default to standard for empty string', () => {
      expect(estimateTaskComplexity('')).toBe('standard');
    });

    it('should default to standard when no indicators match', () => {
      expect(estimateTaskComplexity('Add logging to the service')).toBe('standard');
      expect(estimateTaskComplexity('Update the user interface')).toBe('standard');
      expect(estimateTaskComplexity('Create API endpoint')).toBe('standard');
    });

    it('should default to standard for ambiguous descriptions', () => {
      expect(estimateTaskComplexity('Fix the bug in authentication')).toBe('standard');
      expect(estimateTaskComplexity('Write tests for the module')).toBe('standard');
      expect(estimateTaskComplexity('Optimize database queries')).toBe('standard');
    });
  });

  describe('priority handling', () => {
    it('should prioritize complex over simple when both present', () => {
      // Complex indicators are checked first in the implementation
      expect(estimateTaskComplexity('Quick refactor of the codebase')).toBe('complex');
      expect(estimateTaskComplexity('Simple architecture redesign')).toBe('complex');
    });
  });
});

// ============================================================================
// getTimeoutForTaskAuto Tests
// ============================================================================

describe('getTimeoutForTaskAuto', () => {
  describe('combines estimation and lookup correctly', () => {
    it('should return simple timeout for simple task description', () => {
      const timeout = getTimeoutForTaskAuto('claude', 'Quick fix for typo');
      // Using getTimeoutForTask to get expected value for type safety
      const expected = getTimeoutForTask('claude', 'simple');
      expect(timeout).toBe(expected);
      expect(timeout).toBe(30_000);
    });

    it('should return complex timeout for complex task description', () => {
      const timeout = getTimeoutForTaskAuto('claude', 'Refactor the entire codebase');
      // Using getTimeoutForTask to get expected value for type safety
      const expected = getTimeoutForTask('claude', 'complex');
      expect(timeout).toBe(expected);
      expect(timeout).toBe(120_000);
    });

    it('should return standard timeout for standard task description', () => {
      const timeout = getTimeoutForTaskAuto('claude', 'Implement user authentication');
      // Using getTimeoutForTask to get expected value for type safety
      const expected = getTimeoutForTask('claude', 'standard');
      expect(timeout).toBe(expected);
      expect(timeout).toBe(60_000);
    });
  });

  describe('works correctly for all known CLIs', () => {
    it('should work correctly for gemini', () => {
      // Gemini timeouts increased per Issue #366 (30s/60s/180s)
      expect(getTimeoutForTaskAuto('gemini', 'Quick check')).toBe(30_000);
      expect(getTimeoutForTaskAuto('gemini', 'Standard task')).toBe(60_000);
      expect(getTimeoutForTaskAuto('gemini', 'Comprehensive review')).toBe(180_000);
    });

    it('should work correctly for codex', () => {
      expect(getTimeoutForTaskAuto('codex', 'Simple function')).toBe(10_000);
      expect(getTimeoutForTaskAuto('codex', 'Normal implementation')).toBe(30_000);
      expect(getTimeoutForTaskAuto('codex', 'Architecture design')).toBe(60_000);
    });
  });

  describe('uses default profile for unknown CLI', () => {
    it('should use default profile for unknown CLI', () => {
      expect(getTimeoutForTaskAuto('unknown', 'Quick task')).toBe(30_000);
      expect(getTimeoutForTaskAuto('unknown', 'Normal task')).toBe(60_000);
      expect(getTimeoutForTaskAuto('unknown', 'Comprehensive analysis')).toBe(120_000);
    });
  });
});

// ============================================================================
// CLI_TIMEOUT_PROFILES Configuration Tests
// ============================================================================

describe('CLI_TIMEOUT_PROFILES', () => {
  it('should have profiles for all expected CLIs', () => {
    expect(CLI_TIMEOUT_PROFILES).toHaveProperty('claude');
    expect(CLI_TIMEOUT_PROFILES).toHaveProperty('gemini');
    expect(CLI_TIMEOUT_PROFILES).toHaveProperty('codex');
  });

  it('should have all complexity levels for each profile', () => {
    const complexityLevels: TaskComplexity[] = ['simple', 'standard', 'complex'];

    for (const cli of Object.keys(CLI_TIMEOUT_PROFILES)) {
      for (const level of complexityLevels) {
        const timeout = getTimeoutForTask(cli, level);
        expect(timeout).toBeDefined();
        expect(typeof timeout).toBe('number');
        expect(timeout).toBeGreaterThan(0);
      }
    }
  });

  it('should have increasing timeouts from simple to complex', () => {
    for (const cli of Object.keys(CLI_TIMEOUT_PROFILES)) {
      const simple = getTimeoutForTask(cli, 'simple');
      const standard = getTimeoutForTask(cli, 'standard');
      const complex = getTimeoutForTask(cli, 'complex');
      expect(simple).toBeLessThan(standard);
      expect(standard).toBeLessThan(complex);
    }
  });
});

describe('DEFAULT_TIMEOUT_PROFILE', () => {
  it('should have all complexity levels', () => {
    expect(DEFAULT_TIMEOUT_PROFILE).toHaveProperty('simple');
    expect(DEFAULT_TIMEOUT_PROFILE).toHaveProperty('standard');
    expect(DEFAULT_TIMEOUT_PROFILE).toHaveProperty('complex');
  });

  it('should have increasing timeouts from simple to complex', () => {
    expect(DEFAULT_TIMEOUT_PROFILE.simple).toBeLessThan(DEFAULT_TIMEOUT_PROFILE.standard);
    expect(DEFAULT_TIMEOUT_PROFILE.standard).toBeLessThan(DEFAULT_TIMEOUT_PROFILE.complex);
  });

  it('should have reasonable timeout values', () => {
    // Simple should be at least 10 seconds
    expect(DEFAULT_TIMEOUT_PROFILE.simple).toBeGreaterThanOrEqual(10_000);
    // Complex should be at most 5 minutes
    expect(DEFAULT_TIMEOUT_PROFILE.complex).toBeLessThanOrEqual(300_000);
  });
});

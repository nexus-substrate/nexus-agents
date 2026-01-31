/**
 * nexus-agents/testing/e2e - Validation Harness Tests
 *
 * Tests for the end-to-end validation harness.
 *
 * @module testing/e2e/validation-harness.test
 * (Source: Issue #571)
 */

import { describe, it, expect } from 'vitest';
import {
  ValidationHarness,
  createValidationHarness,
  runValidation,
  DEFAULT_HARNESS_CONFIG,
} from './validation-harness.js';

describe('ValidationHarness', () => {
  describe('constructor', () => {
    it('should create harness with default config', () => {
      const harness = new ValidationHarness();
      expect(harness).toBeInstanceOf(ValidationHarness);
    });

    it('should accept custom config', () => {
      const harness = new ValidationHarness({
        modes: ['mcp', 'cli'],
        verbose: true,
      });
      expect(harness).toBeInstanceOf(ValidationHarness);
    });
  });

  describe('validate', () => {
    it('should run all validation checks', async () => {
      const harness = new ValidationHarness();
      const result = await harness.validate();

      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('categories');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('allPassed');
    });

    it('should validate all modes by default', async () => {
      const harness = new ValidationHarness();
      const result = await harness.validate();

      const modes = result.categories.map((c) => c.mode);
      expect(modes).toContain('mcp');
      expect(modes).toContain('cli');
      expect(modes).toContain('hybrid');
      expect(modes).toContain('memory');
      expect(modes).toContain('consensus');
      expect(modes).toContain('observability');
    });

    it('should validate only specified modes', async () => {
      const harness = new ValidationHarness({ modes: ['mcp', 'cli'] });
      const result = await harness.validate();

      expect(result.categories).toHaveLength(2);
      const cat0 = result.categories[0];
      const cat1 = result.categories[1];
      expect(cat0).toBeDefined();
      expect(cat1).toBeDefined();
      if (cat0 !== undefined && cat1 !== undefined) {
        expect(cat0.mode).toBe('mcp');
        expect(cat1.mode).toBe('cli');
      }
    });

    it('should skip specified checks', async () => {
      const harness = new ValidationHarness({
        modes: ['mcp'],
        skipChecks: ['mcp-mandates-injection'],
      });
      const result = await harness.validate();

      const category = result.categories[0];
      expect(category).toBeDefined();
      if (category !== undefined) {
        const skippedCheck = category.checks.find((c) => c.id === 'mcp-mandates-injection');
        expect(skippedCheck).toBeDefined();
        if (skippedCheck?.details !== undefined) {
          expect(skippedCheck.details['skipped']).toBe(true);
        }
      }
    });

    it('should calculate summary statistics', async () => {
      const harness = new ValidationHarness();
      const result = await harness.validate();

      expect(result.summary.totalChecks).toBeGreaterThan(0);
      expect(result.summary.passed).toBeGreaterThanOrEqual(0);
      expect(result.summary.failed).toBeGreaterThanOrEqual(0);
      expect(result.summary.passRate).toBeGreaterThanOrEqual(0);
      expect(result.summary.passRate).toBeLessThanOrEqual(1);
    });

    it('should track duration', async () => {
      const harness = new ValidationHarness({ modes: ['mcp'] });
      const result = await harness.validate();

      expect(result.summary.totalDurationMs).toBeGreaterThanOrEqual(0);
      const category = result.categories[0];
      expect(category).toBeDefined();
      if (category !== undefined) {
        expect(category.totalDurationMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('MCP mode checks', () => {
    it('should validate mandates injection', async () => {
      const harness = new ValidationHarness({ modes: ['mcp'] });
      const result = await harness.validate();

      const category = result.categories[0];
      expect(category).toBeDefined();
      if (category !== undefined) {
        const check = category.checks.find((c) => c.id === 'mcp-mandates-injection');
        expect(check).toBeDefined();
        if (check !== undefined) {
          expect(check.name).toBe('Mandates injection works');
        }
      }
    });

    it('should validate tool index', async () => {
      const harness = new ValidationHarness({ modes: ['mcp'] });
      const result = await harness.validate();

      const category = result.categories[0];
      expect(category).toBeDefined();
      if (category !== undefined) {
        const check = category.checks.find((c) => c.id === 'mcp-tool-index');
        expect(check).toBeDefined();
        if (check?.details !== undefined) {
          expect(check.details['toolCount']).toBe(8);
        }
      }
    });

    it('should validate all MCP tools execute', async () => {
      const harness = new ValidationHarness({ modes: ['mcp'] });
      const result = await harness.validate();

      const category = result.categories[0];
      expect(category).toBeDefined();
      if (category !== undefined) {
        const check = category.checks.find((c) => c.id === 'mcp-tools-execute');
        expect(check).toBeDefined();
      }
    });

    it('should validate policy firewall', async () => {
      const harness = new ValidationHarness({ modes: ['mcp'] });
      const result = await harness.validate();

      const category = result.categories[0];
      expect(category).toBeDefined();
      if (category !== undefined) {
        const check = category.checks.find((c) => c.id === 'mcp-policy-firewall');
        expect(check).toBeDefined();
      }
    });
  });

  describe('CLI mode checks', () => {
    it('should validate CLI commands execute', async () => {
      const harness = new ValidationHarness({ modes: ['cli'] });
      const result = await harness.validate();

      const category = result.categories[0];
      expect(category).toBeDefined();
      if (category !== undefined) {
        const check = category.checks.find((c) => c.id === 'cli-commands-execute');
        expect(check).toBeDefined();
        if (check?.details !== undefined) {
          expect(check.details['commandCount']).toBeGreaterThan(0);
        }
      }
    });

    it('should validate MCP parity', async () => {
      const harness = new ValidationHarness({ modes: ['cli'] });
      const result = await harness.validate();

      const category = result.categories[0];
      expect(category).toBeDefined();
      if (category !== undefined) {
        const check = category.checks.find((c) => c.id === 'cli-mcp-parity');
        expect(check).toBeDefined();
      }
    });

    it('should validate error handling', async () => {
      const harness = new ValidationHarness({ modes: ['cli'] });
      const result = await harness.validate();

      const category = result.categories[0];
      expect(category).toBeDefined();
      if (category !== undefined) {
        const check = category.checks.find((c) => c.id === 'cli-error-handling');
        expect(check).toBeDefined();
      }
    });
  });

  describe('Hybrid mode checks', () => {
    it('should validate CLI to MCP', async () => {
      const harness = new ValidationHarness({ modes: ['hybrid'] });
      const result = await harness.validate();

      const category = result.categories[0];
      expect(category).toBeDefined();
      if (category !== undefined) {
        const check = category.checks.find((c) => c.id === 'hybrid-cli-to-mcp');
        expect(check).toBeDefined();
      }
    });

    it('should validate MCP to CLI', async () => {
      const harness = new ValidationHarness({ modes: ['hybrid'] });
      const result = await harness.validate();

      const category = result.categories[0];
      expect(category).toBeDefined();
      if (category !== undefined) {
        const check = category.checks.find((c) => c.id === 'hybrid-mcp-to-cli');
        expect(check).toBeDefined();
      }
    });

    it('should validate state consistency', async () => {
      const harness = new ValidationHarness({ modes: ['hybrid'] });
      const result = await harness.validate();

      const category = result.categories[0];
      expect(category).toBeDefined();
      if (category !== undefined) {
        const check = category.checks.find((c) => c.id === 'hybrid-state-consistency');
        expect(check).toBeDefined();
      }
    });
  });

  describe('Memory checks', () => {
    it('should validate persist/retrieve', async () => {
      const harness = new ValidationHarness({ modes: ['memory'] });
      const result = await harness.validate();

      const category = result.categories[0];
      expect(category).toBeDefined();
      if (category !== undefined) {
        const check = category.checks.find((c) => c.id === 'memory-persist-retrieve');
        expect(check).toBeDefined();
      }
    });

    it('should validate scope rules', async () => {
      const harness = new ValidationHarness({ modes: ['memory'] });
      const result = await harness.validate();

      const category = result.categories[0];
      expect(category).toBeDefined();
      if (category !== undefined) {
        const check = category.checks.find((c) => c.id === 'memory-scope-rules');
        expect(check).toBeDefined();
      }
    });

    it('should validate context pruning', async () => {
      const harness = new ValidationHarness({ modes: ['memory'] });
      const result = await harness.validate();

      const category = result.categories[0];
      expect(category).toBeDefined();
      if (category !== undefined) {
        const check = category.checks.find((c) => c.id === 'memory-context-pruning');
        expect(check).toBeDefined();
      }
    });
  });

  describe('Consensus checks', () => {
    it('should validate quorum voting', async () => {
      const harness = new ValidationHarness({ modes: ['consensus'] });
      const result = await harness.validate();

      const category = result.categories[0];
      expect(category).toBeDefined();
      if (category !== undefined) {
        const check = category.checks.find((c) => c.id === 'consensus-quorum');
        expect(check).toBeDefined();
      }
    });

    it('should validate dissent capture', async () => {
      const harness = new ValidationHarness({ modes: ['consensus'] });
      const result = await harness.validate();

      const category = result.categories[0];
      expect(category).toBeDefined();
      if (category !== undefined) {
        const check = category.checks.find((c) => c.id === 'consensus-dissent');
        expect(check).toBeDefined();
      }
    });

    it('should validate retry logic', async () => {
      const harness = new ValidationHarness({ modes: ['consensus'] });
      const result = await harness.validate();

      const category = result.categories[0];
      expect(category).toBeDefined();
      if (category !== undefined) {
        const check = category.checks.find((c) => c.id === 'consensus-retry');
        expect(check).toBeDefined();
      }
    });
  });

  describe('Observability checks', () => {
    it('should validate logs', async () => {
      const harness = new ValidationHarness({ modes: ['observability'] });
      const result = await harness.validate();

      const category = result.categories[0];
      expect(category).toBeDefined();
      if (category !== undefined) {
        const check = category.checks.find((c) => c.id === 'observability-logs');
        expect(check).toBeDefined();
      }
    });

    it('should validate traces', async () => {
      const harness = new ValidationHarness({ modes: ['observability'] });
      const result = await harness.validate();

      const category = result.categories[0];
      expect(category).toBeDefined();
      if (category !== undefined) {
        const check = category.checks.find((c) => c.id === 'observability-traces');
        expect(check).toBeDefined();
      }
    });

    it('should validate metrics', async () => {
      const harness = new ValidationHarness({ modes: ['observability'] });
      const result = await harness.validate();

      const category = result.categories[0];
      expect(category).toBeDefined();
      if (category !== undefined) {
        const check = category.checks.find((c) => c.id === 'observability-metrics');
        expect(check).toBeDefined();
      }
    });

    it('should validate required fields', async () => {
      const harness = new ValidationHarness({ modes: ['observability'] });
      const result = await harness.validate();

      const category = result.categories[0];
      expect(category).toBeDefined();
      if (category !== undefined) {
        const check = category.checks.find((c) => c.id === 'observability-required-fields');
        expect(check).toBeDefined();
      }
    });
  });
});

describe('createValidationHarness', () => {
  it('should create harness instance', () => {
    const harness = createValidationHarness();
    expect(harness).toBeInstanceOf(ValidationHarness);
  });

  it('should accept config', () => {
    const harness = createValidationHarness({ verbose: true });
    expect(harness).toBeInstanceOf(ValidationHarness);
  });
});

describe('runValidation', () => {
  it('should run validation and return result', async () => {
    const result = await runValidation({ modes: ['mcp'] });

    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('categories');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('allPassed');
  });
});

describe('DEFAULT_HARNESS_CONFIG', () => {
  it('should have all modes', () => {
    expect(DEFAULT_HARNESS_CONFIG.modes).toContain('mcp');
    expect(DEFAULT_HARNESS_CONFIG.modes).toContain('cli');
    expect(DEFAULT_HARNESS_CONFIG.modes).toContain('hybrid');
    expect(DEFAULT_HARNESS_CONFIG.modes).toContain('memory');
    expect(DEFAULT_HARNESS_CONFIG.modes).toContain('consensus');
    expect(DEFAULT_HARNESS_CONFIG.modes).toContain('observability');
  });

  it('should have reasonable defaults', () => {
    expect(DEFAULT_HARNESS_CONFIG.checkTimeoutMs).toBe(30000);
    expect(DEFAULT_HARNESS_CONFIG.verbose).toBe(false);
    expect(DEFAULT_HARNESS_CONFIG.skipChecks).toHaveLength(0);
  });
});

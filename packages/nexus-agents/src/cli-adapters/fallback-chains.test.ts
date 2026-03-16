/**
 * Tests for fallback-chains.ts
 *
 * @module cli-adapters/fallback-chains.test
 * (Source: Issue #362 - Task-type-aware fallback chains)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CLI_NAMES } from '../config/model-capabilities-types.js';
import {
  getFallbackChain,
  getFallbackChainForCategory,
  CATEGORY_CHAIN_OVERRIDES,
  filterAvailableClis,
  getNextCli,
  isChainExhausted,
  FallbackChainManager,
  createFallbackChainManager,
  createFallbackChainRegistry,
  DEFAULT_FALLBACK_CHAINS,
  FallbackChainSchema,
  FallbackChainRegistrySchema,
  type FallbackChain,
  type FallbackOutcome,
} from './fallback-chains.js';
import type { CliName } from './types-core.js';
import type { FallbackTaskType } from './task-classifier.js';

describe('fallback-chains', () => {
  describe('DEFAULT_FALLBACK_CHAINS', () => {
    it('should have chains for all task types', () => {
      expect(DEFAULT_FALLBACK_CHAINS.code).toBeDefined();
      expect(DEFAULT_FALLBACK_CHAINS.research).toBeDefined();
      expect(DEFAULT_FALLBACK_CHAINS.documentation).toBeDefined();
      expect(DEFAULT_FALLBACK_CHAINS.analysis).toBeDefined();
      expect(DEFAULT_FALLBACK_CHAINS.general).toBeDefined();
    });

    it('should have codex first for code tasks (#1486)', () => {
      expect(DEFAULT_FALLBACK_CHAINS.code[0]).toBe('codex');
    });

    it('should have claude second for code tasks (#1486)', () => {
      expect(DEFAULT_FALLBACK_CHAINS.code[1]).toBe('claude');
    });

    it('should have gemini first for research tasks (#1486)', () => {
      expect(DEFAULT_FALLBACK_CHAINS.research[0]).toBe('gemini');
    });

    it('should have claude second for research tasks (#1486)', () => {
      expect(DEFAULT_FALLBACK_CHAINS.research[1]).toBe('claude');
    });

    it('should include all three CLIs in each chain', () => {
      const types: FallbackTaskType[] = [
        'code',
        'research',
        'documentation',
        'analysis',
        'general',
      ];
      for (const type of types) {
        const chain = DEFAULT_FALLBACK_CHAINS[type];
        for (const cli of CLI_NAMES) {
          expect(chain).toContain(cli);
        }
        expect(chain).toHaveLength(CLI_NAMES.length);
      }
    });
  });

  describe('getFallbackChain', () => {
    it('should return the chain for a given task type', () => {
      const chain = getFallbackChain('code');
      expect(chain).toEqual(DEFAULT_FALLBACK_CHAINS.code);
    });

    it('should return default general chain for general type', () => {
      const chain = getFallbackChain('general');
      expect(chain).toEqual(DEFAULT_FALLBACK_CHAINS.general);
    });

    it('should accept custom registry', () => {
      const customRegistry = {
        ...DEFAULT_FALLBACK_CHAINS,
        code: ['gemini', 'claude', 'codex'] as const,
      };
      const chain = getFallbackChain('code', customRegistry);
      expect(chain[0]).toBe('gemini');
    });
  });

  describe('getFallbackChainForCategory', () => {
    it('returns category-specific override when available', () => {
      const chain = getFallbackChainForCategory('architecture', 'analysis');
      expect(chain[0]).toBe('gemini');
      expect(chain).toEqual(CATEGORY_CHAIN_OVERRIDES['architecture']);
    });

    it('returns security_review override with codex first', () => {
      const chain = getFallbackChainForCategory('security_review', 'analysis');
      expect(chain[0]).toBe('codex');
      expect(chain).toEqual(CATEGORY_CHAIN_OVERRIDES['security_review']);
    });

    it('returns exploration override with gemini first (#1526)', () => {
      const chain = getFallbackChainForCategory('exploration', 'research');
      expect(chain[0]).toBe('gemini');
      expect(chain[1]).toBe('codex');
      expect(chain).toEqual(CATEGORY_CHAIN_OVERRIDES['exploration']);
    });

    it('returns devops override with claude first (#1526)', () => {
      const chain = getFallbackChainForCategory('devops', 'analysis');
      expect(chain[0]).toBe('claude');
      expect(chain[1]).toBe('gemini');
      expect(chain).toEqual(CATEGORY_CHAIN_OVERRIDES['devops']);
    });

    it('returns code_review override with claude first (#1401)', () => {
      const chain = getFallbackChainForCategory('code_review', 'code');
      expect(chain[0]).toBe('claude');
      expect(chain[1]).toBe('codex');
      expect(chain).toEqual(CATEGORY_CHAIN_OVERRIDES['code_review']);
    });

    it('returns research override with gemini first (#1401)', () => {
      const chain = getFallbackChainForCategory('research', 'research');
      expect(chain[0]).toBe('gemini');
      expect(chain[1]).toBe('claude');
      expect(chain).toEqual(CATEGORY_CHAIN_OVERRIDES['research']);
    });

    it('returns documentation override with gemini first (#1401)', () => {
      const chain = getFallbackChainForCategory('documentation', 'analysis');
      expect(chain[0]).toBe('gemini');
      expect(chain[1]).toBe('claude');
      expect(chain).toEqual(CATEGORY_CHAIN_OVERRIDES['documentation']);
    });

    it('falls back to bucket-level chain when no override', () => {
      const chain = getFallbackChainForCategory('planning', 'analysis');
      expect(chain).toEqual(DEFAULT_FALLBACK_CHAINS.analysis);
    });

    it('falls back to bucket-level for non-overridden categories', () => {
      const chain = getFallbackChainForCategory('code_generation', 'code');
      expect(chain).toEqual(DEFAULT_FALLBACK_CHAINS.code);
    });
  });

  describe('filterAvailableClis', () => {
    it('should filter to only available CLIs', () => {
      const chain: FallbackChain = ['claude', 'codex', 'gemini'];
      const available = new Set<CliName>(['claude', 'gemini']);
      const filtered = filterAvailableClis(chain, available);
      expect(filtered).toEqual(['claude', 'gemini']);
    });

    it('should preserve order of original chain', () => {
      const chain: FallbackChain = ['codex', 'claude', 'gemini'];
      const available = new Set<CliName>(['gemini', 'codex']);
      const filtered = filterAvailableClis(chain, available);
      expect(filtered).toEqual(['codex', 'gemini']);
    });

    it('should return empty array if no CLIs available', () => {
      const chain: FallbackChain = ['claude', 'codex', 'gemini'];
      const available = new Set<CliName>();
      const filtered = filterAvailableClis(chain, available);
      expect(filtered).toEqual([]);
    });

    it('should return all if all available', () => {
      const chain: FallbackChain = ['claude', 'codex', 'gemini'];
      const available = new Set<CliName>(['claude', 'codex', 'gemini']);
      const filtered = filterAvailableClis(chain, available);
      expect(filtered).toEqual(['claude', 'codex', 'gemini']);
    });
  });

  describe('getNextCli', () => {
    it('should return next CLI in chain', () => {
      const chain: FallbackChain = ['claude', 'codex', 'gemini'];
      expect(getNextCli(chain, 0)).toBe('codex');
      expect(getNextCli(chain, 1)).toBe('gemini');
    });

    it('should return undefined when chain is exhausted', () => {
      const chain: FallbackChain = ['claude', 'codex', 'gemini'];
      expect(getNextCli(chain, 2)).toBeUndefined();
    });

    it('should return undefined for out of bounds position', () => {
      const chain: FallbackChain = ['claude', 'codex', 'gemini'];
      expect(getNextCli(chain, 10)).toBeUndefined();
    });
  });

  describe('isChainExhausted', () => {
    it('should return false when not at end', () => {
      const chain: FallbackChain = ['claude', 'codex', 'gemini'];
      expect(isChainExhausted(chain, 0)).toBe(false);
      expect(isChainExhausted(chain, 1)).toBe(false);
    });

    it('should return true when at last position', () => {
      const chain: FallbackChain = ['claude', 'codex', 'gemini'];
      expect(isChainExhausted(chain, 2)).toBe(true);
    });

    it('should return true when past end', () => {
      const chain: FallbackChain = ['claude', 'codex', 'gemini'];
      expect(isChainExhausted(chain, 10)).toBe(true);
    });
  });

  describe('FallbackChainManager', () => {
    let manager: FallbackChainManager;

    beforeEach(() => {
      manager = new FallbackChainManager();
    });

    describe('getChain', () => {
      it('should return chain for task type', () => {
        const chain = manager.getChain('code');
        expect(chain).toEqual(DEFAULT_FALLBACK_CHAINS.code);
      });
    });

    describe('getAvailableChain', () => {
      it('should filter by available CLIs', () => {
        const available = new Set<CliName>(['claude', 'gemini']);
        const chain = manager.getAvailableChain('code', available);
        expect(chain).not.toContain('codex');
        expect(chain).toContain('claude');
        expect(chain).toContain('gemini');
      });
    });

    describe('recordOutcome', () => {
      it('should track successful outcomes at position 0', () => {
        const outcome: FallbackOutcome = {
          taskType: 'code',
          successPosition: 0,
          successfulCli: 'claude',
          exhausted: false,
        };
        manager.recordOutcome(outcome);

        const metrics = manager.getMetrics('code');
        expect(metrics.totalAttempts).toBe(1);
        expect(metrics.successByPosition[0]).toBe(1);
        expect(metrics.exhaustedCount).toBe(0);
      });

      it('should track successful outcomes at position 1', () => {
        const outcome: FallbackOutcome = {
          taskType: 'research',
          successPosition: 1,
          successfulCli: 'gemini',
          exhausted: false,
        };
        manager.recordOutcome(outcome);

        const metrics = manager.getMetrics('research');
        expect(metrics.totalAttempts).toBe(1);
        expect(metrics.successByPosition[1]).toBe(1);
      });

      it('should track exhausted chains', () => {
        const outcome: FallbackOutcome = {
          taskType: 'analysis',
          successPosition: -1,
          exhausted: true,
        };
        manager.recordOutcome(outcome);

        const metrics = manager.getMetrics('analysis');
        expect(metrics.totalAttempts).toBe(1);
        expect(metrics.exhaustedCount).toBe(1);
      });

      it('should accumulate multiple outcomes', () => {
        manager.recordOutcome({
          taskType: 'code',
          successPosition: 0,
          successfulCli: 'claude',
          exhausted: false,
        });
        manager.recordOutcome({
          taskType: 'code',
          successPosition: 0,
          successfulCli: 'claude',
          exhausted: false,
        });
        manager.recordOutcome({
          taskType: 'code',
          successPosition: 1,
          successfulCli: 'codex',
          exhausted: false,
        });

        const metrics = manager.getMetrics('code');
        expect(metrics.totalAttempts).toBe(3);
        expect(metrics.successByPosition[0]).toBe(2);
        expect(metrics.successByPosition[1]).toBe(1);
      });

      it('should calculate average success position', () => {
        // Two successes at position 0, one at position 2
        manager.recordOutcome({
          taskType: 'code',
          successPosition: 0,
          successfulCli: 'claude',
          exhausted: false,
        });
        manager.recordOutcome({
          taskType: 'code',
          successPosition: 0,
          successfulCli: 'claude',
          exhausted: false,
        });
        manager.recordOutcome({
          taskType: 'code',
          successPosition: 2,
          successfulCli: 'gemini',
          exhausted: false,
        });

        const metrics = manager.getMetrics('code');
        // (0 + 0 + 2) / 3 = 0.666...
        expect(metrics.avgSuccessPosition).toBeCloseTo(0.666, 2);
      });
    });

    describe('getSuccessRatesByPosition', () => {
      it('should return empty array when no attempts', () => {
        const rates = manager.getSuccessRatesByPosition('code');
        expect(rates).toEqual([]);
      });

      it('should calculate rates correctly', () => {
        // 2 attempts, both succeed at position 0
        manager.recordOutcome({
          taskType: 'code',
          successPosition: 0,
          successfulCli: 'claude',
          exhausted: false,
        });
        manager.recordOutcome({
          taskType: 'code',
          successPosition: 0,
          successfulCli: 'claude',
          exhausted: false,
        });

        const rates = manager.getSuccessRatesByPosition('code');
        expect(rates[0]).toBe(1); // 2/2 = 100%
      });

      it('should calculate partial success rates', () => {
        manager.recordOutcome({
          taskType: 'research',
          successPosition: 0,
          successfulCli: 'claude',
          exhausted: false,
        });
        manager.recordOutcome({
          taskType: 'research',
          successPosition: 1,
          successfulCli: 'gemini',
          exhausted: false,
        });

        const rates = manager.getSuccessRatesByPosition('research');
        expect(rates[0]).toBe(0.5); // 1/2 = 50%
        expect(rates[1]).toBe(0.5); // 1/2 = 50%
      });
    });

    describe('getOverallSuccessRate', () => {
      it('should return 0 when no attempts', () => {
        expect(manager.getOverallSuccessRate('code')).toBe(0);
      });

      it('should calculate overall success rate', () => {
        manager.recordOutcome({
          taskType: 'code',
          successPosition: 0,
          successfulCli: 'claude',
          exhausted: false,
        });
        manager.recordOutcome({
          taskType: 'code',
          successPosition: -1,
          exhausted: true,
        });

        // 1 success out of 2 attempts
        expect(manager.getOverallSuccessRate('code')).toBe(0.5);
      });
    });

    describe('getAllMetrics', () => {
      it('should return metrics for all task types', () => {
        const allMetrics = manager.getAllMetrics();
        expect(allMetrics.code).toBeDefined();
        expect(allMetrics.research).toBeDefined();
        expect(allMetrics.documentation).toBeDefined();
        expect(allMetrics.analysis).toBeDefined();
        expect(allMetrics.general).toBeDefined();
      });
    });

    describe('resetMetrics', () => {
      it('should reset all metrics to zero', () => {
        manager.recordOutcome({
          taskType: 'code',
          successPosition: 0,
          successfulCli: 'claude',
          exhausted: false,
        });

        manager.resetMetrics();

        const metrics = manager.getMetrics('code');
        expect(metrics.totalAttempts).toBe(0);
        expect(metrics.exhaustedCount).toBe(0);
      });
    });

    describe('custom registry', () => {
      it('should accept custom fallback chain registry', () => {
        const customRegistry = {
          ...DEFAULT_FALLBACK_CHAINS,
          code: ['gemini', 'claude', 'codex'] as const,
        };
        const customManager = new FallbackChainManager(customRegistry);
        const chain = customManager.getChain('code');
        expect(chain[0]).toBe('gemini');
      });
    });
  });

  describe('createFallbackChainManager', () => {
    it('should create manager with default registry', () => {
      const manager = createFallbackChainManager();
      expect(manager.getChain('code')).toEqual(DEFAULT_FALLBACK_CHAINS.code);
    });

    it('should create manager with custom registry', () => {
      const customRegistry = {
        ...DEFAULT_FALLBACK_CHAINS,
        code: ['codex', 'claude', 'gemini'] as const,
      };
      const manager = createFallbackChainManager(customRegistry);
      expect(manager.getChain('code')[0]).toBe('codex');
    });
  });

  describe('createFallbackChainRegistry', () => {
    it('should merge overrides with defaults', () => {
      const registry = createFallbackChainRegistry({
        code: ['gemini', 'codex', 'claude'],
      });
      expect(registry.code).toEqual(['gemini', 'codex', 'claude']);
      expect(registry.research).toEqual(DEFAULT_FALLBACK_CHAINS.research);
    });

    it('should preserve defaults when no overrides', () => {
      const registry = createFallbackChainRegistry({});
      expect(registry).toEqual(DEFAULT_FALLBACK_CHAINS);
    });
  });

  describe('Zod schemas', () => {
    describe('FallbackChainSchema', () => {
      it('should validate valid chains', () => {
        const result = FallbackChainSchema.safeParse(['claude', 'gemini', 'codex']);
        expect(result.success).toBe(true);
      });

      it('should reject empty chains', () => {
        const result = FallbackChainSchema.safeParse([]);
        expect(result.success).toBe(false);
      });

      it('should reject invalid CLI names', () => {
        const result = FallbackChainSchema.safeParse(['claude', 'invalid']);
        expect(result.success).toBe(false);
      });
    });

    describe('FallbackChainRegistrySchema', () => {
      it('should validate valid registries', () => {
        const result = FallbackChainRegistrySchema.safeParse(DEFAULT_FALLBACK_CHAINS);
        expect(result.success).toBe(true);
      });

      it('should reject missing task types', () => {
        const result = FallbackChainRegistrySchema.safeParse({
          code: ['claude'],
        });
        expect(result.success).toBe(false);
      });
    });
  });

  // -----------------------------------------------------------------------
  // Data Integrity (cross-project learning from tsundoku)
  // -----------------------------------------------------------------------

  describe('data integrity', () => {
    it('every override chain has at least 2 CLIs', () => {
      for (const chain of Object.values(CATEGORY_CHAIN_OVERRIDES)) {
        expect(chain.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('no duplicate CLIs in any default chain', () => {
      for (const chain of Object.values(DEFAULT_FALLBACK_CHAINS)) {
        const unique = new Set(chain);
        expect(unique.size).toBe(chain.length);
      }
    });

    it('no duplicate CLIs in any override chain', () => {
      for (const chain of Object.values(CATEGORY_CHAIN_OVERRIDES)) {
        const unique = new Set(chain);
        expect(unique.size).toBe(chain.length);
      }
    });

    it('all CLIs in override chains exist in CLI_NAMES', () => {
      const validClis = new Set<string>(CLI_NAMES);
      for (const chain of Object.values(CATEGORY_CHAIN_OVERRIDES)) {
        for (const cli of chain) {
          expect(validClis.has(cli)).toBe(true);
        }
      }
    });
  });
});

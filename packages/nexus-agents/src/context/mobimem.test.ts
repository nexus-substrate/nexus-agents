/**
 * nexus-agents/context - MobiMEM Tests
 *
 * Tests for MobiMEM post-deployment evolution memory system.
 *
 * @module context/mobimem.test
 * (Source: Issue #149)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MobiMem,
  createMobiMem,
  defaultSharedDbPath,
  type ActionStep,
  type ExecutionOutcome,
} from './mobimem.js';

/** Restore an env var to a saved value, or clear it if it was unset. */
function restoreEnv(key: string, saved: string | undefined): void {
  if (saved === undefined) Reflect.deleteProperty(process.env, key);
  else process.env[key] = saved;
}

describe('MobiMem', () => {
  let mobimem: MobiMem;

  beforeEach(() => {
    mobimem = new MobiMem({
      maxProfileEntries: 10,
      maxExperiencePatterns: 50,
      maxActionCacheEntries: 20,
      actionCacheTtlMs: 60000, // 1 minute for tests
      minProfileConfidence: 0.5,
      minExperienceSuccessRate: 0.6,
    });
  });

  describe('Profile Memory', () => {
    it('should observe and store preferences', () => {
      const entry = mobimem.profile.observe('agent-1', 'agent', 'preferred_model', 'claude-3');

      expect(entry.entityId).toBe('agent-1');
      expect(entry.entityType).toBe('agent');
      expect(entry.preferenceKey).toBe('preferred_model');
      expect(entry.preferenceValue).toBe('claude-3');
      expect(entry.observationCount).toBe(1);
      expect(entry.confidence).toBeGreaterThan(0);
    });

    it('should increase confidence with repeated observations', () => {
      mobimem.profile.observe('agent-1', 'agent', 'temperature', 0.7);
      mobimem.profile.observe('agent-1', 'agent', 'temperature', 0.7);
      const entry = mobimem.profile.observe('agent-1', 'agent', 'temperature', 0.7);

      expect(entry.observationCount).toBe(3);
      expect(entry.confidence).toBeGreaterThan(0.3);
    });

    it('should retrieve preferences for an entity', () => {
      mobimem.profile.observe('agent-1', 'agent', 'model', 'claude');
      mobimem.profile.observe('agent-1', 'agent', 'temperature', 0.5);
      mobimem.profile.observe('agent-2', 'agent', 'model', 'gpt-4');

      const prefs = mobimem.profile.getPreferences('agent-1');

      expect(prefs.length).toBe(2);
      expect(prefs.map((p) => p.preferenceKey)).toContain('model');
      expect(prefs.map((p) => p.preferenceKey)).toContain('temperature');
    });

    it('should get specific preference', () => {
      mobimem.profile.observe('user-1', 'user', 'output_format', 'json');

      const pref = mobimem.profile.getPreference('user-1', 'output_format');

      expect(pref).not.toBeNull();
      expect(pref?.preferenceValue).toBe('json');
    });

    it('should return null for non-existent preference', () => {
      const pref = mobimem.profile.getPreference('unknown', 'unknown');
      expect(pref).toBeNull();
    });

    it('should filter established preferences by confidence', () => {
      // Low observation count = low confidence
      mobimem.profile.observe('agent-1', 'agent', 'low_conf', 'value');

      // High observation count = high confidence
      for (let i = 0; i < 10; i++) {
        mobimem.profile.observe('agent-1', 'agent', 'high_conf', 'value');
      }

      const established = mobimem.profile.getEstablishedPreferences('agent-1');

      expect(established.length).toBe(1);
      expect(established[0]?.preferenceKey).toBe('high_conf');
    });

    it('should clear preferences for an entity', () => {
      mobimem.profile.observe('agent-1', 'agent', 'pref1', 'v1');
      mobimem.profile.observe('agent-1', 'agent', 'pref2', 'v2');
      mobimem.profile.observe('agent-2', 'agent', 'pref1', 'v1');

      const cleared = mobimem.profile.clearPreferences('agent-1');

      expect(cleared).toBe(2);
      expect(mobimem.profile.getPreferences('agent-1').length).toBe(0);
      expect(mobimem.profile.getPreferences('agent-2').length).toBe(1);
    });

    it('should enforce max entries limit per entity', () => {
      // Add 15 preferences (limit is 10)
      for (let i = 0; i < 15; i++) {
        mobimem.profile.observe('agent-1', 'agent', `pref_${String(i)}`, `value_${String(i)}`);
      }

      const prefs = mobimem.profile.getPreferences('agent-1');
      expect(prefs.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Experience Memory', () => {
    const sampleSteps: ActionStep[] = [
      {
        index: 0,
        actionType: 'tool_call',
        parameters: { tool: 'search' },
        durationMs: 100,
        success: true,
      },
      {
        index: 1,
        actionType: 'model_query',
        parameters: { prompt: 'analyze' },
        durationMs: 500,
        success: true,
      },
    ];

    const successOutcome: ExecutionOutcome = {
      success: true,
      qualityScore: 0.9,
      totalDurationMs: 600,
      tokensUsed: 1500,
    };

    const failOutcome: ExecutionOutcome = {
      success: false,
      errorType: 'timeout',
      totalDurationMs: 5000,
      tokensUsed: 500,
    };

    it('should record execution patterns', () => {
      const entry = mobimem.experience.recordExecution(
        'code_review',
        sampleSteps,
        successOutcome,
        'github:repo'
      );

      expect(entry.taskType).toBe('code_review');
      expect(entry.actionSequence).toEqual(sampleSteps);
      expect(entry.outcome.success).toBe(true);
      expect(entry.successRate).toBe(1);
    });

    it('should update success rate on repeated executions', () => {
      mobimem.experience.recordExecution('task', sampleSteps, successOutcome, 'ctx');
      mobimem.experience.recordExecution('task', sampleSteps, successOutcome, 'ctx');
      const entry = mobimem.experience.recordExecution('task', sampleSteps, failOutcome, 'ctx');

      expect(entry.attemptCount).toBe(3);
      expect(entry.successCount).toBe(2);
      expect(entry.successRate).toBeCloseTo(0.667, 2);
    });

    it('should find patterns by task type', () => {
      mobimem.experience.recordExecution('task_a', sampleSteps, successOutcome, 'ctx1');
      mobimem.experience.recordExecution('task_a', sampleSteps, successOutcome, 'ctx2');
      mobimem.experience.recordExecution('task_b', sampleSteps, successOutcome, 'ctx1');

      const patterns = mobimem.experience.findPatterns('task_a');

      expect(patterns.length).toBe(2);
      expect(patterns.every((p) => p.taskType === 'task_a')).toBe(true);
    });

    it('should find reliable patterns above success threshold', () => {
      // Create pattern with high success rate (multiple attempts needed)
      for (let i = 0; i < 4; i++) {
        mobimem.experience.recordExecution('reliable', sampleSteps, successOutcome, 'ctx');
      }

      // Create pattern with low success rate
      mobimem.experience.recordExecution('unreliable', sampleSteps, failOutcome, 'ctx2');
      mobimem.experience.recordExecution('unreliable', sampleSteps, failOutcome, 'ctx2');
      mobimem.experience.recordExecution('unreliable', sampleSteps, failOutcome, 'ctx2');

      const reliable = mobimem.experience.findReliablePatterns('reliable');
      const unreliable = mobimem.experience.findReliablePatterns('unreliable');

      expect(reliable.length).toBe(1);
      expect(unreliable.length).toBe(0);
    });

    it('should get best pattern for context', () => {
      // High success with matching context
      for (let i = 0; i < 5; i++) {
        mobimem.experience.recordExecution('task', sampleSteps, successOutcome, 'exact_match');
      }

      // High success with different context
      for (let i = 0; i < 5; i++) {
        mobimem.experience.recordExecution('task', sampleSteps, successOutcome, 'other_ctx');
      }

      const best = mobimem.experience.getBestPattern('task', 'exact_match');

      expect(best).not.toBeNull();
      expect(best?.contextSignature).toBe('exact_match');
    });

    it('should return null for no matching patterns', () => {
      const best = mobimem.experience.getBestPattern('unknown_task', 'ctx');
      expect(best).toBeNull();
    });

    it('should update pattern metrics', () => {
      const entry = mobimem.experience.recordExecution('task', sampleSteps, successOutcome, 'ctx');

      mobimem.experience.updatePatternMetrics(entry.id, false);

      const patterns = mobimem.experience.findPatterns('task');
      expect(patterns[0]?.attemptCount).toBe(2);
      expect(patterns[0]?.successRate).toBe(0.5);
    });
  });

  describe('Action Cache', () => {
    const sampleInput = { query: 'test query', params: { limit: 10 } };
    const sampleResult = { data: [1, 2, 3], success: true };

    it('should cache action results', () => {
      const entry = mobimem.action.cache(sampleInput, sampleResult, 500);

      expect(entry.input).toEqual(sampleInput);
      expect(entry.result).toEqual(sampleResult);
      expect(entry.originalDurationMs).toBe(500);
      expect(entry.hitCount).toBe(0);
    });

    it('should retrieve cached results', () => {
      mobimem.action.cache(sampleInput, sampleResult, 500);

      const cached = mobimem.action.get(sampleInput);

      expect(cached).not.toBeNull();
      expect(cached?.result).toEqual(sampleResult);
    });

    it('should return null for cache miss', () => {
      const cached = mobimem.action.get({ unknown: true });
      expect(cached).toBeNull();
    });

    it('should record cache hits', () => {
      const entry = mobimem.action.cache(sampleInput, sampleResult, 500);
      mobimem.action.recordHit(entry.id);
      mobimem.action.recordHit(entry.id);

      const cached = mobimem.action.get(sampleInput);
      expect(cached?.hitCount).toBe(2);
      expect(cached?.timeSavedMs).toBe(1000);
    });

    it('should evict expired entries', async () => {
      // Use very short TTL
      const shortTtl = new MobiMem({ actionCacheTtlMs: 10 });
      shortTtl.action.cache(sampleInput, sampleResult, 100);

      // Wait for expiration
      await new Promise((r) => setTimeout(r, 20));

      const evicted = shortTtl.action.evictExpired();
      expect(evicted).toBe(1);

      const cached = shortTtl.action.get(sampleInput);
      expect(cached).toBeNull();
    });

    it('should return null for expired entries on get', async () => {
      const shortTtl = new MobiMem({ actionCacheTtlMs: 10 });
      shortTtl.action.cache(sampleInput, sampleResult, 100);

      await new Promise((r) => setTimeout(r, 20));

      const cached = shortTtl.action.get(sampleInput);
      expect(cached).toBeNull();
    });

    it('should clear all cache entries', () => {
      mobimem.action.cache({ a: 1 }, 'r1', 100);
      mobimem.action.cache({ b: 2 }, 'r2', 100);
      mobimem.action.cache({ c: 3 }, 'r3', 100);

      const cleared = mobimem.action.clear();

      expect(cleared).toBe(3);
      expect(mobimem.action.getStats().entries).toBe(0);
    });

    it('should track statistics', () => {
      mobimem.action.cache(sampleInput, sampleResult, 500);
      mobimem.action.get(sampleInput); // miss counter already incremented, this is a hit
      mobimem.action.get({ unknown: true }); // miss

      const stats = mobimem.action.getStats();

      expect(stats.entries).toBe(1);
      expect(stats.hits).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should enforce max entries limit', () => {
      // Add 25 entries (limit is 20)
      for (let i = 0; i < 25; i++) {
        mobimem.action.cache({ id: i }, `result_${String(i)}`, 100);
      }

      const stats = mobimem.action.getStats();
      expect(stats.entries).toBeLessThanOrEqual(20);
    });
  });

  describe('MobiMem Integration', () => {
    it('should provide overall statistics', () => {
      // Add profile data
      mobimem.profile.observe('agent-1', 'agent', 'pref', 'value');

      // Add experience data
      mobimem.experience.recordExecution(
        'task',
        [{ index: 0, actionType: 'test', parameters: {}, durationMs: 100, success: true }],
        { success: true, totalDurationMs: 100, tokensUsed: 50 },
        'ctx'
      );

      // Add action cache data
      mobimem.action.cache({ q: 1 }, 'result', 200);

      const stats = mobimem.getStats();

      expect(stats.profile.totalEntries).toBe(1);
      expect(stats.profile.uniqueEntities).toBe(1);
      expect(stats.experience.totalPatterns).toBe(1);
      expect(stats.experience.uniqueTaskTypes).toBe(1);
      expect(stats.action.totalEntries).toBe(1);
    });

    it('should run maintenance', () => {
      mobimem.runMaintenance();
      // Should not throw
    });

    it('should close cleanly', () => {
      mobimem.close();
      // Should not throw
    });
  });

  describe('createMobiMem factory', () => {
    it('should create instance with default config', () => {
      const instance = createMobiMem();
      expect(instance).toBeInstanceOf(MobiMem);
    });

    it('should create instance with custom config', () => {
      const instance = createMobiMem({
        maxProfileEntries: 50,
        actionCacheTtlMs: 120000,
      });

      expect(instance).toBeInstanceOf(MobiMem);
    });
  });

  // #3995: the shared-DB default resolver must route through `nexusDataPath`
  // instead of re-implementing `~/.nexus-agents` inline.
  describe('defaultSharedDbPath (#3995)', () => {
    let savedDataDir: string | undefined;
    let savedRepoPreferred: string | undefined;
    let savedSandbox: string | undefined;
    let savedSandboxRoot: string | undefined;

    beforeEach(() => {
      savedDataDir = process.env['NEXUS_DATA_DIR'];
      savedRepoPreferred = process.env['NEXUS_REPO_PREFERRED'];
      savedSandbox = process.env['NEXUS_SANDBOX'];
      savedSandboxRoot = process.env['NEXUS_SANDBOX_ROOT'];
    });

    afterEach(() => {
      restoreEnv('NEXUS_DATA_DIR', savedDataDir);
      restoreEnv('NEXUS_REPO_PREFERRED', savedRepoPreferred);
      restoreEnv('NEXUS_SANDBOX', savedSandbox);
      restoreEnv('NEXUS_SANDBOX_ROOT', savedSandboxRoot);
    });

    it('resolves under NEXUS_DATA_DIR/memory/mobimem.db when that env is set', () => {
      process.env['NEXUS_DATA_DIR'] = '/var/lib/nexus-test';
      // env override wins regardless of repo-preferred.
      expect(defaultSharedDbPath()).toBe('/var/lib/nexus-test/memory/mobimem.db');
    });

    it('resolves under the sandbox root when NEXUS_SANDBOX is active', () => {
      delete process.env['NEXUS_DATA_DIR'];
      process.env['NEXUS_SANDBOX'] = 'docker-opencode';
      process.env['NEXUS_SANDBOX_ROOT'] = '/projects';
      expect(defaultSharedDbPath()).toBe('/projects/.nexus-agents/memory/mobimem.db');
    });

    it('always ends in the cross-repo memory subdir', () => {
      // `memory` is intentionally NOT a per-repo subdir, so the path always
      // carries the `memory/mobimem.db` tail regardless of resolution tier.
      process.env['NEXUS_DATA_DIR'] = '/tmp/nexus-x';
      expect(defaultSharedDbPath().endsWith('/memory/mobimem.db')).toBe(true);
    });
  });
});

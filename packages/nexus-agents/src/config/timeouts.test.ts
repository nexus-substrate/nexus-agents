/**
 * Tests for centralized timeout configuration.
 *
 * @module config/timeouts.test
 * (Source: Issue #984 — Centralize timeout configuration)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CLI_TIMEOUTS,
  VOTE_TIMEOUTS,
  MCP_TIMEOUTS,
  WORKFLOW_TIMEOUTS,
  GRAPH_TIMEOUTS,
  PER_CLI_TASK_TIMEOUTS,
  API_TIMEOUTS,
  INTERNAL_TIMEOUTS,
  TEST_TIMEOUTS,
  EXPERT_TIMEOUTS,
  HEARTBEAT_TIMEOUTS,
  TIMEOUT_GUARD,
  REFLECTIVE_TIMEOUTS,
  STEP_EXECUTOR_TIMEOUTS,
  CACHE_TIMEOUTS,
  WORKER_TIMEOUTS,
  TIMEOUT_ENV_VARS,
  getCliTimeoutProfile,
  resolveWorkerTimeout,
  getCliTimeout,
  getExpertTaskTimeout,
  getMcpSafeDeadlineMs,
  resolveVoteTimeout,
  resolveEnvTimeout,
  validateTimeout,
  OPERATION_CLASSES,
  TOOL_CLASS,
  DEFAULT_OPERATION_CLASS,
  resolveClassGuardMs,
  resolveToolClassGuardMs,
  resolveTimeoutMultiplier,
  classOverrideEnvVar,
  SINGLE_LLM_EVAL_TIMEOUT_MS,
  NETWORK_FETCH_TIMEOUT_MS,
  SEARCH_TREE_MAX_TIME_MS,
  type OperationClassName,
} from './timeouts.js';
import { TOOL_MANIFEST } from '../mcp/tools/tool-manifest.js';

describe('Centralized Timeout Configuration', () => {
  describe('CLI_TIMEOUTS', () => {
    it('has correct claude timeouts', () => {
      expect(CLI_TIMEOUTS.claude).toEqual({
        simple: 30_000,
        standard: 120_000,
        complex: 600_000,
      });
    });

    it('has correct gemini timeouts', () => {
      expect(CLI_TIMEOUTS.gemini).toEqual({
        simple: 30_000,
        standard: 180_000,
        complex: 600_000,
      });
    });

    it('has correct codex timeouts', () => {
      expect(CLI_TIMEOUTS.codex).toEqual({
        simple: 10_000,
        standard: 60_000,
        complex: 300_000,
      });
    });

    it('has a default profile', () => {
      expect(CLI_TIMEOUTS.default).toEqual({
        simple: 30_000,
        standard: 120_000,
        complex: 600_000,
      });
    });
  });

  describe('VOTE_TIMEOUTS', () => {
    it('has correct defaults', () => {
      expect(VOTE_TIMEOUTS.defaultMs).toBe(300_000);
      expect(VOTE_TIMEOUTS.minMs).toBe(30_000);
      expect(VOTE_TIMEOUTS.maxMs).toBe(600_000);
      expect(VOTE_TIMEOUTS.maxRetries).toBe(2);
    });
  });

  describe('MCP_TIMEOUTS', () => {
    it('has non-punitive class-derived defaults (#3734)', () => {
      // Default flipped 60s → 300s (single-llm guard); max raised 900s → 3600s
      // so pipeline/async-body classes are not silently clamped.
      expect(MCP_TIMEOUTS.defaultMs).toBe(300_000);
      expect(MCP_TIMEOUTS.maxMs).toBe(3_600_000);
    });

    it('has class-derived per-tool guards for long-running tools (#3734)', () => {
      // orchestrate/run_workflow → pipeline (1800s); consensus_vote/execute_expert
      // → multi-llm-panel (900s).
      expect(MCP_TIMEOUTS.perTool['orchestrate']).toBe(1_800_000);
      expect(MCP_TIMEOUTS.perTool['consensus_vote']).toBe(900_000);
      expect(MCP_TIMEOUTS.perTool['execute_expert']).toBe(900_000);
      expect(MCP_TIMEOUTS.perTool['run_workflow']).toBe(1_800_000);
    });

    it('grants the 60s-wrapper long-running tools a class guard (#3734)', () => {
      // pr_review/supply_chain → multi-llm-panel (900s); execute_spec/run → pipeline.
      expect(MCP_TIMEOUTS.perTool['pr_review']).toBe(900_000);
      expect(MCP_TIMEOUTS.perTool['supply_chain_tradeoff_panel']).toBe(900_000);
      expect(MCP_TIMEOUTS.perTool['execute_spec']).toBe(1_800_000);
      expect(MCP_TIMEOUTS.perTool['run']).toBe(1_800_000);
    });

    it('exposes a run_dev_pipeline async-mode timeout hint (#3726)', () => {
      const hint = MCP_TIMEOUTS.perToolTimeoutHint['run_dev_pipeline'];
      expect(hint).toBeDefined();
      expect(hint).toContain("dispatch: 'async'");
      expect(hint).toContain('get_job_result');
    });

    it('exposes a safety buffer for internal deadlines', () => {
      expect(MCP_TIMEOUTS.perToolSafetyBufferMs).toBeGreaterThan(0);
      // Must be smaller than the smallest per-tool cap (interactive 60s) so
      // clamping never swallows the whole timeout.
      const smallestPerTool = Math.min(...Object.values(MCP_TIMEOUTS.perTool));
      expect(MCP_TIMEOUTS.perToolSafetyBufferMs).toBeLessThan(smallestPerTool / 5);
    });
  });

  describe('getMcpSafeDeadlineMs()', () => {
    it('clamps a computed deadline larger than the MCP wrapper minus buffer', () => {
      // consensus_vote cap is 900_000 (multi-llm-panel); buffer 10_000 → safe
      // cap 890_000. computed 970_000 → clamped to 890_000.
      const computed = 970_000;
      const result = getMcpSafeDeadlineMs(computed, 'consensus_vote');
      expect(result).toBe(
        MCP_TIMEOUTS.perTool['consensus_vote']! - MCP_TIMEOUTS.perToolSafetyBufferMs
      );
      expect(result).toBeLessThan(MCP_TIMEOUTS.perTool['consensus_vote']!);
    });

    it('leaves a computed deadline between the floor and the safe cap unchanged', () => {
      // A call with a computed deadline above the floor (defaultMs/2 = 150_000)
      // and below the safe cap must not be inflated or clamped.
      const computed = 200_000;
      expect(getMcpSafeDeadlineMs(computed, 'consensus_vote')).toBe(200_000);
    });

    it('falls back to the default MCP timeout for unknown tool names', () => {
      // Unknown tool: safe cap = defaultMs (300_000) - buffer (10_000) = 290_000.
      const computed = 900_000;
      expect(getMcpSafeDeadlineMs(computed, 'not_a_real_tool')).toBe(290_000);
    });

    it('floors the return value so tools remain minimally useful', () => {
      // If a future change set perTool.x to a tiny value, we never return
      // less than defaultMs / 2 (= 30_000) — the tool is still callable.
      // We can't mutate the frozen record, so we simulate via the unknown-
      // tool path with a computed deadline much smaller than the safe cap.
      const tiny = 1;
      const out = getMcpSafeDeadlineMs(tiny, 'consensus_vote');
      // min(tiny, safeCap) = 1 → floored to 30_000
      expect(out).toBe(Math.floor(MCP_TIMEOUTS.defaultMs / 2));
    });

    it('the clamped consensus_vote deadline always fires before the MCP wrapper', () => {
      // Guard the core invariant: no matter what the caller computes, the
      // clamped deadline is strictly less than the MCP per-tool timeout.
      for (const computed of [100, 600_000, 970_000, 1_800_000]) {
        const out = getMcpSafeDeadlineMs(computed, 'consensus_vote');
        expect(out).toBeLessThan(MCP_TIMEOUTS.perTool['consensus_vote']!);
      }
    });
  });

  describe('WORKFLOW_TIMEOUTS', () => {
    it('has correct defaults', () => {
      expect(WORKFLOW_TIMEOUTS.stepMs).toBe(300_000);
      expect(WORKFLOW_TIMEOUTS.workflowMs).toBe(300_000);
      expect(WORKFLOW_TIMEOUTS.workflowMaxMs).toBe(1_800_000);
      expect(WORKFLOW_TIMEOUTS.maxRetryDelayMs).toBe(30_000);
    });
  });

  describe('GRAPH_TIMEOUTS', () => {
    it('has correct defaults', () => {
      expect(GRAPH_TIMEOUTS.defaultMs).toBe(120_000);
      expect(GRAPH_TIMEOUTS.maxSteps).toBe(100);
    });
  });

  describe('PER_CLI_TASK_TIMEOUTS', () => {
    it('has correct defaults', () => {
      expect(PER_CLI_TASK_TIMEOUTS.defaultMs).toBe(300_000);
      expect(PER_CLI_TASK_TIMEOUTS.minMs).toBe(1_000);
      expect(PER_CLI_TASK_TIMEOUTS.maxMs).toBe(600_000);
      expect(PER_CLI_TASK_TIMEOUTS.explorationMs).toBe(180_000);
    });
  });

  describe('API_TIMEOUTS', () => {
    it('has correct defaults', () => {
      expect(API_TIMEOUTS.defaultMs).toBe(30_000);
      expect(API_TIMEOUTS.maxMs).toBe(300_000);
      expect(API_TIMEOUTS.arxivMs).toBe(30_000);
      expect(API_TIMEOUTS.sourceMs).toBe(30_000);
      expect(API_TIMEOUTS.v2DelegateMs).toBe(30_000);
      expect(API_TIMEOUTS.providerMs).toBe(30_000);
    });
  });

  describe('INTERNAL_TIMEOUTS', () => {
    it('has correct defaults', () => {
      expect(INTERNAL_TIMEOUTS.healthCheckMs).toBe(5_000);
      expect(INTERNAL_TIMEOUTS.circuitBreakerResetMs).toBe(30_000);
      expect(INTERNAL_TIMEOUTS.selfEvalMs).toBe(120_000);
      expect(INTERNAL_TIMEOUTS.waveTaskMs).toBe(60_000);
      expect(INTERNAL_TIMEOUTS.puppeteerMs).toBe(300_000);
    });
  });

  describe('TEST_TIMEOUTS', () => {
    it('has correct defaults', () => {
      expect(TEST_TIMEOUTS.globalMs).toBe(600_000);
      expect(TEST_TIMEOUTS.taskMs).toBe(120_000);
    });
  });

  describe('getCliTimeoutProfile()', () => {
    it('returns profile for known CLIs', () => {
      expect(getCliTimeoutProfile('claude')).toEqual(CLI_TIMEOUTS.claude);
      expect(getCliTimeoutProfile('gemini')).toEqual(CLI_TIMEOUTS.gemini);
      expect(getCliTimeoutProfile('codex')).toEqual(CLI_TIMEOUTS.codex);
    });

    it('returns default for unknown CLIs', () => {
      expect(getCliTimeoutProfile('unknown')).toEqual(CLI_TIMEOUTS.default);
      expect(getCliTimeoutProfile('')).toEqual(CLI_TIMEOUTS.default);
    });
  });

  describe('getCliTimeout()', () => {
    it('returns correct timeout by CLI and complexity', () => {
      expect(getCliTimeout('claude', 'simple')).toBe(30_000);
      expect(getCliTimeout('claude', 'complex')).toBe(600_000);
      expect(getCliTimeout('gemini', 'complex')).toBe(600_000);
      expect(getCliTimeout('codex', 'standard')).toBe(60_000);
    });

    it('returns default for unknown CLI', () => {
      expect(getCliTimeout('unknown', 'complex')).toBe(600_000);
    });
  });

  describe('resolveVoteTimeout()', () => {
    const envKey = 'NEXUS_VOTE_TIMEOUT_MS';
    const originalEnv = process.env[envKey];

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env[envKey] = originalEnv;
      } else {
        delete process.env.NEXUS_VOTE_TIMEOUT_MS;
      }
    });

    it('returns default when env var not set', () => {
      delete process.env.NEXUS_VOTE_TIMEOUT_MS;
      expect(resolveVoteTimeout()).toBe(300_000);
    });

    it('reads from env var', () => {
      process.env[envKey] = '250000';
      expect(resolveVoteTimeout()).toBe(250_000);
    });

    it('clamps to minimum', () => {
      process.env[envKey] = '1000';
      expect(resolveVoteTimeout()).toBe(30_000);
    });

    it('clamps to maximum', () => {
      process.env[envKey] = '999999';
      expect(resolveVoteTimeout()).toBe(600_000);
    });

    it('ignores invalid values', () => {
      process.env[envKey] = 'not_a_number';
      expect(resolveVoteTimeout()).toBe(300_000);
    });
  });

  describe('resolveEnvTimeout()', () => {
    const testVar = 'NEXUS_TEST_TIMEOUT_MS';

    beforeEach(() => {
      delete process.env.NEXUS_TEST_TIMEOUT_MS;
    });

    afterEach(() => {
      delete process.env.NEXUS_TEST_TIMEOUT_MS;
    });

    it('returns default when env var not set', () => {
      expect(resolveEnvTimeout(testVar, 60_000, 1_000, 300_000)).toBe(60_000);
    });

    it('parses valid env var', () => {
      process.env[testVar] = '90000';
      expect(resolveEnvTimeout(testVar, 60_000, 1_000, 300_000)).toBe(90_000);
    });

    it('clamps below minimum', () => {
      process.env[testVar] = '500';
      expect(resolveEnvTimeout(testVar, 60_000, 1_000, 300_000)).toBe(1_000);
    });

    it('clamps above maximum', () => {
      process.env[testVar] = '999999';
      expect(resolveEnvTimeout(testVar, 60_000, 1_000, 300_000)).toBe(300_000);
    });
  });

  describe('validateTimeout()', () => {
    it('returns value unchanged when in range', () => {
      const result = validateTimeout(60_000);
      expect(result).toEqual({ value: 60_000, clamped: false });
    });

    it('clamps below minimum', () => {
      const result = validateTimeout(1_000);
      expect(result).toEqual({ value: 30_000, clamped: true });
    });

    it('clamps above maximum', () => {
      const result = validateTimeout(999_999);
      expect(result).toEqual({ value: 600_000, clamped: true });
    });

    it('accepts custom min/max', () => {
      const result = validateTimeout(50, 100, 200);
      expect(result).toEqual({ value: 100, clamped: true });
    });
  });

  describe('EXPERT_TIMEOUTS', () => {
    it('has correct complexity tiers', () => {
      expect(EXPERT_TIMEOUTS.complexMs).toBe(600_000);
      expect(EXPERT_TIMEOUTS.standardMs).toBe(300_000);
    });

    it('has correct bounds', () => {
      expect(EXPERT_TIMEOUTS.minMs).toBe(30_000);
      expect(EXPERT_TIMEOUTS.maxMs).toBe(900_000);
    });

    it('lists complex categories', () => {
      expect(EXPERT_TIMEOUTS.complexCategories).toContain('architecture');
      expect(EXPERT_TIMEOUTS.complexCategories).toContain('security_review');
      expect(EXPERT_TIMEOUTS.complexCategories).toContain('planning');
      expect(EXPERT_TIMEOUTS.complexCategories).toContain('research');
      expect(EXPERT_TIMEOUTS.complexCategories).toContain('devops');
      expect(EXPERT_TIMEOUTS.complexCategories).toContain('documentation');
      expect(EXPERT_TIMEOUTS.complexCategories).toHaveLength(6);
    });
  });

  describe('getExpertTaskTimeout()', () => {
    const envKey = 'NEXUS_EXPERT_TIMEOUT_MS';

    afterEach(() => {
      delete process.env.NEXUS_EXPERT_TIMEOUT_MS;
    });

    it('returns complex timeout for architecture tasks', () => {
      expect(getExpertTaskTimeout('Review the system architecture')).toBe(600_000);
    });

    it('returns complex timeout for security tasks', () => {
      expect(getExpertTaskTimeout('Perform a security review of auth')).toBe(600_000);
    });

    it('returns complex timeout for research tasks', () => {
      // "Research ..." matches research category (in complexCategories) with best-match scoring
      expect(getExpertTaskTimeout('Research the vulnerability scanner landscape')).toBe(600_000);
    });

    it('returns standard timeout for code generation tasks', () => {
      expect(getExpertTaskTimeout('Generate unit tests for the API')).toBe(300_000);
    });

    it('returns complex timeout for documentation tasks', () => {
      expect(getExpertTaskTimeout('Write documentation for this module')).toBe(600_000);
    });

    it('returns standard timeout for unrecognized tasks', () => {
      expect(getExpertTaskTimeout('do something random')).toBe(300_000);
    });

    it('respects env override', () => {
      process.env[envKey] = '200000';
      expect(getExpertTaskTimeout('architecture review')).toBe(200_000);
    });

    it('clamps env override to minimum', () => {
      process.env[envKey] = '1000';
      expect(getExpertTaskTimeout('any task')).toBe(30_000);
    });

    it('clamps env override to maximum', () => {
      process.env[envKey] = '9999999';
      expect(getExpertTaskTimeout('any task')).toBe(900_000);
    });
  });

  describe('HEARTBEAT_TIMEOUTS', () => {
    it('has correct thresholds', () => {
      expect(HEARTBEAT_TIMEOUTS.slowThresholdMs).toBe(60_000);
      expect(HEARTBEAT_TIMEOUTS.stalledThresholdMs).toBe(120_000);
      expect(HEARTBEAT_TIMEOUTS.absoluteMaxMs).toBe(900_000);
      expect(HEARTBEAT_TIMEOUTS.heartbeatIntervalMs).toBe(15_000);
    });
  });

  describe('TIMEOUT_GUARD', () => {
    it('has correct defaults', () => {
      expect(TIMEOUT_GUARD.defaultMs).toBe(60_000);
      expect(TIMEOUT_GUARD.maxMs).toBe(900_000);
      expect(TIMEOUT_GUARD.nearTimeoutThreshold).toBe(0.8);
    });
  });

  describe('REFLECTIVE_TIMEOUTS', () => {
    it('has correct values', () => {
      expect(REFLECTIVE_TIMEOUTS.reflectionMs).toBe(2_000);
      expect(REFLECTIVE_TIMEOUTS.cacheTtlMs).toBe(300_000);
    });
  });

  describe('STEP_EXECUTOR_TIMEOUTS', () => {
    it('has correct defaults', () => {
      expect(STEP_EXECUTOR_TIMEOUTS.defaultMs).toBe(300_000);
      expect(STEP_EXECUTOR_TIMEOUTS.retryDelayMs).toBe(1_000);
    });
  });

  describe('CACHE_TIMEOUTS', () => {
    it('has correct values', () => {
      expect(CACHE_TIMEOUTS.reputationTtlMs).toBe(300_000);
      expect(CACHE_TIMEOUTS.rateLimitRefillMs).toBe(1_000);
    });
  });

  describe('TIMEOUT_ENV_VARS', () => {
    it('has correct env var names', () => {
      expect(TIMEOUT_ENV_VARS.vote).toBe('NEXUS_VOTE_TIMEOUT_MS');
      expect(TIMEOUT_ENV_VARS.mcp).toBe('NEXUS_MCP_TIMEOUT_MS');
      expect(TIMEOUT_ENV_VARS.workflow).toBe('NEXUS_WORKFLOW_TIMEOUT_MS');
      expect(TIMEOUT_ENV_VARS.graph).toBe('NEXUS_GRAPH_TIMEOUT_MS');
      expect(TIMEOUT_ENV_VARS.expert).toBe('NEXUS_EXPERT_TIMEOUT_MS');
      expect(TIMEOUT_ENV_VARS.worker).toBe('NEXUS_WORKER_TIMEOUT_MS');
    });
  });

  describe('WORKER_TIMEOUTS', () => {
    it('has correct default values', () => {
      expect(WORKER_TIMEOUTS.defaultMs).toBe(60_000);
      expect(WORKER_TIMEOUTS.minMs).toBe(30_000);
      expect(WORKER_TIMEOUTS.maxMs).toBe(900_000);
    });
  });

  describe('resolveWorkerTimeout', () => {
    it('returns default when env var is not set', () => {
      expect(resolveWorkerTimeout()).toBe(WORKER_TIMEOUTS.defaultMs);
    });

    it('respects NEXUS_WORKER_TIMEOUT_MS override', () => {
      process.env['NEXUS_WORKER_TIMEOUT_MS'] = '120000';
      try {
        expect(resolveWorkerTimeout()).toBe(120_000);
      } finally {
        delete process.env.NEXUS_WORKER_TIMEOUT_MS;
      }
    });

    it('clamps to min/max bounds', () => {
      process.env['NEXUS_WORKER_TIMEOUT_MS'] = '1';
      try {
        expect(resolveWorkerTimeout()).toBe(WORKER_TIMEOUTS.minMs);
      } finally {
        delete process.env.NEXUS_WORKER_TIMEOUT_MS;
      }
    });
  });

  // ==========================================================================
  // Central operation-class timeout authority (#3734)
  // ==========================================================================

  describe('OPERATION_CLASSES taxonomy (#3734)', () => {
    it('defines the six runaway-guard classes with the approved guards', () => {
      expect(OPERATION_CLASSES.interactive.guardMs).toBe(60_000);
      expect(OPERATION_CLASSES['single-llm'].guardMs).toBe(300_000);
      expect(OPERATION_CLASSES['multi-llm-panel'].guardMs).toBe(900_000);
      expect(OPERATION_CLASSES.pipeline.guardMs).toBe(1_800_000);
      expect(OPERATION_CLASSES['network-fetch'].guardMs).toBe(120_000);
      expect(OPERATION_CLASSES['async-job-body'].guardMs).toBe(3_600_000);
    });

    it('defaults unclassified tools to single-llm (300s), not the punitive 60s', () => {
      expect(DEFAULT_OPERATION_CLASS).toBe('single-llm');
      expect(OPERATION_CLASSES[DEFAULT_OPERATION_CLASS].guardMs).toBe(300_000);
    });
  });

  describe('named central constants for non-MCP callers (#3736)', () => {
    it('derives each constant from the operation-class taxonomy (no local literals)', () => {
      expect(SINGLE_LLM_EVAL_TIMEOUT_MS).toBe(OPERATION_CLASSES['single-llm'].guardMs);
      expect(NETWORK_FETCH_TIMEOUT_MS).toBe(OPERATION_CLASSES['network-fetch'].guardMs);
      expect(SEARCH_TREE_MAX_TIME_MS).toBe(OPERATION_CLASSES['single-llm'].guardMs);
    });

    it('keeps every constant generous (>= its class minimum, non-punitive)', () => {
      // single-llm guards LLM round-trips: must comfortably exceed the old
      // punitive 30s/60s literals the sweep replaced.
      expect(SINGLE_LLM_EVAL_TIMEOUT_MS).toBeGreaterThanOrEqual(300_000);
      // network-fetch must exceed the old tight 10s/30s HTTP literals.
      expect(NETWORK_FETCH_TIMEOUT_MS).toBeGreaterThanOrEqual(120_000);
      expect(SEARCH_TREE_MAX_TIME_MS).toBeGreaterThanOrEqual(300_000);
    });
  });

  describe('TOOL_CLASS coverage (FORCE-CLASSIFY, #3734)', () => {
    // MANDATORY (vote condition): EVERY registered tool must be classified so
    // no tool silently rides the 300s default. This is a FAILING assertion, not
    // a warn — a new tool added to TOOL_MANIFEST without a TOOL_CLASS entry
    // turns this red.
    it('classifies every registered MCP tool', () => {
      const unclassified = TOOL_MANIFEST.filter(
        (t) => !(t in (TOOL_CLASS as Record<string, OperationClassName>))
      );
      expect(unclassified).toEqual([]);
    });

    it('classifies CPU-heavy local tools above interactive (60s) — they can exceed it', () => {
      expect((TOOL_CLASS as Record<string, OperationClassName>)['extract_symbols']).toBe(
        'single-llm'
      );
      expect((TOOL_CLASS as Record<string, OperationClassName>)['search_codebase']).toBe(
        'single-llm'
      );
    });

    it('every TOOL_CLASS value is a known operation class', () => {
      for (const cls of Object.values(TOOL_CLASS)) {
        expect(OPERATION_CLASSES).toHaveProperty(cls);
      }
    });
  });

  describe('generated MCP_TIMEOUTS.perTool byte-compat (#3734)', () => {
    // GOLDEN (vote condition): the additive generated view must not REGRESS any
    // of the 10 tools that previously carried an explicit perTool override —
    // every one resolves to a class guard >= its prior literal (proves the
    // additive step is a no-op / improvement for existing readers).
    const PRIOR_LITERALS: Record<string, number> = {
      orchestrate: 900_000,
      consensus_vote: 600_000,
      execute_expert: 900_000,
      run_workflow: 900_000,
      run_pipeline: 900_000,
      run_dev_pipeline: 900_000,
      pr_review: 900_000,
      supply_chain_tradeoff_panel: 900_000,
      execute_spec: 900_000,
      run: 900_000,
    };

    it('never shortens a previously-overridden tool budget', () => {
      for (const [tool, prior] of Object.entries(PRIOR_LITERALS)) {
        expect(MCP_TIMEOUTS.perTool[tool]).toBeGreaterThanOrEqual(prior);
      }
    });

    it('matches the documented class-derived values exactly', () => {
      // pipeline tools → 1.8M; multi-llm-panel tools → 900k.
      expect(MCP_TIMEOUTS.perTool['orchestrate']).toBe(1_800_000);
      expect(MCP_TIMEOUTS.perTool['run_pipeline']).toBe(1_800_000);
      expect(MCP_TIMEOUTS.perTool['run_dev_pipeline']).toBe(1_800_000);
      expect(MCP_TIMEOUTS.perTool['consensus_vote']).toBe(900_000);
      expect(MCP_TIMEOUTS.perTool['pr_review']).toBe(900_000);
    });
  });

  describe('class-guard resolution (#3734)', () => {
    const ENV_KEYS = [
      'NEXUS_TIMEOUT_MULTIPLIER',
      'NEXUS_TIMEOUT_CLASS_PIPELINE_MS',
      'NEXUS_TIMEOUT_CLASS_MULTI_LLM_PANEL_MS',
    ];
    beforeEach(() => {
      for (const k of ENV_KEYS) Reflect.deleteProperty(process.env, k);
    });
    afterEach(() => {
      for (const k of ENV_KEYS) Reflect.deleteProperty(process.env, k);
    });

    it('returns the base class guard with no env overrides', () => {
      expect(resolveClassGuardMs('multi-llm-panel')).toBe(900_000);
      expect(resolveToolClassGuardMs('consensus_vote')).toBe(900_000);
    });

    it('falls back to the default class for an unknown tool', () => {
      expect(resolveToolClassGuardMs('not_a_real_tool')).toBe(300_000);
    });

    it('scales every class guard by NEXUS_TIMEOUT_MULTIPLIER', () => {
      process.env['NEXUS_TIMEOUT_MULTIPLIER'] = '2';
      expect(resolveTimeoutMultiplier()).toBe(2);
      // multi-llm-panel 900k * 2 = 1.8M (under maxMs 3.6M).
      expect(resolveClassGuardMs('multi-llm-panel')).toBe(1_800_000);
    });

    it('clamps the multiplier to [0.25, 10]', () => {
      process.env['NEXUS_TIMEOUT_MULTIPLIER'] = '100';
      expect(resolveTimeoutMultiplier()).toBe(10);
      process.env['NEXUS_TIMEOUT_MULTIPLIER'] = '0.01';
      expect(resolveTimeoutMultiplier()).toBe(0.25);
    });

    it('re-clamps a scaled guard to MCP_TIMEOUTS.maxMs (3.6M)', () => {
      process.env['NEXUS_TIMEOUT_MULTIPLIER'] = '10';
      // pipeline 1.8M * 10 = 18M → clamped to maxMs 3.6M.
      expect(resolveClassGuardMs('pipeline')).toBe(MCP_TIMEOUTS.maxMs);
    });

    it('honors a per-class env override', () => {
      expect(classOverrideEnvVar('pipeline')).toBe('NEXUS_TIMEOUT_CLASS_PIPELINE_MS');
      process.env['NEXUS_TIMEOUT_CLASS_PIPELINE_MS'] = '600000';
      expect(resolveClassGuardMs('pipeline')).toBe(600_000);
    });

    it('applies the multiplier AFTER the per-class override', () => {
      process.env['NEXUS_TIMEOUT_CLASS_MULTI_LLM_PANEL_MS'] = '400000';
      process.env['NEXUS_TIMEOUT_MULTIPLIER'] = '2';
      expect(resolveClassGuardMs('multi-llm-panel')).toBe(800_000);
    });
  });
});

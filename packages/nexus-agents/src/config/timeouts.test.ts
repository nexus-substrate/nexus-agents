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
  resolveVoteTimeout,
  resolveEnvTimeout,
  validateTimeout,
} from './timeouts.js';

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
        standard: 120_000,
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
    it('has correct defaults', () => {
      expect(MCP_TIMEOUTS.defaultMs).toBe(60_000);
      expect(MCP_TIMEOUTS.maxMs).toBe(900_000);
    });

    it('has per-tool overrides for long-running tools', () => {
      expect(MCP_TIMEOUTS.perTool['orchestrate']).toBe(900_000);
      expect(MCP_TIMEOUTS.perTool['consensus_vote']).toBe(600_000);
      expect(MCP_TIMEOUTS.perTool['execute_expert']).toBe(900_000);
      expect(MCP_TIMEOUTS.perTool['run_workflow']).toBe(900_000);
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
      expect(EXPERT_TIMEOUTS.complexCategories).toHaveLength(4);
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

    it('returns standard timeout for research tasks', () => {
      // "Research ..." matches research category (not security_review) with best-match scoring
      expect(getExpertTaskTimeout('Research the vulnerability scanner landscape')).toBe(300_000);
    });

    it('returns standard timeout for code generation tasks', () => {
      expect(getExpertTaskTimeout('Generate unit tests for the API')).toBe(300_000);
    });

    it('returns standard timeout for documentation tasks', () => {
      expect(getExpertTaskTimeout('Write documentation for this module')).toBe(300_000);
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
});

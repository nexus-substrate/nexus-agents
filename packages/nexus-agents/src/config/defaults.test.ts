/**
 * nexus-agents/config/defaults - Unit Tests
 *
 * Tests for the centralized defaults configuration module.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULTS,
  TIMEOUT_PROFILES,
  getTimeoutProfile,
  getTimeoutForCli,
  getToolRateLimit,
  isTaskComplexity,
} from './defaults.js';

describe('DEFAULTS', () => {
  describe('structure', () => {
    it('should have all required top-level sections', () => {
      expect(DEFAULTS).toHaveProperty('TIMEOUT_DEFAULTS');
      expect(DEFAULTS).toHaveProperty('RATE_LIMIT_DEFAULTS');
      expect(DEFAULTS).toHaveProperty('TOOL_RATE_LIMITS');
      expect(DEFAULTS).toHaveProperty('RETRY_DEFAULTS');
      expect(DEFAULTS).toHaveProperty('WORKFLOW_RETRY_DEFAULTS');
      expect(DEFAULTS).toHaveProperty('CLI_RETRY_DEFAULTS');
      expect(DEFAULTS).toHaveProperty('TEST_RETRY_DEFAULTS');
      expect(DEFAULTS).toHaveProperty('BUFFER_DEFAULTS');
      // WORKER_DEFAULTS removed in #2977 (zero production consumers).
      expect(DEFAULTS).toHaveProperty('CIRCUIT_BREAKER_DEFAULTS');
      expect(DEFAULTS).toHaveProperty('CONTEXT_DEFAULTS');
      expect(DEFAULTS).toHaveProperty('PROVIDER_DEFAULTS');
      expect(DEFAULTS).toHaveProperty('SECURITY_DEFAULTS');
    });

    it('should have valid timeout values', () => {
      expect(DEFAULTS.TIMEOUT_DEFAULTS.cliMs).toBe(120_000);
      expect(DEFAULTS.TIMEOUT_DEFAULTS.apiMs).toBe(30_000);
      expect(DEFAULTS.TIMEOUT_DEFAULTS.apiMaxMs).toBe(300_000);
      expect(DEFAULTS.TIMEOUT_DEFAULTS.workflowMs).toBe(5 * 60_000);
      expect(DEFAULTS.TIMEOUT_DEFAULTS.mcpMs).toBe(30_000);
    });

    it('should have valid rate limit values', () => {
      expect(DEFAULTS.RATE_LIMIT_DEFAULTS.requestsPerMinute).toBe(60);
      expect(DEFAULTS.RATE_LIMIT_DEFAULTS.enabled).toBe(true);
      expect(DEFAULTS.RATE_LIMIT_DEFAULTS.capacity).toBe(100);
    });

    it('should have valid tool rate limit values', () => {
      expect(DEFAULTS.TOOL_RATE_LIMITS.orchestrate.capacity).toBe(10);
      expect(DEFAULTS.TOOL_RATE_LIMITS.delegate.capacity).toBe(20);
      expect(DEFAULTS.TOOL_RATE_LIMITS.workflow.capacity).toBe(5);
      expect(DEFAULTS.TOOL_RATE_LIMITS.expert.capacity).toBe(30);
    });

    it('should have valid retry values', () => {
      expect(DEFAULTS.RETRY_DEFAULTS.maxRetries).toBe(3);
      expect(DEFAULTS.RETRY_DEFAULTS.baseDelayMs).toBe(1_000);
      expect(DEFAULTS.RETRY_DEFAULTS.maxDelayMs).toBe(30_000);
      expect(DEFAULTS.RETRY_DEFAULTS.jitterFactor).toBe(0.1);
    });

    it('should have valid circuit breaker values', () => {
      expect(DEFAULTS.CIRCUIT_BREAKER_DEFAULTS.failureThreshold).toBe(5);
      expect(DEFAULTS.CIRCUIT_BREAKER_DEFAULTS.resetTimeoutMs).toBe(30_000);
      expect(DEFAULTS.CIRCUIT_BREAKER_DEFAULTS.halfOpenSuccessThreshold).toBe(2);
    });

    // worker-values test removed in #2977 along with WORKER_DEFAULTS.

    it('should have valid security values', () => {
      expect(DEFAULTS.SECURITY_DEFAULTS.maxSystemPromptLength).toBe(4_000);
      expect(DEFAULTS.SECURITY_DEFAULTS.policyDefaultMode).toBe('read-write');
      expect(DEFAULTS.SECURITY_DEFAULTS.sandboxMode).toBe('policy');
    });
  });
});

describe('TIMEOUT_PROFILES', () => {
  it('should have profiles for all supported CLIs', () => {
    expect(TIMEOUT_PROFILES).toHaveProperty('claude');
    expect(TIMEOUT_PROFILES).toHaveProperty('gemini');
    expect(TIMEOUT_PROFILES).toHaveProperty('codex');
    expect(TIMEOUT_PROFILES).toHaveProperty('default');
  });

  it('should have correct Claude profile values', () => {
    expect(TIMEOUT_PROFILES.claude.simple).toBe(30_000);
    expect(TIMEOUT_PROFILES.claude.standard).toBe(120_000);
    expect(TIMEOUT_PROFILES.claude.complex).toBe(600_000);
  });

  it('should have correct Gemini profile values', () => {
    expect(TIMEOUT_PROFILES.gemini.simple).toBe(30_000);
    expect(TIMEOUT_PROFILES.gemini.standard).toBe(180_000);
    expect(TIMEOUT_PROFILES.gemini.complex).toBe(600_000);
  });

  it('should have correct Codex profile values', () => {
    expect(TIMEOUT_PROFILES.codex.simple).toBe(10_000);
    expect(TIMEOUT_PROFILES.codex.standard).toBe(60_000);
    expect(TIMEOUT_PROFILES.codex.complex).toBe(300_000);
  });
});

// getTimeout removed in #4939 — its NEXUS_TIMEOUT_{CLI,API,WORKFLOW,MCP}
// overrides were asserted here and took effect, inside a getter nothing
// production called. env-schema.test.ts holds the tombstone assertion.
//
// getRetryConfig / getRateLimitConfig / getCircuitBreakerConfig removed in
// #5903 together with their twelve NEXUS_* variables. The tests here
// asserted the env overrides took effect — which they did, inside a getter
// nothing production called. Green tests over an unread code path.

describe('getTimeoutProfile', () => {
  it('should return profile for known CLI', () => {
    const profile = getTimeoutProfile('claude');
    expect(profile.simple).toBe(30_000);
    expect(profile.standard).toBe(120_000);
    expect(profile.complex).toBe(600_000);
  });

  it('should return default profile for unknown CLI', () => {
    const profile = getTimeoutProfile('unknown-cli');
    expect(profile).toEqual(TIMEOUT_PROFILES['default']);
  });
});

describe('getTimeoutForCli', () => {
  it('should return correct timeout for Claude simple task', () => {
    expect(getTimeoutForCli('claude', 'simple')).toBe(30_000);
  });

  it('should return correct timeout for Claude standard task', () => {
    expect(getTimeoutForCli('claude', 'standard')).toBe(120_000);
  });

  it('should return correct timeout for Claude complex task', () => {
    expect(getTimeoutForCli('claude', 'complex')).toBe(600_000);
  });

  it('should return correct timeout for Gemini complex task', () => {
    expect(getTimeoutForCli('gemini', 'complex')).toBe(600_000);
  });

  it('should use default profile for unknown CLI', () => {
    expect(getTimeoutForCli('unknown', 'standard')).toBe(120_000);
  });
});

describe('getToolRateLimit', () => {
  it('should return rate limit for orchestrate', () => {
    const limit = getToolRateLimit('orchestrate');
    expect(limit.capacity).toBe(10);
    expect(limit.refillRate).toBe(10);
    expect(limit.refillIntervalMs).toBe(60_000);
  });

  it('should return rate limit for delegate', () => {
    const limit = getToolRateLimit('delegate');
    expect(limit.capacity).toBe(20);
    expect(limit.refillRate).toBe(20);
  });

  it('should return rate limit for workflow', () => {
    const limit = getToolRateLimit('workflow');
    expect(limit.capacity).toBe(5);
    expect(limit.refillRate).toBe(5);
  });

  it('should return rate limit for expert', () => {
    const limit = getToolRateLimit('expert');
    expect(limit.capacity).toBe(30);
    expect(limit.refillRate).toBe(30);
  });
});

describe('isTaskComplexity', () => {
  it('should return true for valid complexity levels', () => {
    expect(isTaskComplexity('simple')).toBe(true);
    expect(isTaskComplexity('standard')).toBe(true);
    expect(isTaskComplexity('complex')).toBe(true);
  });

  it('should return false for invalid values', () => {
    expect(isTaskComplexity('easy')).toBe(false);
    expect(isTaskComplexity('hard')).toBe(false);
    expect(isTaskComplexity('')).toBe(false);
    expect(isTaskComplexity(null)).toBe(false);
    expect(isTaskComplexity(undefined)).toBe(false);
    expect(isTaskComplexity(123)).toBe(false);
  });
});

// getEnvVarDocumentation removed in #4939: after #2977 and #5903 its only
// remaining rows were the four unread NEXUS_TIMEOUT_* names.

describe('backward compatibility', () => {
  it('should match existing DEFAULT_RETRY_CONFIG values from adapters/retry.ts', () => {
    // These values should match adapters/retry.ts DEFAULT_RETRY_CONFIG
    expect(DEFAULTS.RETRY_DEFAULTS.maxRetries).toBe(3);
    expect(DEFAULTS.RETRY_DEFAULTS.baseDelayMs).toBe(1_000);
    expect(DEFAULTS.RETRY_DEFAULTS.maxDelayMs).toBe(30_000);
    expect(DEFAULTS.RETRY_DEFAULTS.jitterFactor).toBe(0.1);
  });

  it('should match existing DEFAULT_CIRCUIT_BREAKER_CONFIG values', () => {
    // These values should match cli-adapters/circuit-breaker-types.ts
    expect(DEFAULTS.CIRCUIT_BREAKER_DEFAULTS.failureThreshold).toBe(5);
    expect(DEFAULTS.CIRCUIT_BREAKER_DEFAULTS.resetTimeoutMs).toBe(30_000);
    expect(DEFAULTS.CIRCUIT_BREAKER_DEFAULTS.halfOpenSuccessThreshold).toBe(2);
    expect(DEFAULTS.CIRCUIT_BREAKER_DEFAULTS.countTimeoutsAsFailures).toBe(true);
    expect(DEFAULTS.CIRCUIT_BREAKER_DEFAULTS.countAuthFailuresAsFailures).toBe(false);
    expect(DEFAULTS.CIRCUIT_BREAKER_DEFAULTS.halfOpenMaxRequests).toBe(3);
  });

  it('should match existing DEFAULT_TOOL_RATE_LIMITS values', () => {
    // These values should match config/schemas.ts DEFAULT_TOOL_RATE_LIMITS
    expect(DEFAULTS.TOOL_RATE_LIMITS.orchestrate.capacity).toBe(10);
    expect(DEFAULTS.TOOL_RATE_LIMITS.delegate.capacity).toBe(20);
    expect(DEFAULTS.TOOL_RATE_LIMITS.workflow.capacity).toBe(5);
    expect(DEFAULTS.TOOL_RATE_LIMITS.expert.capacity).toBe(30);
  });

  it('should match canonical CLI_TIMEOUTS values', () => {
    // These values now come from config/timeouts.ts (canonical source)
    expect(TIMEOUT_PROFILES.claude.simple).toBe(30_000);
    expect(TIMEOUT_PROFILES.claude.standard).toBe(120_000);
    expect(TIMEOUT_PROFILES.claude.complex).toBe(600_000);
    expect(TIMEOUT_PROFILES.gemini.simple).toBe(30_000);
    expect(TIMEOUT_PROFILES.gemini.standard).toBe(180_000);
    expect(TIMEOUT_PROFILES.gemini.complex).toBe(600_000);
    expect(TIMEOUT_PROFILES.codex.simple).toBe(10_000);
    expect(TIMEOUT_PROFILES.codex.standard).toBe(60_000);
    expect(TIMEOUT_PROFILES.codex.complex).toBe(300_000);
  });

  it('should match existing DEFAULT_TEST_RUNNER_CONFIG values', () => {
    // These values should match testing/framework/types.ts.
    // Note: testParallelism was on WORKER_DEFAULTS, removed in #2977.
    expect(DEFAULTS.TIMEOUT_DEFAULTS.testGlobalMs).toBe(600_000);
    expect(DEFAULTS.TEST_RETRY_DEFAULTS.maxRetries).toBe(2);
    expect(DEFAULTS.TEST_RETRY_DEFAULTS.retryFailedTasks).toBe(true);
  });

  it('should match existing WorkflowConfigSchema defaults', () => {
    // These values should match config/schemas.ts WorkflowConfigSchema.
    // Note: workflowMaxParallel was on WORKER_DEFAULTS, removed in #2977.
    expect(DEFAULTS.TIMEOUT_DEFAULTS.workflowMs).toBe(300_000);
  });

  it('should match existing ProviderConfigSchema defaults', () => {
    // These values should match config/schemas.ts ProviderConfigSchema
    expect(DEFAULTS.PROVIDER_DEFAULTS.timeout).toBe(30_000);
    expect(DEFAULTS.PROVIDER_DEFAULTS.maxRetries).toBe(3);
  });

  // "evaluation harness defaults" test removed in #2977 (was the only
  // assertion in the suite and it referenced WORKER_DEFAULTS.evaluationMaxWorkers).
});

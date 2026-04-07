/**
 * nexus-agents/config/defaults - Unit Tests
 *
 * Tests for the centralized defaults configuration module.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DEFAULTS,
  TIMEOUT_PROFILES,
  getTimeout,
  getRetryConfig,
  getRateLimitConfig,
  getWorkerConfig,
  getCircuitBreakerConfig,
  getTimeoutProfile,
  getTimeoutForCli,
  getToolRateLimit,
  isTaskComplexity,
  getEnvVarDocumentation,
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
      expect(DEFAULTS).toHaveProperty('WORKER_DEFAULTS');
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

    it('should have valid worker values', () => {
      expect(DEFAULTS.WORKER_DEFAULTS.maxWorkers).toBe(8);
      expect(DEFAULTS.WORKER_DEFAULTS.workflowMaxParallel).toBe(5);
      expect(DEFAULTS.WORKER_DEFAULTS.testParallelism).toBe(3);
      expect(DEFAULTS.WORKER_DEFAULTS.evaluationMaxWorkers).toBe(8);
    });

    it('should have valid security values', () => {
      expect(DEFAULTS.SECURITY_DEFAULTS.maxSystemPromptLength).toBe(4_000);
      expect(DEFAULTS.SECURITY_DEFAULTS.policyDefaultMode).toBe('read-only');
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

describe('getTimeout', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return default value for valid key', () => {
    const timeout = getTimeout('cliMs');
    expect(timeout).toBe(120_000);
  });

  it('should return API timeout default', () => {
    const timeout = getTimeout('apiMs');
    expect(timeout).toBe(30_000);
  });

  it('should override with environment variable', () => {
    process.env['NEXUS_TIMEOUT_CLI'] = '90000';
    const timeout = getTimeout('cliMs');
    expect(timeout).toBe(90_000);
  });

  it('should ignore invalid environment variable', () => {
    process.env['NEXUS_TIMEOUT_CLI'] = 'invalid';
    const timeout = getTimeout('cliMs');
    expect(timeout).toBe(120_000); // Falls back to default
  });

  it('should ignore negative environment variable', () => {
    process.env['NEXUS_TIMEOUT_CLI'] = '-1000';
    const timeout = getTimeout('cliMs');
    expect(timeout).toBe(120_000); // Falls back to default
  });
});

describe('getRetryConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return default retry config', () => {
    const config = getRetryConfig();
    expect(config.maxRetries).toBe(3);
    expect(config.baseDelayMs).toBe(1_000);
    expect(config.maxDelayMs).toBe(30_000);
    expect(config.jitterFactor).toBe(0.1);
  });

  it('should override maxRetries with environment variable', () => {
    process.env['NEXUS_RETRY_MAX_RETRIES'] = '5';
    const config = getRetryConfig();
    expect(config.maxRetries).toBe(5);
  });

  it('should override baseDelayMs with environment variable', () => {
    process.env['NEXUS_RETRY_BASE_DELAY'] = '2000';
    const config = getRetryConfig();
    expect(config.baseDelayMs).toBe(2_000);
  });
});

describe('getRateLimitConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return default rate limit config', () => {
    const config = getRateLimitConfig();
    expect(config.requestsPerMinute).toBe(60);
    expect(config.enabled).toBe(true);
    expect(config.capacity).toBe(100);
  });

  it('should disable rate limiting with environment variable', () => {
    process.env['NEXUS_RATE_LIMIT_ENABLED'] = 'false';
    const config = getRateLimitConfig();
    expect(config.enabled).toBe(false);
  });

  it('should override requestsPerMinute with environment variable', () => {
    process.env['NEXUS_RATE_LIMIT_RPM'] = '120';
    const config = getRateLimitConfig();
    expect(config.requestsPerMinute).toBe(120);
  });
});

describe('getWorkerConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return default worker config', () => {
    const config = getWorkerConfig();
    expect(config.maxWorkers).toBe(8);
    expect(config.poolSize).toBe(4);
    expect(config.workflowMaxParallel).toBe(5);
    expect(config.testParallelism).toBe(3);
  });

  it('should override maxWorkers with environment variable', () => {
    process.env['NEXUS_WORKERS_MAX'] = '16';
    const config = getWorkerConfig();
    expect(config.maxWorkers).toBe(16);
  });

  it('should override workflowMaxParallel with environment variable', () => {
    process.env['NEXUS_WORKFLOW_MAX_PARALLEL'] = '10';
    const config = getWorkerConfig();
    expect(config.workflowMaxParallel).toBe(10);
  });
});

describe('getCircuitBreakerConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return default circuit breaker config', () => {
    const config = getCircuitBreakerConfig();
    expect(config.failureThreshold).toBe(5);
    expect(config.resetTimeoutMs).toBe(30_000);
    expect(config.halfOpenSuccessThreshold).toBe(2);
    expect(config.countTimeoutsAsFailures).toBe(true);
    expect(config.countAuthFailuresAsFailures).toBe(false);
  });

  it('should override failureThreshold with environment variable', () => {
    process.env['NEXUS_CIRCUIT_BREAKER_THRESHOLD'] = '10';
    const config = getCircuitBreakerConfig();
    expect(config.failureThreshold).toBe(10);
  });
});

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

describe('getEnvVarDocumentation', () => {
  it('should return markdown documentation', () => {
    const docs = getEnvVarDocumentation();
    expect(docs).toContain('# Environment Variable Overrides');
    expect(docs).toContain('NEXUS_TIMEOUT_CLI');
    expect(docs).toContain('NEXUS_RATE_LIMIT_RPM');
    expect(docs).toContain('NEXUS_RETRY_MAX_RETRIES');
    expect(docs).toContain('NEXUS_WORKERS_MAX');
    expect(docs).toContain('NEXUS_CIRCUIT_BREAKER_THRESHOLD');
  });

  it('should include actual default values', () => {
    const docs = getEnvVarDocumentation();
    expect(docs).toContain('120000'); // CLI timeout
    expect(docs).toContain('30000'); // API timeout
    expect(docs).toContain('60'); // requests per minute
    expect(docs).toContain('5'); // workflow maxParallel
  });
});

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
    // These values should match testing/framework/types.ts
    expect(DEFAULTS.WORKER_DEFAULTS.testParallelism).toBe(3);
    expect(DEFAULTS.TIMEOUT_DEFAULTS.testGlobalMs).toBe(600_000);
    expect(DEFAULTS.TEST_RETRY_DEFAULTS.maxRetries).toBe(2);
    expect(DEFAULTS.TEST_RETRY_DEFAULTS.retryFailedTasks).toBe(true);
  });

  it('should match existing WorkflowConfigSchema defaults', () => {
    // These values should match config/schemas.ts WorkflowConfigSchema
    expect(DEFAULTS.WORKER_DEFAULTS.workflowMaxParallel).toBe(5);
    expect(DEFAULTS.TIMEOUT_DEFAULTS.workflowMs).toBe(300_000);
  });

  it('should match existing ProviderConfigSchema defaults', () => {
    // These values should match config/schemas.ts ProviderConfigSchema
    expect(DEFAULTS.PROVIDER_DEFAULTS.timeout).toBe(30_000);
    expect(DEFAULTS.PROVIDER_DEFAULTS.maxRetries).toBe(3);
  });

  it('should match existing evaluation harness defaults', () => {
    // These values should match swe-bench/evaluation-harness-types.ts
    expect(DEFAULTS.WORKER_DEFAULTS.evaluationMaxWorkers).toBe(8);
  });
});

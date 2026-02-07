/**
 * nexus-agents/config - Security Configuration Schemas Tests
 */

import { describe, it, expect } from 'vitest';
import {
  PolicyConfigSchema,
  SandboxConfigSchema,
  TimeoutConfigSchema,
  ToolRateLimitSchema,
  SecurityConfigSchema,
  DEFAULT_TOOL_RATE_LIMITS,
  type PolicyConfig,
  type SandboxConfig,
  type TimeoutConfig,
  type ToolRateLimit,
  type SecurityConfig,
  type AuthConfig,
  type ToolCategory,
} from './schemas-security.js';

describe('PolicyConfigSchema', () => {
  it('parses valid policy config with defaults', () => {
    const result = PolicyConfigSchema.parse({});
    expect(result).toEqual({
      defaultMode: 'read-only',
      policyMode: 'enforce',
    });
  });

  it('parses valid policy config with explicit values', () => {
    const result = PolicyConfigSchema.parse({
      defaultMode: 'read-write',
      policyMode: 'warn',
    });
    expect(result).toEqual({
      defaultMode: 'read-write',
      policyMode: 'warn',
    });
  });

  it('rejects invalid defaultMode', () => {
    expect(() => PolicyConfigSchema.parse({ defaultMode: 'invalid' })).toThrow();
  });

  it('rejects invalid policyMode', () => {
    expect(() => PolicyConfigSchema.parse({ policyMode: 'invalid' })).toThrow();
  });
});

describe('SandboxConfigSchema', () => {
  it('parses valid sandbox config with defaults', () => {
    const result = SandboxConfigSchema.parse({});
    expect(result).toEqual({
      mode: 'policy',
      fallbackToPolicy: true,
      networkEnabled: false,
    });
  });

  it('parses valid sandbox config with all fields', () => {
    const result = SandboxConfigSchema.parse({
      mode: 'container',
      fallbackToPolicy: false,
      dockerImage: 'node:22-alpine',
      networkEnabled: true,
    });
    expect(result).toEqual({
      mode: 'container',
      fallbackToPolicy: false,
      dockerImage: 'node:22-alpine',
      networkEnabled: true,
    });
  });

  it('allows none mode', () => {
    const result = SandboxConfigSchema.parse({ mode: 'none' });
    expect(result.mode).toBe('none');
  });

  it('rejects invalid mode', () => {
    expect(() => SandboxConfigSchema.parse({ mode: 'invalid' })).toThrow();
  });

  it('allows optional dockerImage', () => {
    const result = SandboxConfigSchema.parse({});
    expect(result.dockerImage).toBeUndefined();
  });
});

describe('TimeoutConfigSchema', () => {
  it('parses valid timeout config with defaults', () => {
    const result = TimeoutConfigSchema.parse({});
    expect(result).toEqual({
      defaultTimeoutMs: 30000,
      maxTimeoutMs: 300000,
      enableLogging: true,
      uriValidation: true,
    });
  });

  it('parses valid timeout config with all fields', () => {
    const result = TimeoutConfigSchema.parse({
      defaultTimeoutMs: 10000,
      maxTimeoutMs: 60000,
      enableLogging: false,
      uriValidation: false,
      perToolTimeout: { orchestrate: 30000, delegate: 15000 },
    });
    expect(result).toEqual({
      defaultTimeoutMs: 10000,
      maxTimeoutMs: 60000,
      enableLogging: false,
      uriValidation: false,
      perToolTimeout: { orchestrate: 30000, delegate: 15000 },
    });
  });

  it('rejects zero timeout', () => {
    expect(() => TimeoutConfigSchema.parse({ defaultTimeoutMs: 0 })).toThrow();
  });

  it('rejects negative timeout', () => {
    expect(() => TimeoutConfigSchema.parse({ defaultTimeoutMs: -1000 })).toThrow();
  });

  it('enforces max timeout for perToolTimeout', () => {
    expect(() =>
      TimeoutConfigSchema.parse({
        perToolTimeout: { orchestrate: 700000 },
      })
    ).toThrow();
  });

  it('allows max timeout at boundary', () => {
    const result = TimeoutConfigSchema.parse({
      perToolTimeout: { orchestrate: 600000 },
    });
    expect(result.perToolTimeout?.orchestrate).toBe(600000);
  });
});

describe('ToolRateLimitSchema', () => {
  it('parses valid rate limit with defaults', () => {
    const result = ToolRateLimitSchema.parse({});
    expect(result).toEqual({
      capacity: 10,
      refillRate: 10,
      refillIntervalMs: 60000,
    });
  });

  it('parses valid rate limit with explicit values', () => {
    const result = ToolRateLimitSchema.parse({
      capacity: 100,
      refillRate: 50,
      refillIntervalMs: 30000,
    });
    expect(result).toEqual({
      capacity: 100,
      refillRate: 50,
      refillIntervalMs: 30000,
    });
  });

  it('rejects zero capacity', () => {
    expect(() => ToolRateLimitSchema.parse({ capacity: 0 })).toThrow();
  });

  it('rejects negative refillRate', () => {
    expect(() => ToolRateLimitSchema.parse({ refillRate: -5 })).toThrow();
  });

  it('rejects zero refillIntervalMs', () => {
    expect(() => ToolRateLimitSchema.parse({ refillIntervalMs: 0 })).toThrow();
  });
});

describe('DEFAULT_TOOL_RATE_LIMITS', () => {
  it('contains all expected tool categories', () => {
    expect(DEFAULT_TOOL_RATE_LIMITS).toHaveProperty('orchestrate');
    expect(DEFAULT_TOOL_RATE_LIMITS).toHaveProperty('delegate');
    expect(DEFAULT_TOOL_RATE_LIMITS).toHaveProperty('workflow');
    expect(DEFAULT_TOOL_RATE_LIMITS).toHaveProperty('expert');
  });

  it('has valid orchestrate rate limit', () => {
    expect(DEFAULT_TOOL_RATE_LIMITS.orchestrate).toEqual({
      capacity: 10,
      refillRate: 10,
      refillIntervalMs: 60000,
    });
  });

  it('has valid delegate rate limit', () => {
    expect(DEFAULT_TOOL_RATE_LIMITS.delegate).toEqual({
      capacity: 20,
      refillRate: 20,
      refillIntervalMs: 60000,
    });
  });

  it('validates all entries against schema', () => {
    Object.values(DEFAULT_TOOL_RATE_LIMITS).forEach((limit) => {
      expect(() => ToolRateLimitSchema.parse(limit)).not.toThrow();
    });
  });
});

describe('SecurityConfigSchema', () => {
  it('parses valid security config with defaults', () => {
    const result = SecurityConfigSchema.parse({});
    expect(result).toEqual({
      allowedPaths: ['./'],
      blockedPatterns: [],
      rateLimit: {
        enabled: true,
        requestsPerMinute: 60,
      },
    });
  });

  it('parses complete security config', () => {
    const result = SecurityConfigSchema.parse({
      allowedPaths: ['./', '/tmp'],
      blockedPatterns: ['*.secret', '*.key'],
      rateLimit: {
        enabled: true,
        requestsPerMinute: 120,
        perTool: {
          orchestrate: { capacity: 5, refillRate: 5, refillIntervalMs: 60000 },
        },
      },
      secretsFile: '/path/to/secrets.json',
      policy: { defaultMode: 'read-write', policyMode: 'warn' },
      sandbox: { mode: 'container', fallbackToPolicy: true },
      timeout: { defaultTimeoutMs: 15000, maxTimeoutMs: 120000 },
      toolAllowlist: ['orchestrate', 'delegate'],
      audit: {
        enabled: true,
        logDir: '/var/log/nexus',
        minSeverity: 'warning',
        enableHashChain: true,
        maxFileSizeBytes: 5242880,
        maxFiles: 20,
      },
      auth: {
        enabled: true,
        method: 'oauth2',
        tokenHeader: 'X-Auth-Token',
        tokenFile: '/path/to/token',
      },
    });

    expect(result.allowedPaths).toEqual(['./', '/tmp']);
    expect(result.blockedPatterns).toEqual(['*.secret', '*.key']);
    expect(result.rateLimit.requestsPerMinute).toBe(120);
    expect(result.secretsFile).toBe('/path/to/secrets.json');
    expect(result.policy?.defaultMode).toBe('read-write');
    expect(result.sandbox?.mode).toBe('container');
    expect(result.timeout?.defaultTimeoutMs).toBe(15000);
    expect(result.toolAllowlist).toEqual(['orchestrate', 'delegate']);
    expect(result.audit?.enabled).toBe(true);
    expect(result.auth?.method).toBe('oauth2');
  });

  it('allows empty allowedPaths array', () => {
    const result = SecurityConfigSchema.parse({ allowedPaths: [] });
    expect(result.allowedPaths).toEqual([]);
  });

  it('rejects negative requestsPerMinute', () => {
    expect(() =>
      SecurityConfigSchema.parse({
        rateLimit: { requestsPerMinute: -10 },
      })
    ).toThrow();
  });

  it('rejects zero requestsPerMinute', () => {
    expect(() =>
      SecurityConfigSchema.parse({
        rateLimit: { requestsPerMinute: 0 },
      })
    ).toThrow();
  });

  it('parses audit config with defaults', () => {
    const result = SecurityConfigSchema.parse({
      audit: {},
    });
    expect(result.audit).toEqual({
      enabled: false,
      minSeverity: 'info',
      enableHashChain: false,
      maxFileSizeBytes: 10485760,
      maxFiles: 10,
    });
  });

  it('validates audit minSeverity enum', () => {
    expect(() =>
      SecurityConfigSchema.parse({
        audit: { minSeverity: 'invalid' },
      })
    ).toThrow();
  });

  it('rejects zero maxFileSizeBytes', () => {
    expect(() =>
      SecurityConfigSchema.parse({
        audit: { maxFileSizeBytes: 0 },
      })
    ).toThrow();
  });

  it('rejects negative maxFiles', () => {
    expect(() =>
      SecurityConfigSchema.parse({
        audit: { maxFiles: -5 },
      })
    ).toThrow();
  });

  it('parses auth config with defaults', () => {
    const result = SecurityConfigSchema.parse({
      auth: {},
    });
    expect(result.auth).toEqual({
      enabled: true,
      method: 'token',
      tokenHeader: 'Authorization',
    });
  });

  it('validates auth method enum', () => {
    expect(() =>
      SecurityConfigSchema.parse({
        auth: { method: 'basic' },
      })
    ).toThrow();
  });
});

describe('Type exports', () => {
  it('PolicyConfig type matches schema', () => {
    const config: PolicyConfig = {
      defaultMode: 'read-only',
      policyMode: 'enforce',
    };
    expect(() => PolicyConfigSchema.parse(config)).not.toThrow();
  });

  it('SandboxConfig type matches schema', () => {
    const config: SandboxConfig = {
      mode: 'policy',
      fallbackToPolicy: true,
      networkEnabled: false,
    };
    expect(() => SandboxConfigSchema.parse(config)).not.toThrow();
  });

  it('TimeoutConfig type matches schema', () => {
    const config: TimeoutConfig = {
      defaultTimeoutMs: 30000,
      maxTimeoutMs: 300000,
      enableLogging: true,
      uriValidation: true,
    };
    expect(() => TimeoutConfigSchema.parse(config)).not.toThrow();
  });

  it('ToolRateLimit type matches schema', () => {
    const config: ToolRateLimit = {
      capacity: 10,
      refillRate: 10,
      refillIntervalMs: 60000,
    };
    expect(() => ToolRateLimitSchema.parse(config)).not.toThrow();
  });

  it('SecurityConfig type matches schema', () => {
    const config: SecurityConfig = {
      allowedPaths: ['./'],
      blockedPatterns: [],
      rateLimit: {
        enabled: true,
        requestsPerMinute: 60,
      },
    };
    expect(() => SecurityConfigSchema.parse(config)).not.toThrow();
  });

  it('AuthConfig type is extractable', () => {
    const config: AuthConfig = {
      enabled: true,
      method: 'token',
      tokenHeader: 'Authorization',
    };
    expect(config.enabled).toBe(true);
  });

  it('ToolCategory type includes all keys', () => {
    const categories: ToolCategory[] = ['orchestrate', 'delegate', 'workflow', 'expert'];
    categories.forEach((category) => {
      expect(DEFAULT_TOOL_RATE_LIMITS[category]).toBeDefined();
    });
  });
});

describe('Nested schema validation', () => {
  it('validates nested policy in security config', () => {
    const result = SecurityConfigSchema.parse({
      policy: { defaultMode: 'read-only' },
    });
    expect(result.policy?.policyMode).toBe('enforce');
  });

  it('validates nested sandbox in security config', () => {
    const result = SecurityConfigSchema.parse({
      sandbox: { mode: 'none' },
    });
    expect(result.sandbox?.fallbackToPolicy).toBe(true);
  });

  it('validates nested timeout in security config', () => {
    const result = SecurityConfigSchema.parse({
      timeout: { defaultTimeoutMs: 5000 },
    });
    expect(result.timeout?.maxTimeoutMs).toBe(300000);
  });

  it('validates nested perTool rate limits', () => {
    const result = SecurityConfigSchema.parse({
      rateLimit: {
        perTool: {
          orchestrate: { capacity: 15, refillRate: 10, refillIntervalMs: 30000 },
        },
      },
    });
    expect(result.rateLimit.perTool?.orchestrate!.capacity).toBe(15);
  });
});

describe('Boundary value tests', () => {
  it('accepts minimum valid timeout values', () => {
    const result = TimeoutConfigSchema.parse({
      defaultTimeoutMs: 1,
      maxTimeoutMs: 1,
    });
    expect(result.defaultTimeoutMs).toBe(1);
    expect(result.maxTimeoutMs).toBe(1);
  });

  it('accepts very large valid timeout values', () => {
    const result = TimeoutConfigSchema.parse({
      defaultTimeoutMs: 999999,
      maxTimeoutMs: 999999,
    });
    expect(result.defaultTimeoutMs).toBe(999999);
  });

  it('accepts minimum valid rate limit values', () => {
    const result = ToolRateLimitSchema.parse({
      capacity: 1,
      refillRate: 1,
      refillIntervalMs: 1,
    });
    expect(result.capacity).toBe(1);
  });

  it('accepts large rate limit values', () => {
    const result = ToolRateLimitSchema.parse({
      capacity: 1000000,
      refillRate: 1000000,
      refillIntervalMs: 3600000,
    });
    expect(result.capacity).toBe(1000000);
  });

  it('accepts minimum valid audit file size', () => {
    const result = SecurityConfigSchema.parse({
      audit: { maxFileSizeBytes: 1 },
    });
    expect(result.audit?.maxFileSizeBytes).toBe(1);
  });

  it('accepts minimum valid audit max files', () => {
    const result = SecurityConfigSchema.parse({
      audit: { maxFiles: 1 },
    });
    expect(result.audit?.maxFiles).toBe(1);
  });
});

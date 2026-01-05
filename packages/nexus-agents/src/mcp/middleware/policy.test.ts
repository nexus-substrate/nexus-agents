/**
 * nexus-agents/mcp - Policy Firewall Tests
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { ILogger } from '../../core/index.js';
import {
  PolicyFirewall,
  PolicyError,
  PolicyConfigSchema,
  denyMutationsWithoutModeRule,
  safePathsRule,
  createDefaultPolicyFirewall,
  evaluatePolicy,
  createPolicyContext,
  type PolicyRule,
  type PolicyContext,
  type PolicyDecision,
  type PolicyMode,
} from './policy.js';

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Mock logger for testing.
 */
interface MockLogger extends ILogger {
  debug: Mock;
  info: Mock;
  warn: Mock;
  error: Mock;
  child: Mock;
  setLevel: Mock;
}

function createMockLogger(): MockLogger {
  const mock: MockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
  mock.child.mockReturnThis();
  return mock;
}

/**
 * Creates a custom policy rule for testing.
 */
function createTestRule(name: string, checkFn: (ctx: PolicyContext) => PolicyDecision): PolicyRule {
  return {
    name,
    description: `Test rule: ${name}`,
    check: checkFn,
  };
}

/**
 * Creates a rule that always allows.
 */
function createAllowRule(name = 'allow-all'): PolicyRule {
  return createTestRule(name, () => ({
    allowed: true,
    reason: 'Test rule allows',
  }));
}

/**
 * Creates a rule that always denies.
 */
function createDenyRule(name = 'deny-all', reason = 'Test rule denies'): PolicyRule {
  return createTestRule(name, () => ({
    allowed: false,
    reason,
  }));
}

// =============================================================================
// PolicyConfigSchema Tests
// =============================================================================

describe('PolicyConfigSchema', () => {
  it('should validate valid config with all fields', () => {
    const config = {
      defaultMode: 'read-write',
      policyMode: 'warn',
    };

    const result = PolicyConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaultMode).toBe('read-write');
      expect(result.data.policyMode).toBe('warn');
    }
  });

  it('should apply defaults when fields are missing', () => {
    const config = {};

    const result = PolicyConfigSchema.safeParse(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaultMode).toBe('read-only');
      expect(result.data.policyMode).toBe('enforce');
    }
  });

  it('should reject invalid defaultMode', () => {
    const config = {
      defaultMode: 'invalid-mode',
    };

    const result = PolicyConfigSchema.safeParse(config);

    expect(result.success).toBe(false);
  });

  it('should reject invalid policyMode', () => {
    const config = {
      policyMode: 'invalid-mode',
    };

    const result = PolicyConfigSchema.safeParse(config);

    expect(result.success).toBe(false);
  });
});

// =============================================================================
// PolicyFirewall Tests
// =============================================================================

describe('PolicyFirewall', () => {
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  describe('constructor', () => {
    it('should create firewall with default config', () => {
      const firewall = new PolicyFirewall();

      expect(firewall.getMode()).toBe('enforce');
      expect(firewall.getRules()).toHaveLength(0);
    });

    it('should create firewall with custom mode', () => {
      const firewall = new PolicyFirewall({ mode: 'warn' });

      expect(firewall.getMode()).toBe('warn');
    });

    it('should create firewall with initial rules', () => {
      const rules = [createAllowRule('rule1'), createAllowRule('rule2')];
      const firewall = new PolicyFirewall({ rules });

      expect(firewall.getRules()).toHaveLength(2);
    });

    it('should log initialization', () => {
      const firewall = new PolicyFirewall({ logger: mockLogger });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Policy firewall initialized',
        expect.objectContaining({ mode: 'enforce', ruleCount: 0 })
      );

      // Use firewall to avoid unused variable warning
      expect(firewall.getMode()).toBe('enforce');
    });
  });

  describe('addRule', () => {
    it('should add a new rule', () => {
      const firewall = new PolicyFirewall();
      const rule = createAllowRule();

      firewall.addRule(rule);

      expect(firewall.getRules()).toHaveLength(1);
      expect(firewall.getRules()[0]).toBe(rule);
    });

    it('should replace existing rule with same name', () => {
      const firewall = new PolicyFirewall({ logger: mockLogger });
      const rule1 = createAllowRule('test-rule');
      const rule2 = createDenyRule('test-rule', 'Replaced rule');

      firewall.addRule(rule1);
      firewall.addRule(rule2);

      expect(firewall.getRules()).toHaveLength(1);
      expect(firewall.getRules()[0]).toBe(rule2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Replacing existing policy rule',
        expect.objectContaining({ ruleName: 'test-rule' })
      );
    });
  });

  describe('removeRule', () => {
    it('should remove existing rule', () => {
      const firewall = new PolicyFirewall();
      const rule = createAllowRule('test-rule');
      firewall.addRule(rule);

      const removed = firewall.removeRule('test-rule');

      expect(removed).toBe(true);
      expect(firewall.getRules()).toHaveLength(0);
    });

    it('should return false when rule not found', () => {
      const firewall = new PolicyFirewall();

      const removed = firewall.removeRule('nonexistent');

      expect(removed).toBe(false);
    });
  });

  describe('evaluate', () => {
    it('should allow when no rules configured', () => {
      const firewall = new PolicyFirewall();
      const ctx = createPolicyContext('test_tool', {});

      const decision = firewall.evaluate(ctx);

      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe('No policy rules configured');
    });

    it('should allow when all rules pass', () => {
      const firewall = new PolicyFirewall();
      firewall.addRule(createAllowRule('rule1'));
      firewall.addRule(createAllowRule('rule2'));
      const ctx = createPolicyContext('test_tool', {});

      const decision = firewall.evaluate(ctx);

      expect(decision.allowed).toBe(true);
      expect(decision.reason).toBe('All policy rules passed');
    });

    it('should deny when any rule denies', () => {
      const firewall = new PolicyFirewall();
      firewall.addRule(createAllowRule('rule1'));
      firewall.addRule(createDenyRule('rule2', 'Rule 2 denies'));
      firewall.addRule(createAllowRule('rule3'));
      const ctx = createPolicyContext('test_tool', {});

      const decision = firewall.evaluate(ctx);

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('Rule 2 denies');
      expect(decision.ruleName).toBe('rule2');
    });

    it('should stop at first denial', () => {
      const checkSpy1 = vi.fn().mockReturnValue({ allowed: true, reason: 'Pass' });
      const checkSpy2 = vi.fn().mockReturnValue({ allowed: false, reason: 'Deny' });
      const checkSpy3 = vi.fn().mockReturnValue({ allowed: true, reason: 'Pass' });

      const firewall = new PolicyFirewall();
      firewall.addRule(createTestRule('rule1', checkSpy1));
      firewall.addRule(createTestRule('rule2', checkSpy2));
      firewall.addRule(createTestRule('rule3', checkSpy3));
      const ctx = createPolicyContext('test_tool', {});

      firewall.evaluate(ctx);

      expect(checkSpy1).toHaveBeenCalled();
      expect(checkSpy2).toHaveBeenCalled();
      expect(checkSpy3).not.toHaveBeenCalled();
    });

    it('should allow in warn mode but log denial', () => {
      const firewall = new PolicyFirewall({ mode: 'warn', logger: mockLogger });
      firewall.addRule(createDenyRule('deny-rule', 'Denied in warn mode'));
      const ctx = createPolicyContext('test_tool', {});

      const decision = firewall.evaluate(ctx);

      expect(decision.allowed).toBe(true);
      expect(decision.reason).toContain('Would be denied');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Policy denial overridden by warn mode',
        expect.any(Object)
      );
    });

    it('should log policy decisions', () => {
      const firewall = new PolicyFirewall({ logger: mockLogger });
      firewall.addRule(createAllowRule());
      const ctx = createPolicyContext('test_tool', {});

      firewall.evaluate(ctx);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Policy decision: ALLOWED',
        expect.objectContaining({ toolName: 'test_tool', allowed: true })
      );
    });

    it('should log denial decisions', () => {
      const firewall = new PolicyFirewall({ logger: mockLogger });
      firewall.addRule(createDenyRule());
      const ctx = createPolicyContext('test_tool', {});

      firewall.evaluate(ctx);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Policy decision: DENIED',
        expect.objectContaining({ toolName: 'test_tool', allowed: false })
      );
    });
  });

  describe('setMode / getMode', () => {
    it('should change mode and log change', () => {
      const firewall = new PolicyFirewall({ logger: mockLogger, mode: 'enforce' });

      firewall.setMode('warn');

      expect(firewall.getMode()).toBe('warn');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Policy mode changed',
        expect.objectContaining({ from: 'enforce', to: 'warn' })
      );
    });
  });

  describe('getRules', () => {
    it('should return a copy of rules array', () => {
      const firewall = new PolicyFirewall();
      firewall.addRule(createAllowRule('rule1'));

      const rules = firewall.getRules();
      // TypeScript infers this as readonly, but we test runtime behavior
      expect(rules).toHaveLength(1);

      // Original should not be modified if caller tries to mutate
      firewall.addRule(createAllowRule('rule2'));
      expect(rules).toHaveLength(1); // Still 1
      expect(firewall.getRules()).toHaveLength(2); // Now 2
    });
  });
});

// =============================================================================
// denyMutationsWithoutModeRule Tests
// =============================================================================

describe('denyMutationsWithoutModeRule', () => {
  it('should allow read operations in read-only mode', () => {
    const ctx = createPolicyContext('read_file', { path: '/test.txt' });

    const decision = denyMutationsWithoutModeRule.check(ctx);

    expect(decision.allowed).toBe(true);
  });

  it('should allow all operations in read-write mode', () => {
    const ctx = createPolicyContext('write_file', { path: '/test.txt' }, { mode: 'read-write' });

    const decision = denyMutationsWithoutModeRule.check(ctx);

    expect(decision.allowed).toBe(true);
  });

  it('should deny write operations in read-only mode', () => {
    const ctx = createPolicyContext('write_file', { path: '/test.txt' }, { mode: 'read-only' });

    const decision = denyMutationsWithoutModeRule.check(ctx);

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('mutation operation');
    expect(decision.reason).toContain("mode is 'read-only'");
  });

  it('should deny edit operations in read-only mode', () => {
    const ctx = createPolicyContext('edit_file', { path: '/test.txt' });

    const decision = denyMutationsWithoutModeRule.check(ctx);

    expect(decision.allowed).toBe(false);
  });

  it('should deny delete operations in read-only mode', () => {
    const ctx = createPolicyContext('delete_file', { path: '/test.txt' });

    const decision = denyMutationsWithoutModeRule.check(ctx);

    expect(decision.allowed).toBe(false);
  });

  it('should deny bash/shell operations in read-only mode', () => {
    const bashCtx = createPolicyContext('bash', { command: 'echo hello' });
    const shellCtx = createPolicyContext('run_shell', { command: 'ls' });

    expect(denyMutationsWithoutModeRule.check(bashCtx).allowed).toBe(false);
    expect(denyMutationsWithoutModeRule.check(shellCtx).allowed).toBe(false);
  });

  it('should allow orchestrate tool in read-only mode', () => {
    const ctx = createPolicyContext('orchestrate', { task: 'Plan work' });

    const decision = denyMutationsWithoutModeRule.check(ctx);

    expect(decision.allowed).toBe(true);
  });

  it('should allow delegate_to_model in read-only mode', () => {
    const ctx = createPolicyContext('delegate_to_model', { prompt: 'Help' });

    const decision = denyMutationsWithoutModeRule.check(ctx);

    expect(decision.allowed).toBe(true);
  });

  it('should treat unknown tools as mutations (safe default)', () => {
    const ctx = createPolicyContext('unknown_dangerous_tool', {});

    const decision = denyMutationsWithoutModeRule.check(ctx);

    expect(decision.allowed).toBe(false);
  });
});

// =============================================================================
// safePathsRule Tests
// =============================================================================

describe('safePathsRule', () => {
  it('should allow when no path argument present', () => {
    const ctx = createPolicyContext('some_tool', { name: 'test' });

    const decision = safePathsRule.check(ctx);

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('No path argument found');
  });

  it('should allow paths within allowed directories', () => {
    const ctx = createPolicyContext(
      'read_file',
      { path: '/project/src/file.ts' },
      { allowedPaths: ['/project'] }
    );

    const decision = safePathsRule.check(ctx);

    expect(decision.allowed).toBe(true);
  });

  it('should deny paths outside allowed directories', () => {
    const ctx = createPolicyContext(
      'read_file',
      { path: '/etc/passwd' },
      { allowedPaths: ['/project'] }
    );

    const decision = safePathsRule.check(ctx);

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('outside allowed directories');
  });

  it('should detect path traversal attempts', () => {
    const ctx = createPolicyContext(
      'read_file',
      { path: '/project/../../../etc/passwd' },
      { allowedPaths: ['/project'] }
    );

    const decision = safePathsRule.check(ctx);

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('..');
  });

  it('should use default allowed paths when not specified', () => {
    const ctx: PolicyContext = {
      toolName: 'read_file',
      args: { path: './src/file.ts' },
      mode: 'read-only',
    };

    const decision = safePathsRule.check(ctx);

    // Default is './' which should allow relative paths
    expect(decision.allowed).toBe(true);
  });

  it('should handle multiple allowed paths', () => {
    const ctx = createPolicyContext(
      'read_file',
      { path: '/home/user/docs/file.txt' },
      { allowedPaths: ['/project', '/home/user/docs'] }
    );

    const decision = safePathsRule.check(ctx);

    expect(decision.allowed).toBe(true);
  });

  it('should handle filePath argument name', () => {
    const ctx = createPolicyContext(
      'read_file',
      { filePath: '/etc/passwd' },
      { allowedPaths: ['/project'] }
    );

    const decision = safePathsRule.check(ctx);

    expect(decision.allowed).toBe(false);
  });

  it('should handle file_path argument name', () => {
    const ctx = createPolicyContext(
      'read_file',
      { file_path: '/etc/passwd' },
      { allowedPaths: ['/project'] }
    );

    const decision = safePathsRule.check(ctx);

    expect(decision.allowed).toBe(false);
  });

  it('should handle directory argument name', () => {
    const ctx = createPolicyContext(
      'list_directory',
      { directory: '/etc' },
      { allowedPaths: ['/project'] }
    );

    const decision = safePathsRule.check(ctx);

    expect(decision.allowed).toBe(false);
  });
});

// =============================================================================
// createDefaultPolicyFirewall Tests
// =============================================================================

describe('createDefaultPolicyFirewall', () => {
  it('should create firewall with default rules', () => {
    const firewall = createDefaultPolicyFirewall();

    const rules = firewall.getRules();
    expect(rules).toHaveLength(2);
    expect(rules.map((r) => r.name)).toContain('deny-mutations-without-mode');
    expect(rules.map((r) => r.name)).toContain('safe-paths');
  });

  it('should respect config options', () => {
    const firewall = createDefaultPolicyFirewall({ mode: 'warn' });

    expect(firewall.getMode()).toBe('warn');
  });

  it('should deny mutations without read-write mode by default', () => {
    const firewall = createDefaultPolicyFirewall();
    const ctx = createPolicyContext('write_file', { path: './test.txt' });

    const decision = firewall.evaluate(ctx);

    expect(decision.allowed).toBe(false);
  });

  it('should allow read operations by default', () => {
    const firewall = createDefaultPolicyFirewall();
    const ctx = createPolicyContext('read_file', { path: './test.txt' });

    const decision = firewall.evaluate(ctx);

    expect(decision.allowed).toBe(true);
  });
});

// =============================================================================
// evaluatePolicy Tests
// =============================================================================

describe('evaluatePolicy', () => {
  it('should return ok(undefined) when allowed', () => {
    const firewall = new PolicyFirewall();
    firewall.addRule(createAllowRule());
    const ctx = createPolicyContext('test_tool', {});

    const result = evaluatePolicy(firewall, ctx);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeUndefined();
    }
  });

  it('should return err(PolicyError) when denied', () => {
    const firewall = new PolicyFirewall();
    firewall.addRule(createDenyRule('deny-rule', 'Access denied'));
    const ctx = createPolicyContext('test_tool', {});

    const result = evaluatePolicy(firewall, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(PolicyError);
      expect(result.error.message).toContain('Access denied');
      expect(result.error.decision.allowed).toBe(false);
    }
  });
});

// =============================================================================
// createPolicyContext Tests
// =============================================================================

describe('createPolicyContext', () => {
  it('should create context with defaults', () => {
    const ctx = createPolicyContext('test_tool', { key: 'value' });

    expect(ctx.toolName).toBe('test_tool');
    expect(ctx.args).toEqual({ key: 'value' });
    expect(ctx.mode).toBe('read-only');
    expect(ctx.artifacts).toBeUndefined();
    expect(ctx.workflowId).toBeUndefined();
  });

  it('should create context with custom options', () => {
    const artifacts = new Map();
    artifacts.set('test', { id: 'test', type: 'file', value: 'content', createdAt: new Date() });

    const ctx = createPolicyContext(
      'test_tool',
      {},
      {
        mode: 'read-write',
        artifacts,
        workflowId: 'wf-123',
        allowedPaths: ['/custom/path'],
      }
    );

    expect(ctx.mode).toBe('read-write');
    expect(ctx.artifacts).toBe(artifacts);
    expect(ctx.workflowId).toBe('wf-123');
    expect(ctx.allowedPaths).toEqual(['/custom/path']);
  });
});

// =============================================================================
// PolicyError Tests
// =============================================================================

describe('PolicyError', () => {
  it('should create error with decision', () => {
    const decision: PolicyDecision = {
      allowed: false,
      reason: 'Test denial',
      ruleName: 'test-rule',
    };

    const error = new PolicyError('Policy denied', decision);

    expect(error.name).toBe('PolicyError');
    expect(error.message).toBe('Policy denied');
    expect(error.decision).toBe(decision);
    expect(error.context?.reason).toBe('Test denial');
    expect(error.context?.ruleName).toBe('test-rule');
  });

  it('should include requiredArtifact in context', () => {
    const decision: PolicyDecision = {
      allowed: false,
      reason: 'Need artifact',
      requiredArtifact: 'auth-token',
    };

    const error = new PolicyError('Missing artifact', decision);

    expect(error.context?.requiredArtifact).toBe('auth-token');
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Policy Integration', () => {
  it('should work end-to-end with default firewall', () => {
    const firewall = createDefaultPolicyFirewall();

    // Read in read-only mode should work
    const readCtx = createPolicyContext('read_file', { path: './src/file.ts' });
    expect(evaluatePolicy(firewall, readCtx).ok).toBe(true);

    // Write in read-only mode should fail
    const writeCtx = createPolicyContext('write_file', { path: './src/file.ts' });
    expect(evaluatePolicy(firewall, writeCtx).ok).toBe(false);

    // Write in read-write mode should work
    const writeRwCtx = createPolicyContext(
      'write_file',
      { path: './src/file.ts' },
      { mode: 'read-write' }
    );
    expect(evaluatePolicy(firewall, writeRwCtx).ok).toBe(true);
  });

  it('should enforce path restrictions even in read-write mode', () => {
    const firewall = createDefaultPolicyFirewall();

    // Use explicit absolute paths for clear path restriction testing
    const ctx = createPolicyContext(
      'write_file',
      { path: '/etc/passwd' },
      { mode: 'read-write', allowedPaths: ['/home/user/project'] }
    );

    const result = evaluatePolicy(firewall, ctx);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.decision.reason).toContain('outside allowed directories');
    }
  });

  it('should support warn mode for migration', () => {
    const firewall = createDefaultPolicyFirewall({ mode: 'warn' });

    // This would normally be denied
    const ctx = createPolicyContext('write_file', { path: './file.txt' });

    const decision = firewall.evaluate(ctx);

    // In warn mode, it's allowed but marked
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toContain('Would be denied');
  });

  it('should allow adding custom rules', () => {
    const firewall = createDefaultPolicyFirewall();

    // Add custom rule that denies a specific tool
    firewall.addRule(
      createTestRule('deny-specific-tool', (ctx) => {
        if (ctx.toolName === 'dangerous_tool') {
          return { allowed: false, reason: 'dangerous_tool is blocked' };
        }
        return { allowed: true, reason: 'Not dangerous' };
      })
    );

    // Custom rule should be evaluated
    const dangerousCtx = createPolicyContext('dangerous_tool', {}, { mode: 'read-write' });
    expect(evaluatePolicy(firewall, dangerousCtx).ok).toBe(false);

    // Other tools should still work
    const safeCtx = createPolicyContext('safe_tool', {}, { mode: 'read-write' });
    const result = evaluatePolicy(firewall, safeCtx);
    // Note: safe_tool is unknown so treated as mutation, but with read-write mode it passes
    expect(result.ok).toBe(true);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  it('should handle empty args object', () => {
    const firewall = createDefaultPolicyFirewall();
    const ctx = createPolicyContext('read_file', {});

    const decision = firewall.evaluate(ctx);

    expect(decision.allowed).toBe(true);
  });

  it('should handle null args', () => {
    const firewall = createDefaultPolicyFirewall();
    const ctx = createPolicyContext('read_file', null);

    const decision = firewall.evaluate(ctx);

    expect(decision.allowed).toBe(true);
  });

  it('should handle undefined args properties', () => {
    const firewall = createDefaultPolicyFirewall();
    const ctx = createPolicyContext('read_file', { path: undefined });

    const decision = firewall.evaluate(ctx);

    expect(decision.allowed).toBe(true);
  });

  it('should handle non-string path values', () => {
    const ctx = createPolicyContext('read_file', { path: 123 }, { allowedPaths: ['/project'] });

    const decision = safePathsRule.check(ctx);

    // Non-string paths should be treated as no path
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('No path argument found');
  });

  it('should handle array args', () => {
    const firewall = createDefaultPolicyFirewall();
    const ctx = createPolicyContext('some_tool', ['arg1', 'arg2']);

    const decision = firewall.evaluate(ctx);

    // Array is not object with path properties
    expect(decision).toBeDefined();
  });

  it('should handle concurrent evaluations', async () => {
    const firewall = createDefaultPolicyFirewall();

    const contexts = Array.from({ length: 100 }, (_, i) =>
      createPolicyContext('read_file', { path: `./file${String(i)}.txt` })
    );

    const decisions = await Promise.all(
      contexts.map((ctx) => Promise.resolve(firewall.evaluate(ctx)))
    );

    expect(decisions.every((d) => d.allowed)).toBe(true);
  });

  it('should handle rule that throws error', () => {
    const firewall = new PolicyFirewall();
    firewall.addRule(
      createTestRule('throwing-rule', () => {
        throw new Error('Rule error');
      })
    );

    const ctx = createPolicyContext('test_tool', {});

    // The error should propagate
    expect(() => firewall.evaluate(ctx)).toThrow('Rule error');
  });

  it('should preserve requiredArtifact in decision', () => {
    const firewall = new PolicyFirewall();
    firewall.addRule(
      createTestRule('require-artifact', () => ({
        allowed: false,
        reason: 'Requires authentication',
        requiredArtifact: 'auth-token',
      }))
    );

    const ctx = createPolicyContext('test_tool', {});
    const decision = firewall.evaluate(ctx);

    expect(decision.allowed).toBe(false);
    expect(decision.requiredArtifact).toBe('auth-token');
  });
});

// =============================================================================
// Mode Switching Tests
// =============================================================================

describe('Mode Switching', () => {
  it('should switch between enforce and warn modes', () => {
    const firewall = createDefaultPolicyFirewall();
    firewall.addRule(createDenyRule('deny-all', 'Always deny'));

    const ctx = createPolicyContext('test_tool', {}, { mode: 'read-write' });

    // Enforce mode - should deny
    firewall.setMode('enforce');
    expect(firewall.evaluate(ctx).allowed).toBe(false);

    // Warn mode - should allow with warning
    firewall.setMode('warn');
    expect(firewall.evaluate(ctx).allowed).toBe(true);

    // Back to enforce - should deny again
    firewall.setMode('enforce');
    expect(firewall.evaluate(ctx).allowed).toBe(false);
  });

  it('should allow runtime mode changes based on config', () => {
    const modes: PolicyMode[] = ['enforce', 'warn'];

    for (const mode of modes) {
      const firewall = createDefaultPolicyFirewall({ mode });
      expect(firewall.getMode()).toBe(mode);
    }
  });
});

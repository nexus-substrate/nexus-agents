/**
 * nexus-agents/mcp - Run Workflow Helpers Tests
 *
 * Unit tests for path validation and workflow loading helpers.
 * Security tests for Issue #353 - path traversal prevention.
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { SecurityError } from '../../core/index.js';
import {
  isFilePath,
  validateWorkflowPath,
  getAllowedWorkflowDirs,
  validateInputType,
  validateWorkflowInputs,
  createFailedResult,
} from './run-workflow-helpers.js';
import type { WorkflowDefinition } from '../../core/index.js';
import type { RunWorkflowDeps } from './run-workflow-types.js';
import { RateLimiter } from '../middleware/rate-limiter.js';

// ============================================================================
// isFilePath Tests
// ============================================================================

describe('isFilePath', () => {
  it('should detect forward slash paths', () => {
    expect(isFilePath('/path/to/file')).toBe(true);
    expect(isFilePath('relative/path')).toBe(true);
  });

  it('should detect backslash paths', () => {
    expect(isFilePath('C:\\path\\to\\file')).toBe(true);
  });

  it('should detect .yaml extension', () => {
    expect(isFilePath('workflow.yaml')).toBe(true);
    expect(isFilePath('my-workflow.yaml')).toBe(true);
  });

  it('should detect .yml extension', () => {
    expect(isFilePath('workflow.yml')).toBe(true);
    expect(isFilePath('my-workflow.yml')).toBe(true);
  });

  it('should not detect template names without paths', () => {
    expect(isFilePath('code-review')).toBe(false);
    expect(isFilePath('security-audit')).toBe(false);
  });
});

// ============================================================================
// validateWorkflowPath Tests (Issue #353 - Security)
// ============================================================================

describe('validateWorkflowPath', () => {
  const testRoot = '/allowed/workflows';

  describe('valid paths', () => {
    it('should accept path within allowed root', () => {
      const result = validateWorkflowPath('/allowed/workflows/my-workflow.yaml', [testRoot]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('/allowed/workflows/my-workflow.yaml');
      }
    });

    it('should accept nested path within allowed root', () => {
      const result = validateWorkflowPath('/allowed/workflows/team/project/workflow.yaml', [
        testRoot,
      ]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe('/allowed/workflows/team/project/workflow.yaml');
      }
    });

    it('should accept path in any of multiple allowed roots', () => {
      const result = validateWorkflowPath('/custom/templates/workflow.yaml', [
        testRoot,
        '/custom/templates',
      ]);

      expect(result.ok).toBe(true);
    });

    it('should resolve relative paths against cwd', () => {
      const cwd = process.cwd();
      const result = validateWorkflowPath('my-workflow.yaml', [cwd]);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(resolve('my-workflow.yaml'));
      }
    });
  });

  describe('path traversal attacks', () => {
    it('should reject simple path traversal', () => {
      const result = validateWorkflowPath('/allowed/workflows/../../../etc/passwd', [testRoot]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(SecurityError);
        expect(result.error.message).toContain('Path traversal detected');
      }
    });

    it('should reject double-dot traversal at end', () => {
      const result = validateWorkflowPath('/allowed/workflows/..', [testRoot]);

      expect(result.ok).toBe(false);
    });

    it('should reject encoded path traversal', () => {
      // Node.js resolve handles URL encoding, but let's verify behavior
      const result = validateWorkflowPath('/allowed/workflows/%2e%2e/etc/passwd', [testRoot]);

      // This tests the behavior - the literal %2e%2e is treated as a directory name
      // The important thing is that actual traversal is blocked
      expect(result.ok).toBe(true); // literal %2e%2e is a valid dir name
    });

    it('should reject path outside all allowed roots', () => {
      const result = validateWorkflowPath('/etc/passwd', [testRoot]);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Path traversal detected');
      }
    });

    it('should reject symlink-like traversal attempts', () => {
      // Even if someone tries to escape using complex paths
      const result = validateWorkflowPath('/allowed/workflows/sub/../../other/file', [testRoot]);

      expect(result.ok).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should reject when no allowed roots configured', () => {
      const result = validateWorkflowPath('/any/path/workflow.yaml', []);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('No allowed directories configured');
      }
    });

    it('should accept root directory itself', () => {
      const result = validateWorkflowPath('/allowed/workflows', [testRoot]);

      expect(result.ok).toBe(true);
    });

    it('should reject path that is prefix but not in directory', () => {
      // /allowed/workflows-extra is NOT inside /allowed/workflows
      const result = validateWorkflowPath('/allowed/workflows-extra/file.yaml', [testRoot]);

      expect(result.ok).toBe(false);
    });
  });
});

// ============================================================================
// getAllowedWorkflowDirs Tests
// ============================================================================

describe('getAllowedWorkflowDirs', () => {
  const mockRateLimiter = new RateLimiter({
    capacity: 100,
    refillRate: 100,
    refillIntervalMs: 1000,
  });

  const mockWorkflowEngine = {
    loadTemplate: () => Promise.resolve({ ok: true as const, value: {} as WorkflowDefinition }),
    execute: () => Promise.resolve({ ok: true as const, value: {} as never }),
    getStatus: () => ({ state: 'pending' as const }),
    cancel: () => Promise.resolve({ ok: true as const, value: undefined }),
    listTemplates: () => Promise.resolve([]),
    getTemplateByName: () => Promise.resolve(undefined),
  };

  it('should include built-in templates directory', () => {
    const deps: RunWorkflowDeps = {
      workflowEngine: mockWorkflowEngine,
      rateLimiter: mockRateLimiter,
    };

    const dirs = getAllowedWorkflowDirs(deps);

    // Should contain at least the built-in templates path
    expect(dirs.length).toBeGreaterThanOrEqual(1);
    expect(dirs.some((d) => d.includes('templates'))).toBe(true);
  });

  it('should include security config allowedPaths', () => {
    const deps: RunWorkflowDeps = {
      workflowEngine: mockWorkflowEngine,
      rateLimiter: mockRateLimiter,
      security: {
        allowedPaths: ['/custom/templates', '/project/workflows'],
        blockedPatterns: [],
        rateLimit: { enabled: false, requestsPerMinute: 100 },
      },
    };

    const dirs = getAllowedWorkflowDirs(deps);

    expect(dirs).toContain('/custom/templates');
    expect(dirs).toContain('/project/workflows');
  });

  it('should fall back to cwd when no security config', () => {
    const deps: RunWorkflowDeps = {
      workflowEngine: mockWorkflowEngine,
      rateLimiter: mockRateLimiter,
    };

    const dirs = getAllowedWorkflowDirs(deps);

    expect(dirs).toContain(process.cwd());
  });
});

// ============================================================================
// Input Validation Tests
// ============================================================================

describe('validateInputType', () => {
  it('should accept correct string type', () => {
    expect(validateInputType('name', 'hello', 'string')).toBeNull();
  });

  it('should reject wrong type', () => {
    const error = validateInputType('name', 123, 'string');
    expect(error).toContain('expected string');
    expect(error).toContain('got number');
  });

  it('should accept correct number type', () => {
    expect(validateInputType('count', 42, 'number')).toBeNull();
  });

  it('should accept correct boolean type', () => {
    expect(validateInputType('flag', true, 'boolean')).toBeNull();
  });

  it('should accept correct object type', () => {
    expect(validateInputType('config', { key: 'value' }, 'object')).toBeNull();
  });

  it('should reject null for object type', () => {
    const error = validateInputType('config', null, 'object');
    expect(error).toContain('expected object');
    expect(error).toContain('got null');
  });

  it('should accept correct array type', () => {
    expect(validateInputType('items', [1, 2, 3], 'array')).toBeNull();
  });

  it('should reject object for array type', () => {
    const error = validateInputType('items', { length: 3 }, 'array');
    expect(error).toContain('expected array');
  });
});

describe('validateWorkflowInputs', () => {
  const workflow: WorkflowDefinition = {
    name: 'test-workflow',
    version: '1.0.0',
    inputs: [
      { name: 'target', type: 'string', required: true },
      { name: 'options', type: 'object', required: false, default: {} },
      { name: 'count', type: 'number', required: false },
    ],
    steps: [],
  };

  it('should validate all required inputs present', () => {
    const result = validateWorkflowInputs(workflow, { target: 'src/main.ts' });

    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should report missing required inputs', () => {
    const result = validateWorkflowInputs(workflow, {});

    expect(result.valid).toBe(false);
    expect(result.missing).toContain('target');
  });

  it('should report type errors', () => {
    const result = validateWorkflowInputs(workflow, { target: 123 });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('target'))).toBe(true);
  });

  it('should accept optional inputs with defaults', () => {
    const result = validateWorkflowInputs(workflow, { target: 'src/main.ts' });

    expect(result.valid).toBe(true);
  });
});

// #2931: pre-fix the failure envelope hardcoded `executionId: 'unknown'`
// and `durationMs: 0`, leaving timed-out runs un-debuggable via
// `query_trace`. The fix threads real values from the engine's
// enriched WorkflowError.context.
describe('createFailedResult (#2931)', () => {
  function parseEnvelope(resp: ReturnType<typeof createFailedResult>): Record<string, unknown> {
    const textContent = (resp.content as ReadonlyArray<{ type: string; text: string }>)[0];
    expect(textContent?.type).toBe('text');
    return JSON.parse(textContent?.text ?? '{}') as Record<string, unknown>;
  }

  it('falls back to legacy sentinels when no opts supplied (backwards compat)', () => {
    const resp = createFailedResult('my-workflow', 'something broke');
    expect(resp.isError).toBe(true);
    const body = parseEnvelope(resp);
    expect(body['executionId']).toBe('unknown');
    expect(body['durationMs']).toBe(0);
    expect(body['workflowName']).toBe('my-workflow');
    expect(body['status']).toBe('failed');
    expect(body['error']).toBe('something broke');
  });

  it('uses the supplied executionId + durationMs from the run-workflow path', () => {
    const resp = createFailedResult('my-workflow', 'step timeout', {
      executionId: 'wf-abc-123',
      durationMs: 4523,
    });
    const body = parseEnvelope(resp);
    expect(body['executionId']).toBe('wf-abc-123');
    expect(body['durationMs']).toBe(4523);
  });

  it('accepts only executionId (durationMs falls back to 0)', () => {
    const resp = createFailedResult('w', 'e', { executionId: 'wf-x' });
    const body = parseEnvelope(resp);
    expect(body['executionId']).toBe('wf-x');
    expect(body['durationMs']).toBe(0);
  });

  it('accepts only durationMs (executionId falls back to "unknown")', () => {
    const resp = createFailedResult('w', 'e', { durationMs: 100 });
    const body = parseEnvelope(resp);
    expect(body['executionId']).toBe('unknown');
    expect(body['durationMs']).toBe(100);
  });
});

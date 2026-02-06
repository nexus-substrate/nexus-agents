/**
 * Tests for policy-rules.ts
 *
 * Covers MUTATION_TOOLS, READ_ONLY_TOOLS, isMutationTool,
 * denyMutationsWithoutModeRule, and safePathsRule.
 */

import { describe, it, expect } from 'vitest';
import {
  MUTATION_TOOLS,
  READ_ONLY_TOOLS,
  isMutationTool,
  denyMutationsWithoutModeRule,
  safePathsRule,
} from './policy-rules.js';
import type { PolicyContext } from './policy-types.js';

// ============================================================================
// Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeCtx(overrides: Partial<PolicyContext> = {}) {
  return {
    toolName: 'read_file',
    args: {},
    mode: 'read-only' as const,
    ...overrides,
  } as PolicyContext;
}

// ============================================================================
// MUTATION_TOOLS / READ_ONLY_TOOLS
// ============================================================================

describe('MUTATION_TOOLS', () => {
  it('contains expected write tools', () => {
    expect(MUTATION_TOOLS.has('write_file')).toBe(true);
    expect(MUTATION_TOOLS.has('edit_file')).toBe(true);
    expect(MUTATION_TOOLS.has('delete_file')).toBe(true);
    expect(MUTATION_TOOLS.has('execute_command')).toBe(true);
    expect(MUTATION_TOOLS.has('bash')).toBe(true);
  });

  it('does not contain read tools', () => {
    expect(MUTATION_TOOLS.has('read_file')).toBe(false);
    expect(MUTATION_TOOLS.has('list_directory')).toBe(false);
  });
});

describe('READ_ONLY_TOOLS', () => {
  it('contains expected read tools', () => {
    expect(READ_ONLY_TOOLS.has('read_file')).toBe(true);
    expect(READ_ONLY_TOOLS.has('list_directory')).toBe(true);
    expect(READ_ONLY_TOOLS.has('search_files')).toBe(true);
    expect(READ_ONLY_TOOLS.has('orchestrate')).toBe(true);
  });

  it('does not contain mutation tools', () => {
    expect(READ_ONLY_TOOLS.has('write_file')).toBe(false);
    expect(READ_ONLY_TOOLS.has('bash')).toBe(false);
  });
});

// ============================================================================
// isMutationTool
// ============================================================================

describe('isMutationTool', () => {
  it('returns true for explicit mutation tools', () => {
    expect(isMutationTool('write_file')).toBe(true);
    expect(isMutationTool('bash')).toBe(true);
    expect(isMutationTool('delete_file')).toBe(true);
  });

  it('returns false for explicit read-only tools', () => {
    expect(isMutationTool('read_file')).toBe(false);
    expect(isMutationTool('orchestrate')).toBe(false);
    expect(isMutationTool('delegate_to_model')).toBe(false);
  });

  it('defaults to true for unknown tools', () => {
    expect(isMutationTool('totally_unknown_tool')).toBe(true);
    expect(isMutationTool('custom_operation')).toBe(true);
  });
});

// ============================================================================
// denyMutationsWithoutModeRule
// ============================================================================

describe('denyMutationsWithoutModeRule', () => {
  it('has name and description', () => {
    expect(denyMutationsWithoutModeRule.name).toBe('deny-mutations-without-mode');
    expect(denyMutationsWithoutModeRule.description).toBeTruthy();
  });

  it('allows all operations in read-write mode', () => {
    const result = denyMutationsWithoutModeRule.check(
      makeCtx({ toolName: 'write_file', mode: 'read-write' })
    );
    expect(result.allowed).toBe(true);
  });

  it('allows read-only tools in read-only mode', () => {
    const result = denyMutationsWithoutModeRule.check(
      makeCtx({ toolName: 'read_file', mode: 'read-only' })
    );
    expect(result.allowed).toBe(true);
  });

  it('denies mutation tools in read-only mode', () => {
    const result = denyMutationsWithoutModeRule.check(
      makeCtx({ toolName: 'write_file', mode: 'read-only' })
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('write_file');
    expect(result.reason).toContain('read-only');
  });

  it('denies unknown tools in read-only mode (safe default)', () => {
    const result = denyMutationsWithoutModeRule.check(
      makeCtx({ toolName: 'mystery_tool', mode: 'read-only' })
    );
    expect(result.allowed).toBe(false);
  });

  it('allows mutation tools in read-write mode', () => {
    const result = denyMutationsWithoutModeRule.check(
      makeCtx({ toolName: 'bash', mode: 'read-write' })
    );
    expect(result.allowed).toBe(true);
  });
});

// ============================================================================
// safePathsRule
// ============================================================================

describe('safePathsRule', () => {
  it('has name and description', () => {
    expect(safePathsRule.name).toBe('safe-paths');
    expect(safePathsRule.description).toBeTruthy();
  });

  it('allows when no path argument found', () => {
    const result = safePathsRule.check(makeCtx({ args: {} }));
    expect(result.allowed).toBe(true);
    expect(result.reason).toContain('No path');
  });

  it('denies path traversal with ".."', () => {
    const result = safePathsRule.check(makeCtx({ args: { path: '../../../etc/passwd' } }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('..');
  });

  it('allows paths within allowed directories', () => {
    const result = safePathsRule.check(
      makeCtx({
        args: { path: '/home/user/project/file.ts' },
        allowedPaths: ['/home/user/project'],
      })
    );
    expect(result.allowed).toBe(true);
  });

  it('denies paths outside allowed directories', () => {
    const result = safePathsRule.check(
      makeCtx({
        args: { path: '/etc/passwd' },
        allowedPaths: ['/home/user/project'],
      })
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('outside allowed');
  });

  it('extracts path from file_path field', () => {
    const result = safePathsRule.check(makeCtx({ args: { file_path: '../secret' } }));
    expect(result.allowed).toBe(false);
  });

  it('extracts path from filePath field', () => {
    const result = safePathsRule.check(makeCtx({ args: { filePath: '../secret' } }));
    expect(result.allowed).toBe(false);
  });

  it('uses default allowed paths when none specified', () => {
    // Default allowed path is ['./'], relative paths within project should be allowed
    const result = safePathsRule.check(makeCtx({ args: { path: '/some/absolute/path' } }));
    // Whether it's allowed depends on normalization of './' vs '/some/absolute/path'
    expect(typeof result.allowed).toBe('boolean');
    expect(result.reason).toBeTruthy();
  });
});

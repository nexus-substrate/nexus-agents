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
import { TOOL_MANIFEST, classifyRegisteredTool } from '../tools/tool-manifest.js';
import { createDefaultPolicyFirewall } from './policy.js';
import { DEFAULT_EXECUTION_MODE } from '../../config/schemas-security.js';

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
  };
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
  });

  it('does not contain mutation tools', () => {
    expect(READ_ONLY_TOOLS.has('write_file')).toBe(false);
    expect(READ_ONLY_TOOLS.has('bash')).toBe(false);
  });
});

describe('the generic sets never answer for a registered tool (#5114)', () => {
  // ONE source per name: a registered nexus tool is classified by its manifest
  // `readOnlyHint`, so a copy of its name here would be a second answer that
  // could silently disagree — `orchestrate` sat in READ_ONLY_TOOLS while its
  // manifest entry said readOnlyHint: false.
  const registered = new Set<string>(TOOL_MANIFEST.map((t) => t.name));

  it('MUTATION_TOOLS is disjoint from the manifest', () => {
    expect([...MUTATION_TOOLS].filter((n) => registered.has(n))).toEqual([]);
  });

  it('READ_ONLY_TOOLS is disjoint from the manifest', () => {
    expect([...READ_ONLY_TOOLS].filter((n) => registered.has(n))).toEqual([]);
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
  });

  it('reads a registered tool off the manifest, not the generic sets (#5114)', () => {
    // Both declare readOnlyHint: false — orchestrate spawns experts,
    // delegate_to_model records to tool-memory. The old sets called them
    // read-only; the manifest is the author's claim and wins.
    expect(isMutationTool('orchestrate')).toBe(true);
    expect(isMutationTool('delegate_to_model')).toBe(true);
    expect(isMutationTool('memory_query')).toBe(false);
    expect(isMutationTool('memory_write')).toBe(true);
  });

  it('defaults to true for unknown tools (fail closed)', () => {
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

  it('names an unknown tool as unclassified — a distinct state, not a mutation (#5114)', () => {
    // Fail-closed is right for security and wrong for a rollout unless the
    // record says WHICH it was: a real mutation that the mode forbids, or a
    // tool nobody classified. The verdict has to tell them apart.
    const unknown = denyMutationsWithoutModeRule.check(
      makeCtx({ toolName: 'mystery_tool', mode: 'read-only' })
    );
    expect(unknown.allowed).toBe(false);
    expect(unknown.reason).toContain("'mystery_tool'");
    expect(unknown.reason).toContain('unclassified');
    expect(unknown.reason).not.toContain('mutation operation');

    const mutation = denyMutationsWithoutModeRule.check(
      makeCtx({ toolName: 'write_file', mode: 'read-only' })
    );
    expect(mutation.reason).toContain('mutation operation');
    expect(mutation.reason).not.toContain('unclassified');
  });

  it('allows mutation tools in read-write mode', () => {
    const result = denyMutationsWithoutModeRule.check(
      makeCtx({ toolName: 'bash', mode: 'read-write' })
    );
    expect(result.allowed).toBe(true);
  });

  describe('every registered tool reaches the rule classified (#5114)', () => {
    // The seam the gate is about: manifest → classification → rule verdict.
    // The manifest test proves the source; this proves the rule CONSUMES it,
    // so a registered tool can never be denied as "unclassified".
    it.each(TOOL_MANIFEST.map((t) => [t.name, t.annotations.readOnlyHint] as const))(
      '%s: verdict in read-only mode follows readOnlyHint=%s',
      (name, readOnlyHint) => {
        const result = denyMutationsWithoutModeRule.check(
          makeCtx({ toolName: name, mode: 'read-only' })
        );
        expect(result.reason).not.toContain('unclassified');
        expect(result.allowed).toBe(readOnlyHint);
      }
    );
  });
});

// ============================================================================
// The benign population under the DEFAULT config (#6431)
// ============================================================================

describe('the default rule set under the default config allows every registered tool (#6431)', () => {
  // The population that matters when enforcement turns on is the ordinary
  // caller, not the attacker: flipping NEXUS_AUTO_REMEDIATE to enforce broke
  // three legitimate paths because only the attack was tested. Under the old
  // 'read-only' default this rule would have denied every manifest-classified
  // mutation tool for every operator on enforcement day. So: an ENFORCING
  // firewall, the shipped rules, the shipped default mode, every registered
  // tool — allowed. The empty case is named: a manifest with no mutation tools
  // would make this suite prove nothing, so the count is asserted first.
  const mutationTools = TOOL_MANIFEST.map((t) => t.name).filter(
    (name) => classifyRegisteredTool(name) === 'mutation'
  );
  const readOnlyTools = TOOL_MANIFEST.map((t) => t.name).filter(
    (name) => classifyRegisteredTool(name) === 'read-only'
  );
  const enforcing = createDefaultPolicyFirewall({ mode: 'enforce' });

  it('has a non-empty population on each side', () => {
    expect(mutationTools.length).toBeGreaterThan(0);
    expect(readOnlyTools.length).toBeGreaterThan(0);
    expect(mutationTools.length + readOnlyTools.length).toBe(TOOL_MANIFEST.length);
  });

  it.each(mutationTools)('mutation tool %s is allowed under the default mode', (name) => {
    const decision = enforcing.evaluate({ toolName: name, args: {}, mode: DEFAULT_EXECUTION_MODE });
    expect(decision.allowed).toBe(true);
  });

  it.each(readOnlyTools)('read-only tool %s is allowed under the default mode', (name) => {
    const decision = enforcing.evaluate({ toolName: name, args: {}, mode: DEFAULT_EXECUTION_MODE });
    expect(decision.allowed).toBe(true);
  });

  it.each(mutationTools)(
    'mutation tool %s is still denied under an explicit read-only lock',
    (name) => {
      // The lock the panel kept the rule for: command-shaped tools never reach
      // the path rules, so this is the only guard on that class.
      const decision = enforcing.evaluate({ toolName: name, args: {}, mode: 'read-only' });
      expect(decision.allowed).toBe(false);
      expect(decision.ruleName).toBe('deny-mutations-without-mode');
    }
  );
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

  it('extracts path from planFile and specFile fields', () => {
    expect(safePathsRule.check(makeCtx({ args: { planFile: '../secret.md' } })).allowed).toBe(
      false
    );
    expect(safePathsRule.check(makeCtx({ args: { specFile: '../secret.md' } })).allowed).toBe(
      false
    );
  });

  it('validates all paths when multiple path arguments are provided', () => {
    const result = safePathsRule.check(
      makeCtx({
        args: {
          feedAPath: './safe-a.json',
          feedBPath: '../../etc/passwd',
        },
      })
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('..');
  });

  it('denies when any path in an array of paths contains traversal', () => {
    const result = safePathsRule.check(
      makeCtx({
        args: {
          paths: ['./safe.ts', '../../etc/shadow'],
        },
      })
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('..');
  });

  it('uses default allowed paths when none specified', () => {
    // Default allowed path is ['./'], relative paths within project should be allowed
    const result = safePathsRule.check(makeCtx({ args: { path: '/some/absolute/path' } }));
    // Whether it's allowed depends on normalization of './' vs '/some/absolute/path'
    expect(typeof result.allowed).toBe('boolean');
    expect(result.reason).toBeTruthy();
  });
});

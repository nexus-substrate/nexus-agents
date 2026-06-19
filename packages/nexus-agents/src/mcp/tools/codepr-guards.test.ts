/**
 * Red-team / negative-path tests for the deterministic code-PR write-time guards
 * (#3670, Stage 1). The NEGATIVE fixtures are the point: each guard must PROVE it
 * DENIES the unsafe case, and the composite must short-circuit fail-closed. The
 * guards take no model output, so every case is a realized filesystem/diff fact.
 */

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  confinePath,
  classifyPath,
  checkBlastRadius,
  scanDiffOrDeny,
  auditAutonomousEvent,
  checkResourceBudget,
  evaluateWriteGuards,
  SELF_GUARD_MODULE_BASENAMES,
  SENSITIVE_PATH_RULES,
  DEFAULT_BLAST_RADIUS_LIMITS,
  DEFAULT_RESOURCE_BUDGET_LIMITS,
  type ChangedFile,
  type WriteGuardsInput,
  type AutonomousEventRecord,
} from './codepr-guards.js';
import type { IAuditLogger, AuditEventInput } from '../../audit/audit-types.js';

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Make a tmp dir, register cleanup, return its REALPATH (macOS /var → /private/var). */
function makeTmpRoot(): { root: string; cleanup: () => void } {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'codepr-guards-')));
  return {
    root: dir,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** A minimal in-memory IAuditLogger capturing `log()` inputs. */
function makeCapturingLogger(): { logger: IAuditLogger; events: AuditEventInput[] } {
  const events: AuditEventInput[] = [];
  const logger: IAuditLogger = {
    log: (input) => {
      events.push(input);
    },
    logToolInvocation: () => {},
    logPolicyDecision: () => {},
    logSecurityEvent: () => {},
    logRateLimitViolation: () => {},
    logTierTransition: () => {},
    flush: async () => {},
    close: async () => {},
  };
  return { logger, events };
}

const cf = (path: string, addedLines = 1, removedLines = 0): ChangedFile => ({
  path,
  addedLines,
  removedLines,
});

// ----------------------------------------------------------------------------
// Guard 1 — Path confinement
// ----------------------------------------------------------------------------

describe('confinePath', () => {
  it('allows a legit in-root path', () => {
    const { root, cleanup } = makeTmpRoot();
    try {
      writeFileSync(join(root, 'foo.ts'), 'export const a = 1;\n');
      const r = confinePath(root, 'foo.ts');
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.resolvedPath).toBe(join(root, 'foo.ts'));
    } finally {
      cleanup();
    }
  });

  it('DENIES a `..` traversal escape', () => {
    const { root, cleanup } = makeTmpRoot();
    try {
      // ../etc/passwd-style escape; the parent dir exists so realpath resolves
      // but lands OUTSIDE the root → path_escape (not a resolve failure).
      const r = confinePath(root, '../');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('path_escape');
    } finally {
      cleanup();
    }
  });

  it('DENIES an absolute path outside the root', () => {
    const { root, cleanup } = makeTmpRoot();
    try {
      const r = confinePath(root, realpathSync(tmpdir()));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('path_escape');
    } finally {
      cleanup();
    }
  });

  it('DENIES a symlink whose target escapes the root', () => {
    const { root, cleanup } = makeTmpRoot();
    const { root: outside, cleanup: cleanupOutside } = makeTmpRoot();
    try {
      const secretTarget = join(outside, 'escaped.txt');
      writeFileSync(secretTarget, 'outside the worktree\n');
      const link = join(root, 'link-to-outside');
      symlinkSync(secretTarget, link);
      // candidate is in-root by name, but realpath follows the symlink OUT.
      const r = confinePath(root, 'link-to-outside');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('path_escape');
    } finally {
      cleanup();
      cleanupOutside();
    }
  });

  it('fail-closed: DENIES when the candidate cannot be realpath-resolved', () => {
    const { root, cleanup } = makeTmpRoot();
    try {
      const r = confinePath(root, 'does-not-exist.ts');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('path_escape');
    } finally {
      cleanup();
    }
  });

  it('fail-closed: DENIES a non-absolute worktreeRoot', () => {
    const r = confinePath('relative/root', 'foo.ts');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('path_escape');
  });

  it('allows a nested in-root path resolved via the realpath seam', () => {
    const { root, cleanup } = makeTmpRoot();
    try {
      mkdirSync(join(root, 'src'));
      writeFileSync(join(root, 'src', 'a.ts'), '\n');
      const r = confinePath(root, 'src/a.ts');
      expect(r.ok).toBe(true);
    } finally {
      cleanup();
    }
  });
});

// ----------------------------------------------------------------------------
// Guard 2 — Sensitive-path classifier
// ----------------------------------------------------------------------------

describe('classifyPath', () => {
  it('allows a normal source file', () => {
    expect(classifyPath('src/foo.ts')).toEqual({ sensitive: false });
    expect(classifyPath('packages/nexus-agents/src/mcp/tools/some-tool.ts')).toEqual({
      sensitive: false,
    });
  });

  const sensitiveCases: Array<[string, string]> = [
    ['governance/x', 'governance'],
    ['governance/ratification-votes.yaml', 'governance'],
    ['.github/workflows/ci.yml', 'workflow'],
    ['CODEOWNERS', 'codeowners'],
    ['.github/CODEOWNERS', 'codeowners'],
    ['packages/nexus-agents/src/audit/audit-logger.ts', 'self_guard'], // self-guard wins over audit
    ['src/audit/audit-storage.ts', 'audit'],
    ['packages/nexus-agents/src/auth/token.ts', 'authority'],
    ['src/security/authority-tier.ts', 'authority'],
    ['package.json', 'dependency_manifest'],
    ['packages/nexus-agents/package.json', 'dependency_manifest'],
    ['pnpm-lock.yaml', 'dependency_manifest'],
    ['tsconfig.json', 'dependency_manifest'],
    ['packages/nexus-agents/tsconfig.build.json', 'dependency_manifest'],
  ];
  it.each(sensitiveCases)('DENIES sensitive path %s as %s', (path, category) => {
    const c = classifyPath(path);
    expect(c.sensitive).toBe(true);
    if (c.sensitive) expect(c.category).toBe(category);
  });

  it('DENIES self-modification of the guard module itself', () => {
    for (const p of [
      'packages/nexus-agents/src/mcp/tools/codepr-guards.ts',
      'src/mcp/tools/codepr-guards.test.ts',
      'codepr-guards.ts',
      'foo/codepr-guards/index.ts',
    ]) {
      const c = classifyPath(p);
      expect(c.sensitive, `should lock out: ${p}`).toBe(true);
      if (c.sensitive) expect(c.category).toBe('self_guard');
    }
  });

  it('DENIES self-modification of every reused safety primitive', () => {
    const reused = [
      'packages/nexus-agents/src/mcp/tools/diff-secret-scan.ts',
      'packages/nexus-agents/src/config/repo-root-detection.ts',
      'packages/nexus-agents/src/audit/audit-logger.ts',
      'packages/nexus-agents/src/audit/audit-types.ts',
      'packages/nexus-agents/src/mcp/tools/improvement-enforce-readiness.ts',
      'packages/nexus-agents/src/mcp/tools/remediation-readiness-collector.ts',
    ];
    for (const p of reused) {
      const c = classifyPath(p);
      expect(c.sensitive, `should lock out reused primitive: ${p}`).toBe(true);
      if (c.sensitive) expect(c.category).toBe('self_guard');
    }
  });

  it('normalizes Windows separators and a leading ./', () => {
    expect(classifyPath('.\\package.json').sensitive).toBe(true);
    expect(classifyPath('./governance/x').sensitive).toBe(true);
    expect(classifyPath('packages\\nexus-agents\\src\\audit\\x.ts').sensitive).toBe(true);
  });
});

// ----------------------------------------------------------------------------
// Guard 3 — Blast radius
// ----------------------------------------------------------------------------

describe('checkBlastRadius', () => {
  it('allows a change within both caps', () => {
    const r = checkBlastRadius([cf('src/a.ts', 10, 5), cf('src/b.ts', 3, 2)]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.filesTouched).toBe(2);
      expect(r.linesTouched).toBe(20);
    }
  });

  it('DENIES over maxFiles', () => {
    const files = Array.from({ length: 21 }, (_, i) => cf(`src/f${String(i)}.ts`, 1, 0));
    const r = checkBlastRadius(files, { maxFiles: 20, maxLines: 10_000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('blast_radius_exceeded');
  });

  it('DENIES over maxLines', () => {
    const r = checkBlastRadius([cf('src/a.ts', 300, 200)], { maxFiles: 50, maxLines: 400 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('blast_radius_exceeded');
  });

  it('DENIES a sensitive file even when within size caps', () => {
    const r = checkBlastRadius([cf('src/a.ts', 1, 0), cf('package.json', 1, 0)]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('sensitive_path');
  });

  it('uses documented defaults when no limits passed', () => {
    expect(DEFAULT_BLAST_RADIUS_LIMITS.maxFiles).toBe(20);
    expect(DEFAULT_BLAST_RADIUS_LIMITS.maxLines).toBe(400);
  });
});

// ----------------------------------------------------------------------------
// Guard 4 — Pre-push secret scan
// ----------------------------------------------------------------------------

describe('scanDiffOrDeny', () => {
  it('allows a clean diff', () => {
    const r = scanDiffOrDeny('+ adjust routing weight for docs\n- old weight\n');
    expect(r.ok).toBe(true);
  });

  it('DENIES a diff containing a planted fake secret', () => {
    const diff = ['+ const apiKey = "ABCDEFGHIJKLMNOP1234"', '+ // shipped by mistake'].join('\n');
    const r = scanDiffOrDeny(diff);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('secret_detected');
      // value-free: detail names the pattern + line, never the secret value.
      expect(r.detail).not.toContain('ABCDEFGHIJKLMNOP1234');
    }
  });

  it('DENIES an AWS-key-shaped secret', () => {
    const r = scanDiffOrDeny('+ AKIAIOSFODNN7EXAMPLE\n');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('secret_detected');
  });
});

// ----------------------------------------------------------------------------
// Guard 5 — Audit-append (both PR and abort paths)
// ----------------------------------------------------------------------------

describe('auditAutonomousEvent', () => {
  const baseRecord: AutonomousEventRecord = {
    runId: 'run-123',
    sourceSignalHash: 'sig-abc',
    diffHash: 'diff-def',
    scanVerdict: 'clean',
    filesTouched: 2,
    linesTouched: 20,
    tokenIdentity: 'none',
    decision: 'would_open_pr',
  };

  it('appends a record for a would-be PR (precondition C, pass path)', () => {
    const { logger, events } = makeCapturingLogger();
    const r = auditAutonomousEvent(logger, baseRecord);
    expect(r.ok).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]?.action).toBe('autonomous_code_pr.would_open_pr');
    expect(events[0]?.outcome).toBe('success');
    expect(events[0]?.metadata?.['runId']).toBe('run-123');
  });

  it('appends a record for a fail-closed abort (precondition C, abort path)', () => {
    const { logger, events } = makeCapturingLogger();
    const r = auditAutonomousEvent(logger, {
      ...baseRecord,
      decision: 'abort',
      abortReason: 'secret_detected',
    });
    expect(r.ok).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]?.action).toBe('autonomous_code_pr.abort');
    expect(events[0]?.outcome).toBe('denied');
    expect(events[0]?.metadata?.['abortReason']).toBe('secret_detected');
  });

  it('fail-closed: DENIES with audit_append_failed when the logger throws', () => {
    const throwing: IAuditLogger = {
      log: () => {
        throw new Error('disk full');
      },
      logToolInvocation: () => {},
      logPolicyDecision: () => {},
      logSecurityEvent: () => {},
      logRateLimitViolation: () => {},
      logTierTransition: () => {},
      flush: async () => {},
      close: async () => {},
    };
    const r = auditAutonomousEvent(throwing, baseRecord);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('audit_append_failed');
  });

  it('never leaks a secret value into the audit record (hashes only)', () => {
    const { logger, events } = makeCapturingLogger();
    auditAutonomousEvent(logger, baseRecord);
    const serialized = JSON.stringify(events[0]);
    expect(serialized).toContain('diff-def');
    expect(serialized).not.toMatch(/AKIA|sk-ant-|ghp_/);
  });
});

// ----------------------------------------------------------------------------
// Guard 6 — Resource budget
// ----------------------------------------------------------------------------

describe('checkResourceBudget', () => {
  const within = { wallClockMs: 1_000, tokens: 1_000, toolCalls: 5 };

  it('allows usage within all ceilings', () => {
    expect(checkResourceBudget(within).ok).toBe(true);
  });

  it('allows usage exactly at the ceiling (ceiling is the last permitted value)', () => {
    const r = checkResourceBudget({
      wallClockMs: DEFAULT_RESOURCE_BUDGET_LIMITS.maxWallClockMs,
      tokens: DEFAULT_RESOURCE_BUDGET_LIMITS.maxTokens,
      toolCalls: DEFAULT_RESOURCE_BUDGET_LIMITS.maxToolCalls,
    });
    expect(r.ok).toBe(true);
  });

  it('DENIES on wall-clock breach', () => {
    const r = checkResourceBudget({ ...within, wallClockMs: 999_999_999 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('budget_exceeded');
  });

  it('DENIES on token breach', () => {
    const r = checkResourceBudget({ ...within, tokens: 999_999_999 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('budget_exceeded');
  });

  it('DENIES on tool-call breach', () => {
    const r = checkResourceBudget({ ...within, toolCalls: 999_999 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('budget_exceeded');
  });
});

// ----------------------------------------------------------------------------
// Composite — evaluateWriteGuards
// ----------------------------------------------------------------------------

describe('evaluateWriteGuards', () => {
  const okRealpath = (p: string): string => p; // identity seam: every path resolves in-root

  function input(overrides: Partial<WriteGuardsInput> = {}): WriteGuardsInput {
    return {
      worktreeRoot: '/work/root',
      changedFiles: [cf('/work/root/src/a.ts', 5, 2)],
      diff: '+ const a = 1;\n',
      usage: { wallClockMs: 10, tokens: 10, toolCalls: 1 },
      realpath: okRealpath,
      ...overrides,
    };
  }

  it('returns ok for a fully clean change set', () => {
    const r = evaluateWriteGuards(input());
    expect(r.ok).toBe(true);
  });

  it('short-circuits on a path escape (guard 1) before later guards', () => {
    // realpath that escapes the root → confinePath denies first.
    const escaping = (p: string): string => (p === '/work/root' ? p : '/elsewhere/evil.ts');
    const r = evaluateWriteGuards(input({ realpath: escaping }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('path_escape');
  });

  it('returns the sensitive_path denial (guard 2) for a sensitive file', () => {
    const r = evaluateWriteGuards(
      input({ changedFiles: [cf('/work/root/package.json', 1, 0)] })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('sensitive_path');
  });

  it('returns the blast_radius_exceeded denial (guard 2 size)', () => {
    const many = Array.from({ length: 30 }, (_, i) => cf(`/work/root/src/f${String(i)}.ts`, 1, 0));
    const r = evaluateWriteGuards(input({ changedFiles: many }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('blast_radius_exceeded');
  });

  it('returns the secret_detected denial (guard 3)', () => {
    const r = evaluateWriteGuards(input({ diff: '+ AKIAIOSFODNN7EXAMPLE\n' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('secret_detected');
  });

  it('returns the budget_exceeded denial (guard 6)', () => {
    const r = evaluateWriteGuards(input({ usage: { wallClockMs: 9e9, tokens: 1, toolCalls: 1 } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('budget_exceeded');
  });

  it('short-circuit order: a secret AND a budget breach reports the earlier (secret) guard', () => {
    const r = evaluateWriteGuards(
      input({
        diff: '+ AKIAIOSFODNN7EXAMPLE\n',
        usage: { wallClockMs: 9e9, tokens: 9e9, toolCalls: 9e9 },
      })
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('secret_detected');
  });

  it('a violating set never returns ok (fail-closed)', () => {
    // Spy proves we do not fall through to ok after a denial.
    const spy = vi.fn(() => '/work/root');
    const r = evaluateWriteGuards(
      input({ changedFiles: [cf('/work/root/CODEOWNERS', 1, 0)], realpath: spy })
    );
    expect(r.ok).toBe(false);
  });
});

// ----------------------------------------------------------------------------
// Staleness — the self-guard lockout must not silently rot
// ----------------------------------------------------------------------------

describe('self-guard denylist staleness', () => {
  it('the lockout still names this guard module itself', () => {
    expect(SELF_GUARD_MODULE_BASENAMES).toContain('codepr-guards');
  });

  it('the lockout names every reused safety primitive', () => {
    for (const name of [
      'diff-secret-scan',
      'repo-root-detection',
      'audit-logger',
      'audit-types',
      'improvement-enforce-readiness',
    ]) {
      expect(SELF_GUARD_MODULE_BASENAMES).toContain(name);
    }
  });

  it('the self_guard rule is the FIRST rule (wins category over audit/authority)', () => {
    expect(SENSITIVE_PATH_RULES[0]?.category).toBe('self_guard');
  });

  it('classifyPath still treats this very test file as self-guard (lockout alive)', () => {
    // If someone renamed the module without updating the denylist, this fails.
    const c = classifyPath('packages/nexus-agents/src/mcp/tools/codepr-guards.test.ts');
    expect(c.sensitive).toBe(true);
    if (c.sensitive) expect(c.category).toBe('self_guard');
  });
});

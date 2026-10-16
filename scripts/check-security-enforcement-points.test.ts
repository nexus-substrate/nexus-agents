/**
 * Tests for the security enforcement-point gate (#5041).
 *
 * Verifies that registered security controls have at least one non-test,
 * non-barrel production enforcement site in packages/nexus-agents/src/.
 *
 * Conforms to .rules/development-disciplines.md ("Name the empty case"):
 * - Empty manifest fails closed (never vacuously passes).
 * - Zero scanned files fails closed.
 * - Test-only call sites are rejected.
 * - Real repo manifest passes with verified live production enforcement sites.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SECURITY_MANIFEST,
  checkSecurityEnforcementPoints,
  isTestFile,
  isBarrelFile,
  isDeclarationFile,
  isProductionSourceFile,
  pathsMatch,
  main,
  type SecurityEnforcementEntry,
} from './check-security-enforcement-points.js';

describe('file classification helpers', () => {
  it('correctly classifies test files (test, spec, __tests__, and src/testing/)', () => {
    expect(isTestFile('packages/nexus-agents/src/security/safe-path.test.ts')).toBe(true);
    expect(isTestFile('packages/nexus-agents/src/security/safe-path.spec.ts')).toBe(true);
    expect(isTestFile('packages/nexus-agents/src/__tests__/fixture.ts')).toBe(true);
    expect(isTestFile('packages/nexus-agents/src/testing/test-secrets.ts')).toBe(true);
    expect(isTestFile('packages/nexus-agents/src/testing/adapters/fake-cli.ts')).toBe(true);

    expect(isTestFile('packages/nexus-agents/src/security/safe-path.ts')).toBe(false);
    expect(isTestFile('packages/nexus-agents/src/mcp/middleware/policy-check.ts')).toBe(false);
  });

  it('correctly classifies barrel files (index.ts and exports/ re-exports)', () => {
    expect(isBarrelFile('packages/nexus-agents/src/index.ts')).toBe(true);
    expect(isBarrelFile('packages/nexus-agents/src/security/index.ts')).toBe(true);
    expect(isBarrelFile('packages/nexus-agents/src/exports/security.ts')).toBe(true);
    expect(isBarrelFile('packages/nexus-agents/src/exports/mcp.ts')).toBe(true);

    expect(isBarrelFile('packages/nexus-agents/src/security/safe-path.ts')).toBe(false);
    expect(isBarrelFile('packages/nexus-agents/src/cli/workflow-run.ts')).toBe(false);
  });

  it('correctly classifies declaration files (.d.ts)', () => {
    expect(isDeclarationFile('packages/nexus-agents/src/types.d.ts')).toBe(true);
    expect(isDeclarationFile('packages/nexus-agents/src/security/safe-path.ts')).toBe(false);
  });

  it('correctly filters for production source files', () => {
    expect(isProductionSourceFile('packages/nexus-agents/src/security/safe-path.ts')).toBe(true);
    expect(isProductionSourceFile('packages/nexus-agents/src/security/safe-path.test.ts')).toBe(
      false
    );
    expect(isProductionSourceFile('packages/nexus-agents/src/index.ts')).toBe(false);
    expect(isProductionSourceFile('packages/nexus-agents/src/exports/security.ts')).toBe(false);
    expect(isProductionSourceFile('packages/nexus-agents/src/testing/fake.ts')).toBe(false);
    expect(isProductionSourceFile('packages/nexus-agents/src/types.d.ts')).toBe(false);
  });

  it('correctly matches paths regardless of directory prefixes or slashes', () => {
    expect(
      pathsMatch(
        'packages/nexus-agents/src/security/safe-path.ts',
        'packages/nexus-agents/src/security/safe-path.ts'
      )
    ).toBe(true);
    expect(
      pathsMatch('packages/nexus-agents/src/security/safe-path.ts', 'src/security/safe-path.ts')
    ).toBe(true);
    expect(
      pathsMatch('packages/nexus-agents/src/security/safe-path.ts', 'security/safe-path.ts')
    ).toBe(true);
    expect(
      pathsMatch(
        'packages/nexus-agents/src/security/safe-path.ts',
        'packages/nexus-agents/src/security/other.ts'
      )
    ).toBe(false);
  });
});

describe('Name the empty case (fail closed per .rules/development-disciplines.md)', () => {
  it('fails closed when manifest is empty (entries.length === 0)', () => {
    const result = checkSecurityEnforcementPoints({
      manifest: [],
      sourceFiles: ['packages/nexus-agents/src/foo.ts'],
      readFile: () => 'export const x = 1;',
    });

    expect(result.ok).toBe(false);
    expect(result.totalControls).toBe(0);
    expect(result.evaluatedControls).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/empty/i);
  });

  it('fails closed when zero source files are scanned', () => {
    const manifest: SecurityEnforcementEntry[] = [
      {
        id: 'test-control',
        description: 'Test control',
        symbol: 'enforceSecurity',
        sourceFile: 'packages/nexus-agents/src/security/guard.ts',
      },
    ];

    const result = checkSecurityEnforcementPoints({
      manifest,
      sourceFiles: [],
      readFile: () => '',
    });

    expect(result.ok).toBe(false);
    expect(result.totalControls).toBe(1);
    expect(result.scannedFilesCount).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/zero source files/i);
  });

  it('fails closed when expectedCount does not match manifest length', () => {
    const manifest: SecurityEnforcementEntry[] = [
      {
        id: 'control-1',
        description: 'First control',
        symbol: 'guardA',
        sourceFile: 'packages/nexus-agents/src/guard-a.ts',
      },
    ];

    const result = checkSecurityEnforcementPoints({
      manifest,
      expectedCount: 5,
      sourceFiles: ['packages/nexus-agents/src/app.ts'],
      readFile: () => 'guardA();',
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('expectedCount'))).toBe(true);
  });

  it('fails closed on duplicate control IDs in manifest', () => {
    const manifest: SecurityEnforcementEntry[] = [
      {
        id: 'duplicate-id',
        description: 'First instance',
        symbol: 'guardA',
        sourceFile: 'packages/nexus-agents/src/guard-a.ts',
      },
      {
        id: 'duplicate-id',
        description: 'Second instance',
        symbol: 'guardB',
        sourceFile: 'packages/nexus-agents/src/guard-b.ts',
      },
    ];

    const result = checkSecurityEnforcementPoints({
      manifest,
      sourceFiles: ['packages/nexus-agents/src/app.ts'],
      readFile: () => 'guardA(); guardB();',
    });

    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicate'))).toBe(true);
  });
});

describe('call site detection rules', () => {
  it('detects missing call sites and fails', () => {
    const manifest: SecurityEnforcementEntry[] = [
      {
        id: 'missing-control',
        description: 'Control with zero callers',
        symbol: 'uncalledGuard',
        sourceFile: 'packages/nexus-agents/src/security/guard.ts',
      },
    ];

    const result = checkSecurityEnforcementPoints({
      manifest,
      sourceFiles: [
        'packages/nexus-agents/src/security/guard.ts',
        'packages/nexus-agents/src/app.ts',
      ],
      readFile: (f) => {
        if (f.endsWith('guard.ts')) return 'export function uncalledGuard() {}';
        return 'const x = 42;';
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failed.length).toBe(1);
    expect(result.failed[0]?.controlId).toBe('missing-control');
    expect(result.failed[0]?.callSites.length).toBe(0);
    expect(result.passed.length).toBe(0);
  });

  it('rejects test-only call sites (#5039, #5041)', () => {
    const manifest: SecurityEnforcementEntry[] = [
      {
        id: 'test-only-control',
        description: 'Control only called in unit tests',
        symbol: 'authenticate',
        sourceFile: 'packages/nexus-agents/src/mcp/middleware/auth-handler.ts',
      },
    ];

    const result = checkSecurityEnforcementPoints({
      manifest,
      sourceFiles: [
        'packages/nexus-agents/src/mcp/middleware/auth-handler.ts',
        'packages/nexus-agents/src/mcp/middleware/auth-handler.test.ts',
        'packages/nexus-agents/src/testing/mock-auth.ts',
        'packages/nexus-agents/src/app.ts',
      ],
      readFile: (f) => {
        if (f.endsWith('auth-handler.ts')) {
          return 'export class AuthHandler { authenticate() { return true; } }';
        }
        if (f.endsWith('auth-handler.test.ts')) {
          return 'handler.authenticate();';
        }
        if (f.endsWith('mock-auth.ts')) {
          return 'mockHandler.authenticate();';
        }
        return 'console.log("running production app");';
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failed.length).toBe(1);
    expect(result.failed[0]?.controlId).toBe('test-only-control');
    expect(result.failed[0]?.callSites.length).toBe(0);
  });

  it('rejects barrel-only references (index.ts / exports/)', () => {
    const manifest: SecurityEnforcementEntry[] = [
      {
        id: 'barrel-only-control',
        description: 'Control only exported from barrel',
        symbol: 'safePathsRule',
        sourceFile: 'packages/nexus-agents/src/mcp/middleware/policy-rules.ts',
      },
    ];

    const result = checkSecurityEnforcementPoints({
      manifest,
      sourceFiles: [
        'packages/nexus-agents/src/mcp/middleware/policy-rules.ts',
        'packages/nexus-agents/src/index.ts',
        'packages/nexus-agents/src/exports/security.ts',
        'packages/nexus-agents/src/app.ts',
      ],
      readFile: (f) => {
        if (f.endsWith('policy-rules.ts')) return 'export const safePathsRule = {};';
        if (f.endsWith('index.ts')) return 'export { safePathsRule } from "./policy-rules.js";';
        if (f.endsWith('exports/security.ts'))
          return 'export { safePathsRule } from "../mcp/middleware/policy-rules.js";';
        return 'const running = true;';
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failed.length).toBe(1);
  });

  it('does not count declaration in sourceFile as an external call site', () => {
    const manifest: SecurityEnforcementEntry[] = [
      {
        id: 'self-defined-control',
        description: 'Control only appearing in its own declaring file',
        symbol: 'resolveInsideRoot',
        sourceFile: 'packages/nexus-agents/src/security/safe-path.ts',
      },
    ];

    const result = checkSecurityEnforcementPoints({
      manifest,
      sourceFiles: [
        'packages/nexus-agents/src/security/safe-path.ts',
        'packages/nexus-agents/src/app.ts',
      ],
      readFile: (f) => {
        if (f.endsWith('safe-path.ts')) {
          return 'export function resolveInsideRoot(path: string) { return path; }';
        }
        return 'const ready = true;';
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failed.length).toBe(1);
  });

  it('ignores comments mentioning the symbol in prose', () => {
    const manifest: SecurityEnforcementEntry[] = [
      {
        id: 'commented-symbol',
        description: 'Control mentioned only in a comment',
        symbol: 'sanitizeInput',
        sourceFile: 'packages/nexus-agents/src/security/input-sanitizer.ts',
      },
    ];

    const result = checkSecurityEnforcementPoints({
      manifest,
      sourceFiles: [
        'packages/nexus-agents/src/security/input-sanitizer.ts',
        'packages/nexus-agents/src/app.ts',
      ],
      readFile: (f) => {
        if (f.endsWith('input-sanitizer.ts')) {
          return 'export function sanitizeInput() {}';
        }
        return `
          // TODO: we should call sanitizeInput(val) here someday
          /*
           * Multi-line comment:
           * sanitizeInput(data);
           */
          const live = true;
        `;
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failed.length).toBe(1);
  });

  it('passes when a valid production call site exists', () => {
    const manifest: SecurityEnforcementEntry[] = [
      {
        id: 'valid-control',
        description: 'Control with live production caller',
        symbol: 'sanitizeInput',
        sourceFile: 'packages/nexus-agents/src/security/input-sanitizer.ts',
      },
    ];

    const result = checkSecurityEnforcementPoints({
      manifest,
      sourceFiles: [
        'packages/nexus-agents/src/security/input-sanitizer.ts',
        'packages/nexus-agents/src/security/input-sanitizer.test.ts',
        'packages/nexus-agents/src/pipeline/orchestrator.ts',
      ],
      readFile: (f) => {
        if (f.endsWith('input-sanitizer.ts')) {
          return 'export function sanitizeInput(input: string) { return input; }';
        }
        if (f.endsWith('input-sanitizer.test.ts')) {
          return 'expect(sanitizeInput("foo")).toBe("foo");';
        }
        return 'const clean = sanitizeInput(untrustedInput);';
      },
    });

    expect(result.ok).toBe(true);
    expect(result.passed.length).toBe(1);
    expect(result.failed.length).toBe(0);
    expect(result.passed[0]?.callSites.length).toBe(1);
    expect(result.passed[0]?.callSites[0]?.file).toBe(
      'packages/nexus-agents/src/pipeline/orchestrator.ts'
    );
  });

  it('supports custom callPattern regexes', () => {
    const manifest: SecurityEnforcementEntry[] = [
      {
        id: 'custom-pattern-control',
        description: 'Control with custom regex pattern',
        symbol: 'safePathsRule',
        sourceFile: 'packages/nexus-agents/src/mcp/middleware/policy-rules.ts',
        callPattern: /firewall\.addRule\(\s*safePathsRule\s*\)/,
      },
    ];

    const result = checkSecurityEnforcementPoints({
      manifest,
      sourceFiles: [
        'packages/nexus-agents/src/mcp/middleware/policy-rules.ts',
        'packages/nexus-agents/src/mcp/middleware/policy.ts',
      ],
      readFile: (f) => {
        if (f.endsWith('policy-rules.ts')) {
          return 'export const safePathsRule = {};';
        }
        return 'firewall.addRule(safePathsRule);';
      },
    });

    expect(result.ok).toBe(true);
    expect(result.passed.length).toBe(1);
  });
});

describe('real repository security controls verification', () => {
  it('verifies that every entry in DEFAULT_SECURITY_MANIFEST has live production call sites', () => {
    const result = checkSecurityEnforcementPoints();

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.totalControls).toBe(DEFAULT_SECURITY_MANIFEST.length);
    expect(result.passed.length).toBe(DEFAULT_SECURITY_MANIFEST.length);
    expect(result.scannedFilesCount).toBeGreaterThan(50);

    for (const passed of result.passed) {
      expect(passed.callSites.length).toBeGreaterThan(0);
      for (const site of passed.callSites) {
        expect(isTestFile(site.file)).toBe(false);
        expect(isBarrelFile(site.file)).toBe(false);
        expect(isDeclarationFile(site.file)).toBe(false);
        expect(pathsMatch(site.file, passed.sourceFile)).toBe(false);
      }
    }
  });

  it('flags AuthHandler.authenticate when added as an unenforced control (#5039, #5041)', () => {
    // Real-world historical verification: AuthHandler.authenticate was in SECURITY.md
    // and had test call sites in auth-handler.test.ts, but zero production callers.
    const manifestWithUncalled: SecurityEnforcementEntry[] = [
      {
        id: 'auth-handler-authenticate',
        description: 'AuthHandler.authenticate token validation',
        symbol: 'authenticate',
        sourceFile: 'packages/nexus-agents/src/mcp/middleware/auth-handler.ts',
        callPattern: /\bhandler\.authenticate\s*\(|\.authenticate\s*\(/,
      },
    ];

    const result = checkSecurityEnforcementPoints({
      manifest: manifestWithUncalled,
    });

    expect(result.ok).toBe(false);
    expect(result.failed.length).toBe(1);
    expect(result.failed[0]?.controlId).toBe('auth-handler-authenticate');
    expect(result.failed[0]?.callSites.length).toBe(0);
  });

  it('main() returns exit code 0 when run against current repo', () => {
    const code = main();
    expect(code).toBe(0);
  });
});

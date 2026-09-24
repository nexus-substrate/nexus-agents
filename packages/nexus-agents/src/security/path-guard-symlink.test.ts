/**
 * Every non-MCP-tool path containment guard must be realpath-aware: a symlink
 * inside the root whose target is outside it is rejected, and a symlink whose
 * target stays inside the root is accepted. A lexical `path.resolve` +
 * `startsWith(root + sep)` check accepts both, so each site is exercised
 * against the same fixture rather than trusting that it calls the helper.
 * The MCP-tool sites live in `mcp/tools/path-containment-symlink.test.ts`.
 *
 * @module security/path-guard-symlink.test
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { join } from 'node:path';
import {
  createSymlinkEscapeFixture,
  type SymlinkEscapeFixture,
} from '../testing/symlink-escape-fixture.js';
import { runAstQaRules } from './ast-rule-runner.js';
import { PolicySandboxExecutor } from './sandbox/sandbox-executor.js';
import { STANDARD_POLICY } from './sandbox/default-policies.js';
import type { SandboxExecutionOptions } from './sandbox/sandbox-types.js';
import { runWorkflowRun } from '../cli/workflow-run.js';
import { validateConfigPath } from '../cli/custom-expert-validation.js';
import { resolveFilePath } from '../cli/config-command-helpers.js';
import { isPathSafe } from '../mcp/middleware/policy-helpers.js';

const RULES_DIR = join(import.meta.dirname, 'ast-rules');

describe('path guards follow symlinks', () => {
  let fx: SymlinkEscapeFixture;
  /** The canonical directory `fx.linkIn` resolves to. */
  let realDir: string;

  beforeEach(() => {
    fx = createSymlinkEscapeFixture();
    realDir = join(fx.insideDir, 'real');
  });

  afterEach(() => {
    fx.cleanup();
  });

  describe('ast-rule-runner targetDir (cwd root)', () => {
    it('rejects a symlink escape', async () => {
      await expect(runAstQaRules({ rulesDir: RULES_DIR, targetDir: fx.linkOut })).rejects.toThrow(
        /Path traversal denied/
      );
    });

    it('accepts an inside symlink', async () => {
      await expect(runAstQaRules({ rulesDir: RULES_DIR, targetDir: fx.linkIn })).resolves.toEqual(
        []
      );
    });
  });

  describe('workflow run --input file (cwd root)', () => {
    it('rejects a symlink escape', async () => {
      const result = await runWorkflowRun({
        name: 'code-review',
        input: join(fx.linkOut, 'feed.json'),
        dryRun: true,
        verbose: undefined,
      });
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/Path traversal detected/);
    });

    it('accepts an inside symlink', async () => {
      const result = await runWorkflowRun({
        name: 'code-review',
        input: join(fx.linkIn, 'feed.json'),
        dryRun: true,
        verbose: undefined,
      });
      // The file is read; `[]` then fails input validation, not the guard.
      expect(result.message).not.toMatch(/Path traversal detected/);
    });
  });

  describe('custom expert validateConfigPath', () => {
    it('rejects a symlink escape', () => {
      expect(validateConfigPath(join(fx.linkOut, 'feed.json'), fx.insideDir).ok).toBe(false);
    });

    it('accepts an inside symlink and returns the canonical path', () => {
      const r = validateConfigPath(join(fx.linkIn, 'feed.json'), fx.insideDir);
      expect(r.ok && r.value).toBe(join(realDir, 'feed.json'));
    });
  });

  describe('config command resolveFilePath', () => {
    it('rejects a symlink escape', () => {
      expect(() => resolveFilePath(join(fx.linkOut, 'feed.json'), fx.insideDir)).toThrow(
        /Path traversal detected/
      );
    });

    it('accepts an inside symlink and returns the canonical path', () => {
      expect(resolveFilePath(join(fx.linkIn, 'feed.json'), fx.insideDir)).toBe(
        join(realDir, 'feed.json')
      );
    });
  });

  describe('policy firewall isPathSafe', () => {
    it('rejects a symlink escape', () => {
      expect(isPathSafe(join(fx.linkOut, 'a.ts'), [fx.insideDir])).toBe(false);
    });

    it('accepts an inside symlink', () => {
      expect(isPathSafe(join(fx.linkIn, 'a.ts'), [fx.insideDir])).toBe(true);
    });
  });

  describe('sandbox executor cwd', () => {
    const executor = new PolicySandboxExecutor();
    const options = (cwd: string): SandboxExecutionOptions => ({
      cwd,
      policy: { ...STANDARD_POLICY, pathRules: [{ path: fx.insideDir, access: 'read' }] },
    });

    it('rejects a symlink escape', () => {
      const result = executor.validate('echo', [], options(fx.linkOut));
      expect(result.violations.map((v) => v.type)).toContain('path');
    });

    it('accepts an inside symlink', () => {
      const result = executor.validate('echo', [], options(fx.linkIn));
      expect(result.violations.map((v) => v.type)).not.toContain('path');
    });
  });
});

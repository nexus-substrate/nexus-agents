/**
 * Claude CLI read-only analysis mode — live smoke test (#6754).
 *
 * Runs the real `claude` binary with the argv the adapter builds for a
 * read-only task and asks it to use Bash. Opt-in and never part of CI: it
 * needs the binary, an authenticated account and one model call.
 *
 * Run via: CLAUDE_READ_ONLY_E2E=true pnpm vitest run src/cli-adapters/adapters/claude-read-only.e2e.test.ts
 *
 * Measured on claude 2.1.281 when this was written: WITHOUT the read-only
 * flags the model issued a Bash tool call (recorded in `permission_denials`);
 * WITH them Bash was not offered at all and the denial list was empty. The
 * assertion is the second half: no Bash request reaches the permission layer,
 * and the marker file is not created.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CliTask } from '../types.js';
import type { CommandConfig } from '../subprocess-adapter.js';
import { ClaudeCliAdapter } from './claude-adapter.js';

const OPTED_IN = process.env['CLAUDE_READ_ONLY_E2E'] === 'true';

function claudeOnPath(): boolean {
  try {
    execFileSync('claude', ['--version'], { timeout: 10_000, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

class ClaudeProbe extends ClaudeCliAdapter {
  command(task: CliTask): CommandConfig {
    return this.getCommand(task);
  }
}

interface ClaudeJson {
  readonly is_error?: boolean;
  readonly permission_denials?: ReadonlyArray<{ readonly tool_name?: string }>;
}

describe.skipIf(!OPTED_IN || !claudeOnPath())('claude read-only analysis (live)', () => {
  it('a Bash request under the read-only argv is never made and creates nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexus-ro-smoke-'));
    const marker = join(dir, 'marker.txt');
    try {
      const { args } = new ClaudeProbe({ model: 'claude-haiku' }).command({
        content: '',
        accessMode: 'read-only-analysis',
      });
      const run = spawnSync('claude', args, {
        input: `Use the Bash tool to run exactly: touch ${marker} . Then reply DONE, or NOBASH if you could not.`,
        encoding: 'utf8',
        timeout: 120_000,
      });
      const parsed = JSON.parse(run.stdout) as ClaudeJson;
      expect(parsed.is_error).not.toBe(true);
      const bashDenials = (parsed.permission_denials ?? []).filter((d) => d.tool_name === 'Bash');
      expect(bashDenials).toEqual([]);
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 150_000);
});

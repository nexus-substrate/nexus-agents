/**
 * The plugin's fitness-gate hook must never turn "could not read a score"
 * into a score (#5445).
 *
 * The old hook grepped the wrong scorer's output for a key that was never
 * printed, defaulted to 0, and refused every push while the real score was
 * 100. These tests drive the real shell script through its test seam
 * (`NEXUS_FITNESS_CLI`, a stand-in for the built CLI) so each of the three
 * states — scorer absent, scorer ran but unreadable, score read — is
 * reachable without a build.
 *
 * @module scripts/fitness-gate-hook.test
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ROOT } from './script-paths.js';

const HOOK = join(ROOT, 'hooks/fitness-gate.sh');
const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A fake `dist/cli.js` that prints `stdout` for `fitness-audit --format=json`. */
function fakeCli(stdout: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'fitness-hook-'));
  dirs.push(dir);
  const cli = join(dir, 'cli.js');
  writeFileSync(cli, `process.stdout.write(${JSON.stringify(stdout)});\n`);
  chmodSync(cli, 0o755);
  return cli;
}

function runHook(cli: string | undefined): {
  status: number | null;
  stderr: string;
  stdout: string;
} {
  const env = { ...process.env };
  if (cli === undefined) env['NEXUS_FITNESS_CLI'] = join(tmpdir(), 'no-such-cli-5445.js');
  else env['NEXUS_FITNESS_CLI'] = cli;
  const r = spawnSync('bash', [HOOK], { cwd: ROOT, env, encoding: 'utf8' });
  return { status: r.status, stderr: r.stderr, stdout: r.stdout };
}

describe('fitness-gate hook (#5445)', () => {
  it('passes when the canonical scorer reports a score at or above the bar', () => {
    const r = runHook(fakeCli(JSON.stringify({ score: 100, dimensions: {} })));

    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Fitness 100');
  });

  it('refuses when the score is below the bar, naming the real number', () => {
    const r = runHook(fakeCli(JSON.stringify({ score: 89 })));

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Fitness score 89 is below threshold 90');
  });

  it('refuses — and says why — when the scorer output has no readable score', () => {
    // The #5445 shape: the old scorer printed a human-readable box. That must
    // be an error, not a 0 that then fails the threshold for the wrong reason.
    const r = runHook(fakeCli('╔══ FITNESS SCORE ══╗\nTotal: 100/100\n'));

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('no numeric `score` could be read');
    expect(r.stderr).not.toContain('score 0 is below');
  });

  it('refuses on JSON that parses but carries no numeric score', () => {
    const r = runHook(fakeCli(JSON.stringify({ score: 'high' })));

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('no numeric `score`');
  });

  it('skips with exit 0 when there is no built CLI, and says it skipped', () => {
    // Fails open by design (#1830) — but the message must say "skipped",
    // never report a score.
    const r = runHook(undefined);

    expect(r.status).toBe(0);
    expect(r.stderr).toContain('skipped (not a score)');
    expect(r.stdout).not.toContain('Fitness');
  });
});

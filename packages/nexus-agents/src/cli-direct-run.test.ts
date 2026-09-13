/**
 * Tests for the CLI direct-run guard (#6102).
 *
 * The unit cases pin the argv[1] shapes the guard must accept and decline.
 * The spawn case is the reproduction from the issue: before #6102,
 * `tsx src/cli.ts --help` printed nothing and exited 0, because the guard only
 * recognised the built `cli.js` and the `nexus-agents` bin.
 *
 * @module cli-direct-run.test
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { isDirectRun } from './cli-direct-run.js';

describe('isDirectRun', () => {
  it.each([
    ['/x/cli.ts', 'the source entry under tsx'],
    ['/x/src/cli.ts', 'the source entry by package-relative path'],
    ['/x/cli.js', 'the built entry'],
    ['/usr/bin/nexus-agents', 'the installed bin'],
    ['/x/node_modules/.bin/nexus-agents', 'the local .bin shim'],
  ])('accepts %s (%s)', (argv1) => {
    expect(isDirectRun(argv1)).toBe(true);
  });

  it.each([
    ['/x/vitest.mjs', 'a test runner importing the module'],
    ['/x/some-other-entry.js', 'another entry importing the module'],
    ['/x/src/cli/index.js', 'a different module under src/cli/'],
  ])('declines %s (%s)', (argv1) => {
    expect(isDirectRun(argv1)).toBe(false);
  });

  it('declines when argv[1] is absent (e.g. `node -e`)', () => {
    expect(isDirectRun(undefined)).toBe(false);
  });
});

describe('tsx src/cli.ts --help (#6102 reproduction)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const packageDir = resolve(here, '..');
  const cliSource = resolve(here, 'cli.ts');
  // The `.bin/tsx` entry is a shell shim, so spawn the package's own CLI
  // module under the current node instead of relying on PATH.
  const tsxCli = createRequire(import.meta.url).resolve('tsx/cli');

  it('prints the usage text instead of exiting 0 with no output', () => {
    const result = spawnSync(process.execPath, [tsxCli, cliSource, '--help'], {
      cwd: packageDir,
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...process.env, NEXUS_LOG_LEVEL: 'error' },
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(0);
    expect(result.stdout).toContain('USAGE:');
    expect(result.stdout).toContain('nexus-agents [COMMAND] [SUBCOMMAND] [OPTIONS]');
  }, 90_000);
});

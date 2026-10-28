/** Actual direct-entry/import behavior with missing owned policy (#7678). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const entrySource = join(root, 'scripts/check-governor-review.ts');
const pathComponents = ['plain', 'with space', 'with#hash', 'with%percent', 'with-雪'];
let fixture: string;

beforeEach(() => {
  fixture = mkdtempSync(join(root, '.governor-entry-test-'));
  mkdirSync(join(fixture, 'empty-policy'));
});
afterEach(() => {
  rmSync(fixture, { recursive: true, force: true });
});

function fixtureEntry(component: string): string {
  const checkout = join(fixture, component);
  const entry = join(checkout, 'scripts/check-governor-review.ts');
  mkdirSync(dirname(entry), { recursive: true });
  copyFileSync(entrySource, entry);
  symlinkSync(join(root, 'packages'), join(checkout, 'packages'), 'dir');
  for (const helper of [
    'governor-section.ts',
    'script-paths.ts',
    'governor-review-panel-coverage.ts',
  ]) {
    symlinkSync(join(root, 'scripts', helper), join(checkout, 'scripts', helper));
  }
  return entry;
}

function invoke(args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, ['--import', 'tsx', ...args], {
    cwd: fixture,
    env: { PATH: '', HOME: fixture, NEXUS_SCRIPT_ROOT: join(fixture, 'empty-policy') },
    encoding: 'utf8',
    timeout: 20_000,
  });
}

describe('governor review CLI entry boundary', () => {
  it.each(pathComponents)(
    'rejects missing owned policy when invoked directly under %s',
    (component) => {
      // Missing CODEOWNERS fails before ledger reads or git/GitHub context resolution.
      const result = invoke([fixtureEntry(component)]);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('[governor-review] FAIL (integrity, fail-closed):');
      expect(result.stderr).toContain(
        "governor section start directive '# @governor-section-start'"
      );
      expect(result.stdout).toBe('');
    }
  );

  it.each(pathComponents)('imports without evaluating the gate under %s', (component) => {
    const url = pathToFileURL(fixtureEntry(component)).href;
    const result = invoke([
      '--input-type=module',
      '--eval',
      `await import(${JSON.stringify(url)}); console.log('TEST_IMPORT_COMPLETE');`,
    ]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe('TEST_IMPORT_COMPLETE\n');
  });
});

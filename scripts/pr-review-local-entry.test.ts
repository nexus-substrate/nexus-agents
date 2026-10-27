/** Actual CLI entry/import behavior for encoded filesystem paths (#7655). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const entrySource = join(root, 'scripts/pr-review-local.ts');
const pathComponents = ['plain', 'with space', 'with#hash', 'with%percent', 'with-雪'];
let fixture: string;

beforeEach(() => {
  fixture = mkdtempSync(join(root, '.entry-test-'));
});
afterEach(() => {
  rmSync(fixture, { recursive: true, force: true });
});

function fixtureEntry(component: string): string {
  const checkout = join(fixture, component);
  const entry = join(checkout, 'scripts/pr-review-local.ts');
  mkdirSync(dirname(entry), { recursive: true });
  copyFileSync(entrySource, entry);
  symlinkSync(join(root, 'packages'), join(checkout, 'packages'), 'dir');
  symlinkSync(
    join(root, 'scripts/pr-review-local-ledger.ts'),
    join(checkout, 'scripts/pr-review-local-ledger.ts')
  );
  return entry;
}

function invoke(args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, ['--import', 'tsx', ...args], {
    cwd: fixture,
    env: { PATH: '', HOME: fixture },
    encoding: 'utf8',
    timeout: 20_000,
  });
}

describe('local PR review CLI entry boundary', () => {
  it.each(pathComponents)('prints usage when invoked directly under %s', (component) => {
    const result = invoke([fixtureEntry(component)]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage: pr-review-local.ts <pr-number>');
    expect(result.stdout).toBe('');
  });

  it.each(pathComponents)('imports without running under %s', (component) => {
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

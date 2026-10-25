import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const wrapper = join(root, 'scripts', 'audit-remarque.mjs');
const run = (...args) =>
  spawnSync(process.execPath, [wrapper, ...args], { cwd: root, encoding: 'utf8' });

test('the served palette passes the audit and drift check', () => {
  const r = run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /remarque-audit: passed=true/);
});

test('an out-of-gamut site override fails the audit', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'nexus-remarque-audit-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  // The pre-fix syntax constant: outside sRGB at this lightness and chroma.
  const fixture = join(dir, 'tokens.css');
  const served = await readFile(join(root, 'src/styles/tokens.css'), 'utf8');
  await writeFile(
    fixture,
    `${served}\n:root { --color-syntax-constant: oklch(0.505 0.105 85); }\n`
  );
  const r = run('--tokens', fixture);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /remarque-audit: passed=false/);
  // The fixture also misses dark-theme contrast; pin the gamut rule itself.
  assert.match(r.stderr, /--color-syntax-constant .* outside sRGB gamut/);
});

test('--json-out without a file is a usage error, not a silent pass', () => {
  for (const args of [['--json-out'], ['--json-out', '--tokens', 'x']]) {
    const r = run(...args);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, /--json-out needs a file argument/);
  }
});

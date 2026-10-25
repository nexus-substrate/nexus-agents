#!/usr/bin/env node
/**
 * Runs remarque-audit and remarque-drift against the palette this site
 * actually serves: remarque's tokens-palette.css followed by this site's
 * overrides in src/styles/tokens.css. Concatenating makes the later
 * declaration win, as in the browser, for equal-specificity :root
 * declarations; a package token redeclared under a more specific selector
 * (e.g. `:root.dark`) would not be overridden this way. Auditing the package
 * file alone passes no matter what the overrides do, e.g. an out-of-gamut
 * value.
 *
 *   node scripts/audit-remarque.mjs [--json-out file] [--tokens file]
 *
 * Prints a one-line summary per tool and exits 1 if either fails, 2 on a
 * usage error. --json-out writes the full audit report; --tokens replaces
 * src/styles/tokens.css (used by the test's fixture palette).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
function option(name) {
  const i = process.argv.indexOf(name);
  if (i === -1) return undefined;
  const value = process.argv[i + 1];
  if (value === undefined || value.startsWith('--')) {
    console.error(`${name} needs a file argument`);
    process.exit(2);
  }
  return value;
}
const jsonOut = option('--json-out');
const tokens = resolve(option('--tokens') ?? join(root, 'src/styles/tokens.css'));

const packagePalette = require.resolve('remarque-tokens/tokens-palette.css');
const packageDir = dirname(packagePalette);
const merged = [readFileSync(packagePalette, 'utf8'), readFileSync(tokens, 'utf8')].join('\n');
const tmp = mkdtempSync(join(tmpdir(), 'remarque-palette-'));
// 'exit' listeners run synchronously on process.exit, so every path cleans up.
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));
const palette = join(tmp, 'palette.css');
writeFileSync(palette, merged);

function run(script, args) {
  const r = spawnSync(process.execPath, [join(packageDir, 'scripts', script), ...args], {
    cwd: root,
    encoding: 'utf8',
  });
  try {
    return { report: JSON.parse(r.stdout), status: r.status };
  } catch {
    console.error(`${script}: unparseable output\n${r.stdout}\n${r.stderr}`);
    process.exit(1);
  }
}

const audit = run('audit.mjs', ['--palette', palette, '--src', 'src', '--json']);
// The report's own `palette` is the temp file, deleted on exit; name the real inputs.
const inputs = [packagePalette, tokens];
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ ...audit.report, inputs }, null, 2));
const drift = run('drift-check.mjs', ['--css-file', palette, '--package-dir', '.', '--json']);

const a = audit.report;
console.log(
  `remarque-audit: passed=${a.passed} failures=${a.failures.length} warnings=${a.warnings.length}`
);
console.log(
  `remarque-drift: passed=${drift.report.passed} ${JSON.stringify(drift.report.summary)}`
);
for (const f of a.failures) console.error(`  audit failure: ${f}`);
process.exit(audit.status === 0 && a.passed && drift.status === 0 && drift.report.passed ? 0 : 1);

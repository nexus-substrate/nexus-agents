/** Actual review-loop entry/import boundaries, layout A (#7682).
 * Eval's empty data/learning is precreated independently for BOTH modes.
 * Its idempotent mkdir calls remain on the source path; native call counts and
 * fresh initialization are unmeasured. Retained layout is not zero FS calls,
 * zero transient writes, async/all-FS isolation, OS cwd/sandbox, lexical original
 * import.meta, worker, or cross-platform proof. No live review loop is claimed.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ScriptEntryFixture, type EntryResult } from './fixtures/script-entry-fixture.js';
import { assertValidEntry } from './fixtures/script-entry-assertions.js';

const paths = ['plain', 'with space', 'with#hash', 'with%percent', 'with-雪'];
const scripts = [
  'meta-shadow-soak.ts',
  'pr-review-eval-run.ts',
  'curate-pr-review-dataset.ts',
  'curate-pr-review-harvest.ts',
  'mine-pr-review-candidates.ts',
] as const;
type Script = (typeof scripts)[number];
type Mode = 'direct' | 'import';
interface RetainedEntry {
  readonly path: string;
  readonly type: 'directory' | 'file' | 'symlink';
  readonly mode: number;
  readonly sha256?: string;
  readonly target?: string;
}
let fixture: ScriptEntryFixture | undefined;
afterEach(() => fixture?.close());

function sourceHash(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Measure retained owned state, excluding only existing instrumentation/TMP. */
function retainedTree(root: string): RetainedEntry[] {
  const entries: RetainedEntry[] = [];
  function visit(path: string, relative: string): void {
    const stat = lstatSync(path);
    const mode = stat.mode & 0o777;
    if (stat.isSymbolicLink()) {
      entries.push({ path: relative, type: 'symlink', mode, target: readlinkSync(path) });
    } else if (stat.isDirectory()) {
      entries.push({ path: relative, type: 'directory', mode });
      for (const name of readdirSync(path).sort()) {
        const child = relative === '.' ? name : `${relative}/${name}`;
        if (['tmp', 'attempts.jsonl', 'boundary-details.jsonl', 'timeline.jsonl'].includes(child)) {
          continue;
        }
        visit(join(path, name), child);
      }
    } else {
      entries.push({ path: relative, type: 'file', mode, sha256: sourceHash(path) });
    }
  }
  visit(root, '.');
  return entries;
}

function prepareLayout(owned: ScriptEntryFixture, script: Script): void {
  if (script !== 'pr-review-eval-run.ts') return;
  mkdirSync(join(owned.directory, 'data'), { mode: 0o700 });
  mkdirSync(join(owned.directory, 'data/learning'), { mode: 0o700 });
}

function assertLayout(owned: ScriptEntryFixture, script: Script): void {
  const data = join(owned.directory, 'data');
  if (script === 'pr-review-eval-run.ts') {
    const learning = join(data, 'learning');
    for (const directory of [data, learning]) {
      expect(lstatSync(directory).isDirectory()).toBe(true);
      expect(lstatSync(directory).mode & 0o777).toBe(0o700);
    }
    expect(readdirSync(data)).toEqual(['learning']);
    expect(readdirSync(learning)).toEqual([]);
  } else {
    expect(existsSync(data)).toBe(false);
  }
  expect(readdirSync(owned.policyRoot)).toEqual([]);
  const checkout = dirname(dirname(owned.entry));
  expect(existsSync(join(checkout, 'testing'))).toBe(false);
  expect(existsSync(join(checkout, 'docs'))).toBe(false);
}

function recordLayout(
  owned: ScriptEntryFixture,
  script: Script,
  mode: Mode,
  result: EntryResult,
  layouts: { before: RetainedEntry[]; after: RetainedEntry[] }
): void {
  const file = process.env['NEXUS_ENTRY_LAYOUT_EVIDENCE_FILE'];
  if (file === undefined) return;
  appendFileSync(
    file,
    JSON.stringify({ script, mode, entry: owned.entry, pid: result.process.pid, ...layouts }) + '\n'
  );
}

function diagnostic(owned: ScriptEntryFixture, script: Script, result: EntryResult): void {
  const { status, stdout, stderr } = result.process;
  expect(status).toBe(1);
  if (script === 'meta-shadow-soak.ts') {
    expect(stdout).toBe('');
    expect(stderr).toBe(
      '::error::NEXUS_META_SHADOW_TRAIN=1 is not set (or learning persistence is disabled). ' +
        'This soak is a no-op without it — see docs/getting-started/CONFIGURATION.md.\n'
    );
  } else if (script === 'curate-pr-review-dataset.ts') {
    expect(stdout).toBe('');
    expect(stderr).toBe('usage: curate-pr-review-dataset.ts <validate|stats|add>\n');
  } else if (script === 'curate-pr-review-harvest.ts') {
    expect(stdout).toBe('');
    expect(stderr).toBe('usage: curate-pr-review-harvest.ts harvest [--limit N] [--out PATH]\n');
  } else {
    const evalRun = script === 'pr-review-eval-run.ts';
    const root = evalRun ? owned.policyRoot : dirname(dirname(owned.entry));
    expect(stdout).toBe(
      evalRun
        ? 'Running pr_review v6 eval batch — LIVE panel (requires model auth: a CLI ' +
            'adapter or ANTHROPIC_API_KEY). See the module doc for the stub-panel test path.\n'
        : 'Mining up to 50 merged PRs from nexus-substrate/nexus-agents (minAgeDays=0) …\n'
    );
    expect(stderr).toContain('Error: ENOENT:');
    expect(stderr).toContain(join(root, 'testing/datasets/pr-review-sample.json'));
    expect(stderr).toContain(evalRun ? 'at loadDatasetFromDisk (' : 'at loadDatasetNumbers (');
  }
}

function actualCase(script: Script, component: string, mode: Mode): void {
  fixture = new ScriptEntryFixture(script, component);
  prepareLayout(fixture, script);
  assertLayout(fixture, script);
  const original = fileURLToPath(new URL(script, import.meta.url));
  const originalHash = sourceHash(original);
  expect(sourceHash(fixture.entry)).toBe(originalHash);
  const before = retainedTree(fixture.directory);
  const result = fixture.run(mode);
  const after = retainedTree(fixture.directory);
  recordLayout(fixture, script, mode, result, { before, after });
  assertValidEntry(result, fixture, mode);
  expect(Number.isInteger(result.process.pid)).toBe(true);
  expect(result.process.pid).toBeGreaterThan(0);
  expect(sourceHash(original)).toBe(originalHash);
  expect(sourceHash(fixture.entry)).toBe(originalHash);
  assertLayout(fixture, script);
  expect(after).toEqual(before);
  if (mode === 'direct') diagnostic(fixture, script, result);
  else {
    expect(result.process.status).toBe(0);
    expect(result.process.stdout).toBe('TEST_IMPORT_COMPLETE\n');
    expect(result.process.stderr).toBe('');
  }
}

describe('review-loop instrumentation qualification', () => {
  it.each(scripts)('qualifies plain direct/import safe branch for %s', (script) => {
    actualCase(script, 'plain', 'direct');
    fixture?.close();
    actualCase(script, 'plain', 'import');
  });
});

describe('actual review-loop module boundaries', () => {
  for (const script of scripts) {
    for (const component of paths) {
      for (const mode of ['direct', 'import'] as const) {
        it(`${script} ${mode} in ${component}`, () => {
          actualCase(script, component, mode);
        });
      }
    }
  }
});

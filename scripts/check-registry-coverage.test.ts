/**
 * Unit tests for check-registry-coverage.ts (#2406).
 *
 * Strategy:
 *   - isRegistryChanged + findMissingPeers are pure — test directly against
 *     synthetic registry/diff fixtures.
 *   - performCheck sits on top of git, fs, env. Test it via a temp-repo
 *     integration test similar to scripts/check-docops-skill.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  isRegistryChanged,
  findMissingPeers,
  getChangedFiles,
  extractMarkerEntries,
  isUnmeasurableManifest,
  extractAddedIdentifiers,
  checkPeerMentions,
} from './check-registry-coverage.js';

// ============================================================================
// Pure-function tests
// ============================================================================

describe('isRegistryChanged', () => {
  const registry = {
    name: 'TEST_REG',
    source: 'src/foo.ts',
    marker: 'export const TEST_REG',
    peer_files: ['src/foo-types.ts'],
    rationale: 'test',
  };

  it('returns false when source file not in changed-files set', () => {
    expect(isRegistryChanged(registry, ['src/other.ts'], () => '')).toBe(false);
  });

  it('returns true when diff has + or - line containing the marker', () => {
    const diff = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@ -1,3 +1,4 @@',
      '+export const TEST_REG: Foo[] = [',
      '+  { name: "new-entry" },',
      '+];',
    ].join('\n');
    const diffOf = (): string => diff;
    expect(isRegistryChanged(registry, ['src/foo.ts'], diffOf)).toBe(true);
  });

  it('returns false when source changed but marker line was not touched', () => {
    const diff = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
      '@@ -1,3 +1,4 @@',
      '-import { Old } from "./old.js";',
      '+import { New } from "./new.js";',
    ].join('\n');
    const diffOf = (): string => diff;
    expect(isRegistryChanged(registry, ['src/foo.ts'], diffOf)).toBe(false);
  });
});

// Structural-equivalence exemption (#2935) — marker line touched but the
// array entries are identical → cosmetic change (export keyword, comment,
// formatting) → gate should not fire.
describe('isRegistryChanged structural-equivalence exemption', () => {
  const registry = {
    name: 'TEST_REG',
    source: 'src/foo.ts',
    marker: 'TEST_REG',
    peer_files: ['src/foo-types.ts'],
    rationale: 'test',
  };

  // The diff touches the marker line — line-detection alone would fire.
  const markerTouchDiff = [
    '--- a/src/foo.ts',
    '+++ b/src/foo.ts',
    '@@ -1 +1 @@',
    '-const TEST_REG = [',
    '+export const TEST_REG = [',
  ].join('\n');

  it('exempts when before and after array entries are identical', () => {
    const oldContent = `const TEST_REG = ['a', 'b', 'c'] as const;`;
    const newContent = `export const TEST_REG = ['a', 'b', 'c'] as const;`;
    const diffOf = (): string => markerTouchDiff;
    const baseOf = (): string => oldContent;
    const currentOf = (): string => newContent;
    expect(isRegistryChanged(registry, ['src/foo.ts'], diffOf, baseOf, currentOf)).toBe(false);
  });

  it('still fires when entries actually changed', () => {
    const oldContent = `const TEST_REG = ['a', 'b'] as const;`;
    const newContent = `const TEST_REG = ['a', 'b', 'c'] as const;`;
    const diffOf = (): string => markerTouchDiff;
    const baseOf = (): string => oldContent;
    const currentOf = (): string => newContent;
    expect(isRegistryChanged(registry, ['src/foo.ts'], diffOf, baseOf, currentOf)).toBe(true);
  });

  it('falls back to line-based detection when pre-image fetch fails', () => {
    const diffOf = (): string => markerTouchDiff;
    const baseOf = (): string | null => null; // simulates `git show` failure
    const currentOf = (): string => `const TEST_REG = ['a'] as const;`;
    expect(isRegistryChanged(registry, ['src/foo.ts'], diffOf, baseOf, currentOf)).toBe(true);
  });

  it('falls back to line-based detection when current-file read fails', () => {
    const diffOf = (): string => markerTouchDiff;
    const baseOf = (): string => `const TEST_REG = ['a'] as const;`;
    const currentOf = (): string | null => null; // simulates fs read failure
    expect(isRegistryChanged(registry, ['src/foo.ts'], diffOf, baseOf, currentOf)).toBe(true);
  });
});

describe('isRegistryChanged moved_from relocation exemption (#3566)', () => {
  // Registry relocated: list moved from old.ts (marker OLD_REG) to new.ts
  // (marker NEW_REG), contents unchanged. The new source has no base.
  const registry = {
    name: 'RELOCATED',
    source: 'src/new.ts',
    marker: 'NEW_REG',
    peer_files: ['src/peer.ts'],
    rationale: 'test',
    moved_from: 'src/old.ts',
    moved_from_marker: 'OLD_REG',
  };
  const diffOf = (): string =>
    ['--- /dev/null', '+++ b/src/new.ts', '@@ -0,0 +1 @@', '+export const NEW_REG = ['].join('\n');

  it('exempts a no-op relocation (same entries under the old marker at base)', () => {
    const baseOf = (p: string): string | null =>
      p === 'src/old.ts' ? `const OLD_REG = ['a', 'b', 'c'] as const;` : null; // new.ts absent at base
    const currentOf = (): string => `export const NEW_REG = ['a', 'b', 'c'] as const;`;
    expect(isRegistryChanged(registry, ['src/new.ts'], diffOf, baseOf, currentOf)).toBe(false);
  });

  it('still fires when the relocation also changed entries', () => {
    const baseOf = (p: string): string | null =>
      p === 'src/old.ts' ? `const OLD_REG = ['a', 'b'] as const;` : null;
    const currentOf = (): string => `export const NEW_REG = ['a', 'b', 'c'] as const;`;
    expect(isRegistryChanged(registry, ['src/new.ts'], diffOf, baseOf, currentOf)).toBe(true);
  });
});

describe('extractMarkerEntries', () => {
  it('extracts a sorted, de-duplicated list', () => {
    const content = `const FOO = ['c', 'a', 'b', 'a'] as const;`;
    expect(extractMarkerEntries(content, 'FOO')).toEqual(['a', 'b', 'c']);
  });

  it('returns null when marker is absent', () => {
    expect(extractMarkerEntries('const OTHER = [1, 2];', 'FOO')).toBeNull();
  });

  it('returns null when the array has no string literals', () => {
    expect(extractMarkerEntries('const FOO = [1, 2, 3];', 'FOO')).toBeNull();
  });

  it('handles regex-special characters in the marker', () => {
    const content = `const FOO_BAR$ = ['x'] as const;`;
    expect(extractMarkerEntries(content, 'FOO_BAR$')).toEqual(['x']);
  });
});

describe('findMissingPeers', () => {
  const registry = {
    name: 'TEST_REG',
    source: 'src/foo.ts',
    marker: 'TEST_REG',
    peer_files: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
    rationale: 'test',
  };

  it('returns empty when all peers are in the changed-files set', () => {
    expect(findMissingPeers(registry, ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/foo.ts'])).toEqual(
      []
    );
  });

  it('returns the missing peers in declaration order', () => {
    expect(findMissingPeers(registry, ['src/a.ts', 'src/foo.ts'])).toEqual([
      'src/b.ts',
      'src/c.ts',
    ]);
  });

  it('returns all peers when none are in the changed-files set', () => {
    expect(findMissingPeers(registry, ['src/foo.ts'])).toEqual([
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
    ]);
  });
});

// ============================================================================
// Git-based getChangedFiles
// ============================================================================

interface RepoCtx {
  dir: string;
  origCwd: string;
  origBaseRef: string | undefined;
}

function git(repoDir: string, cmd: string): string {
  return execSync(`git -C "${repoDir}" ${cmd}`, { encoding: 'utf-8' });
}

function setupRepo(): RepoCtx {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reg-cov-test-'));
  const origCwd = process.cwd();
  const origBaseRef = process.env['GITHUB_BASE_REF'];

  git(dir, 'init -q -b main');
  git(dir, 'config user.email test@example.com');
  git(dir, 'config user.name Test');
  fs.writeFileSync(path.join(dir, 'README.md'), '# initial\n');
  git(dir, 'add README.md');
  git(dir, 'commit -q -m "initial commit"');

  process.chdir(dir);
  return { dir, origCwd, origBaseRef };
}

function teardownRepo(ctx: RepoCtx): void {
  process.chdir(ctx.origCwd);
  if (ctx.origBaseRef === undefined) {
    delete process.env['GITHUB_BASE_REF'];
  } else {
    process.env['GITHUB_BASE_REF'] = ctx.origBaseRef;
  }
  fs.rmSync(ctx.dir, { recursive: true, force: true });
}

describe('getChangedFiles', () => {
  let ctx: RepoCtx;

  beforeEach(() => {
    ctx = setupRepo();
  });

  afterEach(() => {
    teardownRepo(ctx);
  });

  it('walks the PR commit range when GITHUB_BASE_REF is set', () => {
    git(ctx.dir, 'checkout -q -b feature');
    fs.writeFileSync(path.join(ctx.dir, 'src-foo.ts'), 'export const X = 1;\n');
    fs.writeFileSync(path.join(ctx.dir, 'src-bar.ts'), 'export const Y = 2;\n');
    git(ctx.dir, 'add .');
    git(ctx.dir, 'commit -q -m "add foo and bar"');

    git(ctx.dir, 'update-ref refs/remotes/origin/main main');
    process.env['GITHUB_BASE_REF'] = 'main';

    const changed = getChangedFiles(ctx.dir);
    expect(changed).toContain('src-foo.ts');
    expect(changed).toContain('src-bar.ts');
  });

  it('falls back to HEAD~1 when no base ref is set', () => {
    delete process.env['GITHUB_BASE_REF'];
    fs.writeFileSync(path.join(ctx.dir, 'note.txt'), 'one\n');
    git(ctx.dir, 'add note.txt');
    git(ctx.dir, 'commit -q -m "add note"');

    const changed = getChangedFiles(ctx.dir);
    expect(changed).toContain('note.txt');
  });
});

describe('an empty manifest is unmeasured, not clean (#4586)', () => {
  it('treats zero declared registries as unmeasurable', () => {
    // `success: violations.length === 0` is satisfied by an empty manifest, so
    // emptying `registries` made the gate green while inspecting nothing — and
    // `validateManifest`'s bitrot loop had no entries to catch it either.
    expect(isUnmeasurableManifest(0)).toBe(true);
  });

  it('treats a populated manifest as measurable', () => {
    // The pair: without it, "always unmeasurable" would satisfy the test above.
    expect(isUnmeasurableManifest(1)).toBe(false);
    expect(isUnmeasurableManifest(12)).toBe(false);
  });
});

// ============================================================================
// Peer files must be AUTHORED sources, not generated artifacts (#5160)
// ============================================================================

describe('peer files name the authored source, not a generated artifact (#5160)', () => {
  const REPO = path.resolve(import.meta.dirname, '..');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(REPO, 'docs/ops/registry-coverage-manifest.json'), 'utf-8')
  ) as { registries: { name: string; peer_files: string[] }[] };

  it('CLAUDE.md is a generated artifact for harness-neutral content', () => {
    // The premise of the rule below. If this ever stops being true the rule
    // should be revisited rather than silently kept.
    const claude = fs.readFileSync(path.join(REPO, 'CLAUDE.md'), 'utf-8');
    expect(claude).toContain('<!-- GENERATED:FROM_AGENTS:START -->');
    expect(claude).toContain('DO NOT EDIT THIS BLOCK BY HAND');
  });

  it('no registry names CLAUDE.md as a peer file', () => {
    // Requiring an edit to CLAUDE.md requires an edit to a file the generator
    // overwrites. It is satisfied by running `pnpm governance:inject`, which
    // means the gate is measuring the generator's output rather than anyone's
    // intent — a touch-to-satisfy ritual, not coverage.
    //
    // The correct peer is the authored source: AGENTS.md for harness-neutral
    // prose, or the generator script itself. REGISTERED_TOOL_NAMES already
    // does the latter (it names scripts/inject-governance.ts), which is why
    // NEXUS_ENV_VARS was the only row with this defect.
    const offenders = manifest.registries
      .filter((r) => r.peer_files.includes('CLAUDE.md'))
      .map((r) => r.name);
    expect(offenders).toEqual([]);
  });

  it('NEXUS_ENV_VARS points at AGENTS.md and the full configuration doc', () => {
    const env = manifest.registries.find((r) => r.name === 'NEXUS_ENV_VARS');
    expect(env).toBeDefined();
    // Named explicitly rather than asserted as a set difference: the point is
    // WHICH file carries the table, and a subtractive assertion would pass if
    // the peer list were emptied altogether.
    expect(env?.peer_files).toContain('AGENTS.md');
    expect(env?.peer_files).toContain('docs/getting-started/CONFIGURATION.md');
  });

  it('the env-var table really does live in AGENTS.md', () => {
    // Without this the repoint above could point at a file that never
    // documents the variables, and every assertion here would still pass.
    const agents = fs.readFileSync(path.join(REPO, 'AGENTS.md'), 'utf-8');
    expect(agents).toContain('NEXUS_BILLING_MODE');
  });
});

// ============================================================================
// Peer-mention checking (#5222)
// ============================================================================

describe('extractAddedIdentifiers', () => {
  const PATTERN = '\\bNEXUS_[A-Z0-9_]+\\b';

  it('returns identifiers that appear only on added lines', () => {
    const diff = [
      '--- a/env-schema.ts',
      '+++ b/env-schema.ts',
      '   NEXUS_EXISTING: z.string().optional(),',
      '+  NEXUS_BRAND_NEW: z.string().optional(),',
    ].join('\n');
    expect(extractAddedIdentifiers(diff, PATTERN)).toEqual(['NEXUS_BRAND_NEW']);
  });

  it('ignores the +++/--- file headers, which are not content', () => {
    // A header like `+++ b/NEXUS_THING.ts` would otherwise be read as an added
    // identifier and demand documentation for a filename.
    const diff = ['--- a/NEXUS_OLD.ts', '+++ b/NEXUS_NEW.ts', '+  const x = 1;'].join('\n');
    expect(extractAddedIdentifiers(diff, PATTERN)).toEqual([]);
  });

  it('treats a rename as no net addition — the name appears on both sides', () => {
    // Removals are out of scope, and a moved line must not read as an addition.
    const diff = [
      '--- a/env-schema.ts',
      '+++ b/env-schema.ts',
      '-  NEXUS_MOVED: z.string(),',
      '+  NEXUS_MOVED: z.string().optional(),',
    ].join('\n');
    expect(extractAddedIdentifiers(diff, PATTERN)).toEqual([]);
  });

  it('reports a pure removal as no additions', () => {
    const diff = ['--- a/x.ts', '+++ b/x.ts', '-  NEXUS_GONE: z.string(),'].join('\n');
    expect(extractAddedIdentifiers(diff, PATTERN)).toEqual([]);
  });

  it('de-duplicates and sorts', () => {
    const diff = [
      '+++ b/x.ts',
      '+  NEXUS_B: z.string(), NEXUS_A: z.string(),',
      '+  NEXUS_B: z.string(),',
    ].join('\n');
    expect(extractAddedIdentifiers(diff, PATTERN)).toEqual(['NEXUS_A', 'NEXUS_B']);
  });

  it('returns nothing for an empty diff rather than throwing', () => {
    expect(extractAddedIdentifiers('', PATTERN)).toEqual([]);
  });
});

describe('checkPeerMentions', () => {
  const ADDED = ['NEXUS_ALPHA', 'NEXUS_BETA'];

  it('reports evaluated:false when no identifiers were added — NOT a pass', () => {
    // The load-bearing case. A pure removal, rename or reordering extracts
    // nothing, and reporting `satisfied` there would be a verdict over an empty
    // collection. The caller must fall back to the changed-file requirement.
    const result = checkPeerMentions([], new Map([['docs/x.md', 'anything']]));
    expect(result.evaluated).toBe(false);
    if (result.evaluated) throw new Error('expected an unevaluated result');
    expect(result.reason).toBe('no-identifiers-added');
  });

  it('passes when every added identifier appears in every peer', () => {
    const peers = new Map([
      ['AGENTS.md', 'we support NEXUS_ALPHA and NEXUS_BETA today'],
      ['docs/CONFIGURATION.md', 'NEXUS_BETA, NEXUS_ALPHA'],
    ]);
    const result = checkPeerMentions(ADDED, peers);
    expect(result.evaluated).toBe(true);
    if (!result.evaluated) throw new Error('expected an evaluated result');
    expect(result.undocumented).toEqual([]);
  });

  it('names the peer AND the identifier it is missing', () => {
    // This is the case the gate was built for and previously could not see: the
    // peer file WAS touched, so set-membership passed, but the new variable is
    // documented nowhere.
    const peers = new Map([
      ['AGENTS.md', 'we support NEXUS_ALPHA today'],
      ['docs/CONFIGURATION.md', 'NEXUS_ALPHA and NEXUS_BETA'],
    ]);
    const result = checkPeerMentions(ADDED, peers);
    expect(result.evaluated).toBe(true);
    if (!result.evaluated) throw new Error('expected an evaluated result');
    expect(result.undocumented).toEqual([{ peer: 'AGENTS.md', missing: ['NEXUS_BETA'] }]);
  });

  it('treats an unreadable peer as undocumented, never as satisfied', () => {
    // A peer that cannot be read yields no evidence of documentation. Failing
    // closed here matters because the read failure mode (renamed/deleted file)
    // is exactly when the docs are most likely wrong.
    const peers = new Map<string, string | null>([['AGENTS.md', null]]);
    const result = checkPeerMentions(ADDED, peers);
    expect(result.evaluated).toBe(true);
    if (!result.evaluated) throw new Error('expected an evaluated result');
    expect(result.undocumented).toEqual([{ peer: 'AGENTS.md', missing: ADDED }]);
  });

  it('reports every missing identifier, not just the first', () => {
    const peers = new Map([['AGENTS.md', 'nothing relevant here']]);
    const result = checkPeerMentions(ADDED, peers);
    expect(result.evaluated).toBe(true);
    if (!result.evaluated) throw new Error('expected an evaluated result');
    expect(result.undocumented[0]?.missing).toEqual(['NEXUS_ALPHA', 'NEXUS_BETA']);
  });
});

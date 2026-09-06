/**
 * The repo index carries no wall-clock stamp (#5461).
 *
 * `generated: new Date().toISOString()` changed exactly when the content
 * changed — the generator stripped it before comparing, so it never varied on
 * its own — while sitting on a single line that every regeneration rewrote.
 * Two PRs regenerating the artifact for unrelated reasons conflicted on that
 * line alone, and every `chore(release): version packages` regenerates it, so
 * open PRs went CONFLICTING at each release. A CONFLICTING PR gets zero
 * `pull_request` workflow runs, which reads as "no checks" rather than
 * "conflict".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

describe('repo index has no wall-clock stamp (#5461)', () => {
  it('artifacts/repo-index.json carries no `generated` field', () => {
    const index = JSON.parse(
      readFileSync(join(ROOT, 'artifacts/repo-index.json'), 'utf-8')
    ) as Record<string, unknown>;

    expect(index['generated']).toBeUndefined();
    // Proves the assertion above read the real artifact rather than an empty
    // object: `packageVersion` is content and stays.
    expect(index['packageVersion']).toEqual(expect.any(String));
    expect(index['generator']).toBe('scripts/generate-repo-index.ts');
  });

  it('docs/reference/capabilities.md carries no Generated line', () => {
    const md = readFileSync(join(ROOT, 'docs/reference/capabilities.md'), 'utf-8');

    expect(md).not.toMatch(/\*\*Generated:\*\*/);
    expect(md).toMatch(/\*\*Package Version:\*\*/);
  });
});

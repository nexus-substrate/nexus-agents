/** Execute the exact jq filters used by both real governor jobs. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './script-paths.js';
const source = readFileSync(join(ROOT, '.github/workflows/governor-review.yml'), 'utf8');
const filters = [...source.matchAll(/--paginate --jq '([^']*\.state == "APPROVED"[^']*)'/g)].map(
  (match) => match[1] ?? ''
);
const fixtures = [
  { state: 'APPROVED', user: { login: 'fixture-owner', type: 'User' } },
  { state: 'APPROVED', user: { login: 'github-actions[bot]', type: 'Bot' } },
  { state: 'APPROVED', user: { login: 'fixture-app', type: 'App' } },
  { state: 'APPROVED', user: { login: 'fixture-unknown' } },
  { state: 'APPROVED', user: { login: 'fixture[bot]', type: 'User' } },
  { state: 'APPROVED', user: { login: 'fixture[BOT]', type: 'User' } },
  { state: 'APPROVED', user: { login: '', type: 'User' } },
  { state: 'APPROVED', user: { type: 'User' } },
  { state: 'APPROVED', user: null },
  { state: 'CHANGES_REQUESTED', user: { login: 'fixture-owner', type: 'User' } },
];
describe('human-only governor approvals', () => {
  it('finds both the pre-merge and post-merge collectors', () => {
    expect(filters).toHaveLength(2);
  });
  it.each([0, 1])('collector %s excludes Bot, App, missing identity and bot logins', (index) => {
    const actual = execFileSync('jq', ['-r', filters[index] ?? 'error("missing filter")'], {
      input: JSON.stringify(fixtures),
      encoding: 'utf8',
      timeout: 10000,
    });
    expect(actual).toBe('fixture-owner\n');
  });
  it.each([0, 1])('collector %s names empty approval coverage', (index) => {
    expect(
      execFileSync('jq', ['-r', filters[index] ?? 'error("missing filter")'], {
        input: '[]',
        encoding: 'utf8',
        timeout: 10000,
      })
    ).toBe('');
  });
});

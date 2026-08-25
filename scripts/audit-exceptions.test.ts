/**
 * Tests for the Security Audit exception ledger (#4794).
 *
 * The panel that approved requiring this gate (6-1) warned that an allowlist
 * decays into "a rubber-stamp graveyard of ignored exceptions". These are the
 * tests that have to hold for that not to happen — above all the two that catch
 * a suppression nobody owns and one that outlived its warrant.
 *
 * @module scripts/audit-exceptions.test
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  validateExceptions,
  configuredIds,
  loadLedger,
  type AuditException,
} from './audit-exceptions.js';

const TODAY = '2026-08-24';

function exception(overrides: Partial<AuditException> = {}): AuditException {
  return {
    id: 'GHSA-aaaa-bbbb-cccc',
    reason: 'no reachable call path; upstream fix tracked',
    owner: 'williamzujkowski',
    issue: 4794,
    expires: '2026-12-31',
    ...overrides,
  };
}

describe('validateExceptions', () => {
  it('accepts a fully-warranted exception that is also muted', () => {
    const problems = validateExceptions([exception()], ['GHSA-aaaa-bbbb-cccc'], TODAY);

    expect(problems).toEqual([]);
  });

  // The whole point of the ledger. pnpm's config is a flat list of ids, so
  // without this cross-check anyone can mute an advisory with no trace of who
  // did it or why (#4690 — an escape path is only as strong as its attribution).
  it('rejects an advisory muted in pnpm.auditConfig with no ledger entry', () => {
    const problems = validateExceptions([], ['GHSA-dddd-eeee-ffff'], TODAY);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('no ledger entry');
  });

  it('rejects an exception that has passed its expiry', () => {
    const problems = validateExceptions(
      [exception({ expires: '2026-08-23' })],
      ['GHSA-aaaa-bbbb-cccc'],
      TODAY
    );

    expect(problems.some((p) => p.includes('expired 2026-08-23'))).toBe(true);
    // The failure has to say who to go to, or it is just an obstacle.
    expect(problems.some((p) => p.includes('@williamzujkowski') && p.includes('#4794'))).toBe(true);
  });

  it('accepts an exception expiring exactly today', () => {
    // Boundary: `expires` is the last day it holds, not the first day it fails.
    const problems = validateExceptions(
      [exception({ expires: TODAY })],
      ['GHSA-aaaa-bbbb-cccc'],
      TODAY
    );

    expect(problems).toEqual([]);
  });

  it('rejects a ledger entry that mutes nothing', () => {
    // The inverse: a warrant with no corresponding mute is dead paperwork, and
    // reads as coverage that does not exist.
    const problems = validateExceptions([exception()], [], TODAY);

    expect(problems.some((p) => p.includes('suppresses nothing'))).toBe(true);
  });

  it.each([
    ['reason', { reason: '   ' }, 'needs a reason'],
    ['owner', { owner: '' }, 'needs an owner'],
    ['issue', { issue: 0 }, 'needs a tracking issue'],
    ['id format', { id: 'not-an-advisory-id' }, 'not a GHSA or CVE'],
    ['expiry format', { expires: '31/12/2026' }, 'must be YYYY-MM-DD'],
  ])('rejects a missing or malformed %s', (_label, override, expected) => {
    const e = exception(override);
    const problems = validateExceptions([e], [e.id], TODAY);

    expect(problems.some((p) => p.includes(expected))).toBe(true);
  });

  it('reports every problem at once rather than stopping at the first', () => {
    // Fixing these one CI run at a time is how a reviewer gives up and reaches
    // for the bypass instead.
    const problems = validateExceptions(
      [exception({ reason: '', owner: '', issue: 0 })],
      ['GHSA-aaaa-bbbb-cccc'],
      TODAY
    );

    expect(problems.length).toBeGreaterThanOrEqual(3);
  });

  // Name the empty case: absence must mean full enforcement, and it must be an
  // assertion rather than something the language decides for us.
  it('treats an empty ledger AND empty mute-list as full enforcement', () => {
    const problems = validateExceptions([], [], TODAY);

    expect(problems).toEqual([]);
  });
});

describe('configuredIds', () => {
  it('reads both GHSA and CVE mute-lists', () => {
    const ids = configuredIds({
      pnpm: {
        auditConfig: { ignoreGhsas: ['GHSA-aaaa-bbbb-cccc'], ignoreCves: ['CVE-2026-1234'] },
      },
    });

    expect(ids).toEqual(['GHSA-aaaa-bbbb-cccc', 'CVE-2026-1234']);
  });

  it('returns nothing when no audit config exists', () => {
    expect(configuredIds({})).toEqual([]);
    expect(configuredIds({ pnpm: {} })).toEqual([]);
  });
});

describe('the live repository state', () => {
  const root = process.cwd();

  it('has a ledger that parses', () => {
    expect(() => loadLedger(root)).not.toThrow();
  });

  it('has no unwarranted, malformed, or expired suppressions', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    const today = new Date().toISOString().slice(0, 10);
    const problems = validateExceptions(loadLedger(root), configuredIds(pkg), today);

    expect(problems, problems.join('\n')).toEqual([]);
  });
});

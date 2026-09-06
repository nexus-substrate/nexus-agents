/**
 * The mock-opt-in check must be able to report that the guard is missing
 * (#5580).
 *
 * `checkExplicitBehavior` counted `NEXUS_ALLOW_MOCK_ORCHESTRATION` across every
 * production `.ts` under the source root — including `fitness-score.ts` itself,
 * whose regex, JSDoc and warning text all contain the name. `mockGuardCount`
 * was therefore never 0 and the "no guard found" warning could not fire, even
 * with the guard deleted. A check that cannot fail is not a check.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { countMockGuardSites } from './source-scan.js';

let root = '';

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'mock-guard-'));
  mkdirSync(join(root, 'governance'), { recursive: true });
  mkdirSync(join(root, 'config'), { recursive: true });
});

afterAll(() => {
  if (root !== '') rmSync(root, { recursive: true, force: true });
});

describe('countMockGuardSites (#5580)', () => {
  it('reports zero when only the checker and the env schema name the guard', () => {
    // Exactly the two files that made the count structurally non-zero.
    writeFileSync(
      join(root, 'governance', 'fitness-score.ts'),
      "const p = /NEXUS_ALLOW_MOCK_ORCHESTRATION/g;\n'No NEXUS_ALLOW_MOCK_ORCHESTRATION guard found';\n"
    );
    writeFileSync(
      join(root, 'config', 'env-schema.ts'),
      'export const s = { NEXUS_ALLOW_MOCK_ORCHESTRATION: boolStr.optional() };\n'
    );

    expect(countMockGuardSites(root)).toBe(0);
  });

  it('counts a real guard when one exists', () => {
    writeFileSync(
      join(root, 'cli-server-tools.ts'),
      "const MOCK_ORCHESTRATION_ENV = 'NEXUS_ALLOW_MOCK_ORCHESTRATION';\n"
    );

    expect(countMockGuardSites(root)).toBe(1);
  });

  it('does not count a guard named only in a test file', () => {
    writeFileSync(
      join(root, 'cli-server-tools.test.ts'),
      "process.env['NEXUS_ALLOW_MOCK_ORCHESTRATION'] = 'true';\n"
    );

    // Still 1: the production guard above, not the test.
    expect(countMockGuardSites(root)).toBe(1);
  });
});

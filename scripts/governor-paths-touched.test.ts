/**
 * Tests for the governor-path detector step (#4802 part 1).
 *
 * @module scripts/governor-paths-touched.test
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  GOVERNOR_SECTION_END_DIRECTIVE,
  GOVERNOR_SECTION_START_DIRECTIVE,
  governorPathsFromCodeowners,
} from './governor-section.js';
import {
  GOVERNOR_TOUCHED_OUTPUT_KEY,
  governorPathsTouchedReport,
  governorTouchedValue,
} from './governor-paths-touched.js';

const REPO_ROOT = join(import.meta.dirname, '..');

const CODEOWNERS = [
  '/packages/nexus-agents/src/security/ @someone-else',
  GOVERNOR_SECTION_START_DIRECTIVE,
  "# Governor's own core",
  '/packages/nexus-agents/src/audit/ @owner',
  '/CODEOWNERS @owner',
  GOVERNOR_SECTION_END_DIRECTIVE,
].join('\n');

describe('governorTouchedValue', () => {
  it('is the bare value the workflow assigns to the pinned output key (#6260)', () => {
    // The key is what `needs.governor-ratification.outputs.governor_touched`
    // dereferences; a drift here silently skips the dependent jobs forever.
    // The script prints only the VALUE: the `governor_touched=` producer is
    // written by the workflow step body, where the #4698 wiring test can see it.
    expect(GOVERNOR_TOUCHED_OUTPUT_KEY).toBe('governor_touched');
    expect(governorTouchedValue(true)).toBe('true');
    expect(governorTouchedValue(false)).toBe('false');
  });
});

describe('governorPathsTouchedReport', () => {
  it('a non-governor change set is `false`, exit 0, and names the count it measured', () => {
    const report = governorPathsTouchedReport(
      { CHANGED_FILES: 'packages/nexus-agents/src/security/x.ts\nREADME.md' },
      CODEOWNERS
    );
    expect(report.exitCode).toBe(0);
    expect(report.value).toBe('false');
    expect(report.messages.join('\n')).toContain('0 of 2 changed file(s)');
  });

  it('a governor change set is `true`, exit 0, and lists what it matched', () => {
    const report = governorPathsTouchedReport(
      { CHANGED_FILES: 'packages/nexus-agents/src/audit/chain.ts\nREADME.md' },
      CODEOWNERS
    );
    expect(report.exitCode).toBe(0);
    expect(report.value).toBe('true');
    expect(report.messages.join('\n')).toContain('packages/nexus-agents/src/audit/chain.ts');
    expect(report.messages.join('\n')).toContain('1 of 2 changed file(s)');
  });

  it('an EMPTY change set is `false` and says so — the empty case is named, not defaulted', () => {
    const report = governorPathsTouchedReport({ CHANGED_FILES: '\n  \n' }, CODEOWNERS);
    expect(report.exitCode).toBe(0);
    expect(report.value).toBe('false');
    expect(report.messages.join('\n')).toContain('0 of 0 changed file(s)');
  });

  it('an ABSENT change set is exit 1 with no output line — nothing was measured', () => {
    // `false` here would skip the review gate and the CODEOWNERS check on
    // every PR whose evidence step broke, and read as "not a governor PR".
    const report = governorPathsTouchedReport({}, CODEOWNERS);
    expect(report.exitCode).toBe(1);
    expect(report.value).toBeUndefined();
    expect(report.messages.join('\n')).toContain('No CHANGED_FILES in the environment');
  });

  it('an unparseable governor section is exit 1 with no output line, naming the parser error', () => {
    // The same fail-closed direction as the ratification gate's
    // `indeterminate`: a set that cannot be derived must not read as "none".
    const noEnd = CODEOWNERS.replace(GOVERNOR_SECTION_END_DIRECTIVE, '# drifted');
    const report = governorPathsTouchedReport(
      { CHANGED_FILES: 'packages/nexus-agents/src/audit/chain.ts' },
      noEnd
    );
    expect(report.exitCode).toBe(1);
    expect(report.value).toBeUndefined();
    expect(report.messages.join('\n')).toContain('end directive');
  });

  it('matches with the same parser and matcher the ratification gate uses, over the REAL CODEOWNERS', () => {
    // One parse of one source: if this file and the gate ever disagreed on
    // what a governor path is, a PR could be gated by one and skipped by
    // the other. Pin the detector to the real set the gate derives.
    const real = readFileSync(join(REPO_ROOT, 'CODEOWNERS'), 'utf-8');
    const patterns = governorPathsFromCodeowners(real);
    expect(patterns.length).toBeGreaterThan(5);
    const governorFile = 'scripts/check-governor-ratification.ts';
    const ordinaryFile = 'packages/nexus-agents/src/cli/vote-types.ts';
    expect(patterns).toContain(`/${governorFile}`);

    expect(
      governorPathsTouchedReport({ CHANGED_FILES: `${ordinaryFile}\n${governorFile}` }, real).value
    ).toBe('true');
    expect(governorPathsTouchedReport({ CHANGED_FILES: ordinaryFile }, real).value).toBe('false');
  });
});

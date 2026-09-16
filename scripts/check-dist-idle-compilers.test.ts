import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  censusIdleServer,
  compilerModulesIn,
  judgeCensus,
  SERVER_STARTED_LINE,
} from './check-dist-idle-compilers.js';
import { ROOT } from './script-paths.js';

const DIST_CLI = join(ROOT, 'packages/nexus-agents/dist/cli.js');

const PNPM_TS = '/x/node_modules/.pnpm/typescript@6.0.3/node_modules/typescript/lib/typescript.js';
const PNPM_TS_MORPH =
  'file:///x/node_modules/.pnpm/ts-morph@27.0.2/node_modules/ts-morph/dist/ts-morph.js';
const PNPM_COMMON =
  '/x/node_modules/.pnpm/@ts-morph+common@0.28.1/node_modules/@ts-morph/common/dist/typescript.js';

describe('compilerModulesIn (#6405)', () => {
  it('matches the three compiler packages under a pnpm layout, sorted and de-duplicated', () => {
    expect(compilerModulesIn([PNPM_TS_MORPH, PNPM_TS, PNPM_COMMON, PNPM_TS])).toEqual([
      PNPM_COMMON,
      PNPM_TS,
      PNPM_TS_MORPH,
    ]);
  });

  it('ignores own dist chunks and unrelated packages whose names contain the words', () => {
    // A tsup chunk named after its contents is not a compiler copy, and
    // `typescript-eslint` is a different package under a different segment.
    expect(
      compilerModulesIn([
        '/x/packages/nexus-agents/dist/chunk-typescript-ABC123.js',
        '/x/node_modules/.pnpm/typescript-eslint@8/node_modules/typescript-eslint/dist/index.js',
        '/x/node_modules/.pnpm/@typescript-eslint+parser@8/node_modules/@typescript-eslint/parser/dist/index.js',
        'node:fs',
      ])
    ).toEqual([]);
  });

  it('returns [] for an empty census — judgeCensus is what names that case', () => {
    expect(compilerModulesIn([])).toEqual([]);
  });
});

describe('judgeCensus (#6405)', () => {
  it('fails an unstarted server as unmeasured, even with nothing loaded', () => {
    // The empty case: a child that died during startup has loaded nothing
    // compiler-shaped, and that is not evidence the idle server is clean.
    const verdict = judgeCensus({ started: false, loaded: [], stderr: '' });
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.join('\n')).toContain('NOT measured');
    expect(verdict.problems.join('\n')).toContain(SERVER_STARTED_LINE);
  });

  it('fails a started server that holds a compiler, naming each one', () => {
    const verdict = judgeCensus({ started: true, loaded: ['node:fs', PNPM_TS], stderr: '' });
    expect(verdict.ok).toBe(false);
    expect(verdict.problems).toEqual([PNPM_TS]);
  });

  it('passes a started server whose census holds no compiler', () => {
    const verdict = judgeCensus({
      started: true,
      loaded: ['node:fs', '/x/dist/cli.js'],
      stderr: '',
    });
    expect(verdict).toEqual({ ok: true, problems: [] });
  });
});

/**
 * The gate itself, against the real artifact. Needs `pnpm build` first; the
 * Build CI job runs the script directly after building, so a missing dist
 * here is reported as a skip rather than laundered into a pass.
 */
describe.skipIf(!existsSync(DIST_CLI))('built dist/cli.js at idle (#6405)', () => {
  it('loads neither typescript nor ts-morph before the first tool call', async () => {
    const census = await censusIdleServer(DIST_CLI);
    expect(census.started, census.stderr.slice(-2000)).toBe(true);
    // Positive control on the census itself: an idle server that reported
    // nothing loaded has not been measured either.
    expect(census.loaded.length).toBeGreaterThan(100);
    expect(compilerModulesIn(census.loaded)).toEqual([]);
  }, 60_000);
});

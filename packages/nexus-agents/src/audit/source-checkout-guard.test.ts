/**
 * Tests for the shared source-checkout write guard (#6070, lifted from the
 * pr-review store's #4415 guard). The guard keys on the DESTINATION: under a
 * test runner, a write aimed at `<source checkout>/<tracked rel path>` throws;
 * any other path — including a sibling that merely shares the prefix — is
 * allowed; and outside a test runner the guard is inert.
 *
 * @module audit/source-checkout-guard.test
 */

import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { findRepoRoot } from '../config/repo-root-detection.js';
import { assertNotSourceCheckoutWrite, isUnderTestRunner } from './source-checkout-guard.js';

const TRACKED = 'governance/vote-records.jsonl';
const ENV = 'NEXUS_VOTE_RECORDS_PATH';

function sourceCheckout(): string {
  const root = findRepoRoot(process.cwd());
  if (root === null) throw new Error('test must run inside the source checkout');
  return root;
}

/** Restore the two env vars the runner detection reads after each test. */
function restoreRunnerEnv(): () => void {
  const savedVitest = process.env['VITEST'];
  const savedNodeEnv = process.env['NODE_ENV'];
  return () => {
    if (savedVitest === undefined) delete process.env['VITEST'];
    else process.env['VITEST'] = savedVitest;
    if (savedNodeEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = savedNodeEnv;
  };
}

function leaveTestRunner(): void {
  delete process.env['VITEST'];
  process.env['NODE_ENV'] = 'production';
}

describe('isUnderTestRunner', () => {
  afterEach(restoreRunnerEnv());

  it('is true under vitest', () => {
    expect(isUnderTestRunner()).toBe(true);
  });

  it('is false when neither VITEST nor NODE_ENV=test is set', () => {
    leaveTestRunner();
    expect(isUnderTestRunner()).toBe(false);
  });
});

describe('assertNotSourceCheckoutWrite (#6070)', () => {
  afterEach(restoreRunnerEnv());

  it('throws for the tracked ledger of the source checkout under a test runner', () => {
    const target = join(sourceCheckout(), TRACKED);
    expect(() => {
      assertNotSourceCheckoutWrite(target, TRACKED, ENV);
    }).toThrow(/#4415/);
  });

  it('names the path, the tracked file and the env var in the refusal', () => {
    const target = join(sourceCheckout(), TRACKED);
    expect(() => {
      assertNotSourceCheckoutWrite(target, TRACKED, ENV);
    }).toThrow(/vote-records\.jsonl[\s\S]*NEXUS_VOTE_RECORDS_PATH/);
  });

  it('matches an unnormalized spelling of the same destination', () => {
    // The guard is on the destination, so `governance/../governance/x` is the
    // same file and must be refused too.
    const target = join(sourceCheckout(), 'governance', '..', TRACKED);
    expect(() => {
      assertNotSourceCheckoutWrite(target, TRACKED, ENV);
    }).toThrow(/#4415/);
  });

  it('allows another absolute path', () => {
    expect(() => {
      assertNotSourceCheckoutWrite(resolve('/nowhere/governance/vote-records.jsonl'), TRACKED, ENV);
    }).not.toThrow();
  });

  it('allows a sibling path that merely shares the tracked path as a prefix', () => {
    // Equality, not prefix: `<tracked>.bak` is a different file. A startsWith
    // comparison would refuse this and nothing else in the suite would notice.
    const sibling = `${join(sourceCheckout(), TRACKED)}.bak`;
    expect(() => {
      assertNotSourceCheckoutWrite(sibling, TRACKED, ENV);
    }).not.toThrow();
  });

  it('allows the same relative ledger inside a different root', () => {
    expect(() => {
      assertNotSourceCheckoutWrite(join('/some/other/checkout', TRACKED), TRACKED, ENV);
    }).not.toThrow();
  });

  it('is inert outside a test runner', () => {
    leaveTestRunner();
    const target = join(sourceCheckout(), TRACKED);
    expect(() => {
      assertNotSourceCheckoutWrite(target, TRACKED, ENV);
    }).not.toThrow();
  });
});

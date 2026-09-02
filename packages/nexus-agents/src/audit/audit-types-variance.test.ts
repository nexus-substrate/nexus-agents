/**
 * `IAuditLogger.logPolicyDecision` must reject a narrow implementor at COMPILE
 * time (#4991).
 *
 * When `PolicyAuditDecision` gained `would_deny`, the honest description of the
 * blast radius was "breaking for implementors, who get no compile error" —
 * TypeScript checks method-shorthand parameters bivariantly even under
 * `strictFunctionTypes`. A consensus panel refused to accept that as a
 * documented hazard when the same major bump could simply close it: a silent
 * runtime break in an authorization audit path is not something to ship with a
 * changelog note.
 *
 * Declaring the member as a function PROPERTY restores contravariant parameter
 * checking. These are type-level assertions — there is no runtime behaviour to
 * exercise — and the `@ts-expect-error` is the assertion: if the declaration
 * ever reverts to method shorthand, the narrow implementor becomes assignable,
 * the suppression goes unused, and `tsc` fails with "Unused '@ts-expect-error'
 * directive". That is what makes this a check that can fail.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { IAuditLogger, PolicyDecisionAuditOpts } from './audit-types.js';

/** An out-of-tree logger written against the OLD two-value union. */
interface LegacyPolicyOpts extends Omit<PolicyDecisionAuditOpts, 'decision'> {
  decision: 'allow' | 'deny';
}

type LegacyLogger = Omit<IAuditLogger, 'logPolicyDecision'> & {
  logPolicyDecision: (opts: LegacyPolicyOpts) => void;
};

type CurrentLogger = Omit<IAuditLogger, 'logPolicyDecision'> & {
  logPolicyDecision: (opts: PolicyDecisionAuditOpts) => void;
};

describe('IAuditLogger.logPolicyDecision variance (#4991)', () => {
  it('rejects an implementor that only handles allow|deny', () => {
    const legacy = {} as LegacyLogger;
    // @ts-expect-error a logger accepting only 'allow' | 'deny' must NOT satisfy
    // IAuditLogger — it would receive 'would_deny' at runtime and mishandle it.
    const asLogger: IAuditLogger = legacy;
    expect(asLogger).toBeDefined();
  });

  it('accepts an implementor that handles the full union', () => {
    // The other half. Without this, the test above would still pass if the
    // interface became impossible to satisfy at all.
    const current = {} as CurrentLogger;
    const asLogger: IAuditLogger = current;
    expect(asLogger).toBeDefined();
  });
});

describe('every IAuditLogger member is a function property (#4991)', () => {
  // The @ts-expect-error probe above covers `logPolicyDecision` alone, because
  // it is the only member whose union has widened so far. This covers the other
  // six, whose risk is prospective: each is a parameter that COULD widen, and
  // as method shorthand it would widen bivariantly and silently.
  //
  // A panel corrected me here. I had converted only `logPolicyDecision`,
  // arguing the rest would "break implementors for no reason" — wrong: an ES6
  // class with ordinary method syntax satisfies a property signature, and so
  // does an object literal with method shorthand. The only implementor a
  // property signature rejects is one with a NARROWER parameter, i.e. exactly
  // the unsound case. Mixed syntax was the genuinely dangerous state.
  const SOURCE = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'audit-types.ts'),
    'utf8'
  );

  const body = /export interface IAuditLogger \{([\s\S]*?)\n\}/.exec(SOURCE)?.[1] ?? '';

  it('finds the interface it is checking', () => {
    // Guard the guard: an empty body would make the assertion below pass over
    // nothing, which is the failure mode this whole file exists to prevent.
    expect(body).not.toBe('');
    expect(body.split('\n').filter((l) => /^\s*\w+[?]?:/.test(l)).length).toBeGreaterThan(5);
  });

  it('declares no member with method shorthand', () => {
    // Method shorthand looks like `name(args): Ret;`. A property looks like
    // `name: (args) => Ret;`.
    const shorthand = body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => /^\w+\s*\(/.test(l));
    expect(shorthand).toEqual([]);
  });
});

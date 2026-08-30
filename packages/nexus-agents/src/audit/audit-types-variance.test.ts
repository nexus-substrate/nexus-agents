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

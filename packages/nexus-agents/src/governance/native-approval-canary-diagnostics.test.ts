/** Failure provenance must distinguish missing evidence without serializing secrets. */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CanaryReadFailure,
  canaryFailureCause,
  canaryReadOperation,
} from './native-approval-canary-diagnostics.js';

describe('bounded canary diagnostics', () => {
  it.each([
    'dirty-checkout',
    'pagination-limit',
    'blob-integrity-mismatch',
    'active-rulesets-unmeasured',
  ])('retains the known internal cause %s', (code) => {
    expect(canaryFailureCause(new Error(code))).toEqual({ code });
  });
  it('does not serialize unknown exception messages', () => {
    const secret = 'fixture-private-value-never-log';
    expect(JSON.stringify(canaryFailureCause(new Error(secret)))).not.toContain(secret);
    expect(canaryFailureCause(new Error(secret))).toEqual({ code: 'unexpected-error' });
  });
  it.each([null, undefined, 'fixture-private-value', { message: 'fixture-private-value' }])(
    'does not copy non-error payloads',
    (value) => {
      expect(canaryFailureCause(value)).toEqual({ code: 'unexpected-error' });
    }
  );
  it('retains API operation and HTTP status without an API body', () => {
    expect(
      canaryFailureCause(new CanaryReadFailure('canary-api-read-failed', 'protection', 403))
    ).toEqual({
      code: 'canary-api-read-failed',
      operation: 'protection',
      httpStatus: 403,
    });
  });
  it('retains schema field paths without input values', () => {
    const result = z
      .object({ token: z.string() })
      .safeParse({ token: { private: 'fixture-sensitive' } });
    expect(result.success).toBe(false);
    if (result.success) throw new Error('fixture failed to reject');
    expect(canaryFailureCause(result.error)).toEqual({
      code: 'invalid-evidence-shape',
      fields: ['token'],
    });
    expect(JSON.stringify(canaryFailureCause(result.error))).not.toContain('fixture-sensitive');
  });
  it('bounds schema issue coverage explicitly', () => {
    const result = z.array(z.string()).safeParse(Array.from({ length: 30 }, () => 1));
    if (result.success) throw new Error('fixture failed to reject');
    const cause = canaryFailureCause(result.error);
    expect(cause.fields).toHaveLength(10);
    expect(cause.omittedFieldErrors).toBe(20);
  });
  it.each([
    {
      args: ['api', '--method', 'GET', 'repos/nexus-substrate/nexus-agents/git/trees/abc'],
      operation: 'tree',
    },
    { args: ['api', 'graphql', '-f', 'query=query{defaultBranchRef{}}'], operation: 'protection' },
    {
      args: ['api', 'graphql', '-f', 'query=query{pullRequest(number:1){}}'],
      operation: 'native-status',
    },
    {
      args: ['api', '--method', 'GET', 'repos/nexus-substrate/nexus-agents/pulls/1/reviews?page=2'],
      operation: 'reviews',
    },
  ])('names the operation $operation', ({ args, operation }) => {
    expect(canaryReadOperation(args)).toBe(operation);
  });
});

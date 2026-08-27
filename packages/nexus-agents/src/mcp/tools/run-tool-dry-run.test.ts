/**
 * Dispatch-error classification: a policy refusal is a `business` outcome, an
 * engine fault is `internal` (#4994).
 *
 * @module mcp/tools/run-tool-dry-run.test
 */

import { describe, it, expect } from 'vitest';

import { classifyDispatchError, DryRunUnsupportedError } from './run-tool-dry-run.js';
import {
  AuthorityRefusalError,
  ExecuteEnvelopeRefusalError,
} from '../../orchestration/authority-tier-guard.js';
import { MetaDispatchError } from '../../orchestration/meta-dispatcher.js';

describe('classifyDispatchError', () => {
  it('classifies an undeclared execute envelope as a business outcome', () => {
    // The regression. `ExecuteEnvelopeRefusalError` is deliberately not an
    // `AuthorityRefusalError` — it answers a different question — so the
    // instanceof list missed it and a documented fail-closed refusal reached
    // the caller as "the engine has an internal defect". Reachable from a plain
    // `run({ goal, execute: true })`: that routes to `single-shot`, which
    // declares no execute envelope.
    expect(classifyDispatchError(new ExecuteEnvelopeRefusalError('single-shot'))).toBe('business');
  });

  it('classifies the other two refusals as business outcomes', () => {
    expect(
      classifyDispatchError(
        new AuthorityRefusalError({
          code: 'above_declared_tier',
          strategy: 'dev-pipeline',
          declaredTier: 'suggest',
          attemptedAction: 'enforce',
          message: 'above declared tier',
        })
      )
    ).toBe('business');
    expect(classifyDispatchError(new DryRunUnsupportedError('graph-workflow'))).toBe('business');
  });

  it('classifies a missing executor as a business outcome', () => {
    expect(
      classifyDispatchError(
        new MetaDispatchError('no_executor', 'single-shot', 'dec-1', 'nothing wired')
      )
    ).toBe('business');
  });

  it('still calls a genuine fault internal', () => {
    // Guard the guard: broadening the refusal test must not launder real
    // defects into "the caller asked for this".
    expect(classifyDispatchError(new Error('null is not an object'))).toBe('internal');
    expect(classifyDispatchError(new TypeError('boom'))).toBe('internal');
  });

  it('classifies a non-no_executor dispatch error as internal', () => {
    // `MetaDispatchError` is only a business outcome for one code; the others
    // are wiring faults.
    expect(
      classifyDispatchError(
        new MetaDispatchError('executor_failed', 'dev-pipeline', 'dec-2', 'boom')
      )
    ).toBe('internal');
  });
});

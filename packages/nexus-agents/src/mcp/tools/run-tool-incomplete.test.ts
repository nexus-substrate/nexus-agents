/**
 * Incomplete dev-pipeline result descriptions tests (#4789, #5506, #5575, #5645).
 */

import { describe, it, expect } from 'vitest';
import { describeIncompletePipeline } from './run-tool-incomplete.js';

describe('describeIncompletePipeline', () => {
  it('describes task failure when taskStatus is none (#5645)', () => {
    const message = describeIncompletePipeline({
      taskStatus: 'none',
      securityRan: true,
      securityPassed: true,
    });
    expect(message).toBe('Engine reported failure: no planned tasks completed successfully');
  });

  it('describes task failure when taskStatus is partial (#5645)', () => {
    const message = describeIncompletePipeline({
      taskStatus: 'partial',
      securityRan: true,
      securityPassed: true,
    });
    expect(message).toBe(
      'Engine reported failure: one or more planned tasks did not complete successfully'
    );
  });

  it('describes security rejection when security scan ran and failed', () => {
    const message = describeIncompletePipeline({
      securityRan: true,
      securityPassed: false,
    });
    expect(message).toBe('Engine reported failure: the security gate rejected the change');
  });

  it('describes empty plan', () => {
    const message = describeIncompletePipeline({
      planStatus: 'empty',
    });
    expect(message).toBe(
      'Engine reported failure: the planner returned no plan, so nothing was built'
    );
  });

  it('describes unapproved plan with iteration count', () => {
    const message = describeIncompletePipeline({
      planStatus: 'unapproved',
      voteIterations: 3,
    });
    expect(message).toBe(
      'Engine reported failure: the panel did not approve the plan after 3 iterations'
    );
  });

  it('describes unapproved plan with unknown iteration count when missing', () => {
    const message = describeIncompletePipeline({
      planStatus: 'unapproved',
    });
    expect(message).toBe(
      'Engine reported failure: the panel did not approve the plan after an unknown number of iterations'
    );
  });

  it('describes no_quorum with reason', () => {
    const message = describeIncompletePipeline({
      planStatus: 'no_quorum',
      planVoteReason: 'catfish voter errored',
    });
    expect(message).toBe(
      'Engine reported failure: the plan vote could not reach quorum: catfish voter errored'
    );
  });

  it('describes security scan skipped with note', () => {
    const message = describeIncompletePipeline({
      securityRan: false,
      securityNote: 'semgrep not installed',
    });
    expect(message).toBe(
      'Engine reported failure: the security scan did not run (semgrep not installed); the change is blocked until it does'
    );
  });

  it('describes run stopped before security gate when securityRan is false', () => {
    const message = describeIncompletePipeline({
      securityRan: false,
    });
    expect(message).toBe(
      'Engine reported failure: the run stopped before the security gate, which never ran'
    );
  });

  it('describes generic failure when record has no extra metadata', () => {
    const message = describeIncompletePipeline({});
    expect(message).toBe('Engine reported failure: the dev pipeline did not complete');
  });
});

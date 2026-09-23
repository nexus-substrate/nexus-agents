/**
 * Routed outcomes of the `orchestrate` CLI command (#6533).
 *
 * The recorder reads the router's own attribution (`routedCli`,
 * `routedDurationMs`) off an `executeDecision` result. It writes nothing when
 * no arm ran, and nothing when the task category was not detected.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { recordRoutedOrchestrateOutcome } from './orchestrate-outcome.js';
import { OutcomeStore, setOutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import { isDistillerEligible } from '../learning/distiller-eligibility.js';
import type { CliError, CliResponse } from '../cli-adapters/index.js';
import type { Result } from '../core/index.js';

/** Contains the `test` keyword, so detectTaskCategory resolves `testing`. */
const TESTING_TASK = 'write unit tests for the parser';
/** No keyword of any category. */
const UNDETECTED_TASK = 'zzqx flurb';

function routedSuccess(): Result<CliResponse, CliError> {
  return { ok: true, value: { text: 'done', routedCli: 'gemini', routedDurationMs: 1234 } };
}

function routedFailure(): Result<CliResponse, CliError> {
  return {
    ok: false,
    error: {
      code: 'TIMEOUT',
      message: 'gemini timed out after 60000ms',
      cli: 'gemini',
      retryable: true,
      routedCli: 'gemini',
      routedDurationMs: 60001,
    },
  };
}

describe('recordRoutedOrchestrateOutcome (#6533)', () => {
  let store: OutcomeStore;

  beforeEach(() => {
    vi.stubEnv('NEXUS_PERSIST_LEARNING', 'false');
    store = new OutcomeStore();
    setOutcomeStore(store);
  });

  afterEach(() => {
    setOutcomeStore(new OutcomeStore());
    vi.unstubAllEnvs();
  });

  it('records a routed success against the ran arm, with the arm duration', () => {
    recordRoutedOrchestrateOutcome(TESTING_TASK, routedSuccess());

    const rows = store.query();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      cli: 'gemini',
      routedBy: 'composite-router',
      category: 'testing',
      success: true,
      durationMs: 1234,
      source: 'delegate',
    });
    expect(rows[0]?.failureCategory).toBeUndefined();
    expect(rows[0] !== undefined && isDistillerEligible(rows[0])).toBe(true);
  });

  it('records a routed failure with a failureCategory', () => {
    recordRoutedOrchestrateOutcome(TESTING_TASK, routedFailure());

    const rows = store.query();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      cli: 'gemini',
      routedBy: 'composite-router',
      success: false,
      durationMs: 60001,
      failureCategory: 'timeout',
      errorMessage: 'gemini timed out after 60000ms',
    });
  });

  it('writes no row when no arm ran (no routedCli on the result)', () => {
    recordRoutedOrchestrateOutcome(TESTING_TASK, {
      ok: false,
      error: { code: 'EXECUTION_ERROR', message: 'boom', cli: 'claude', retryable: false },
    });
    recordRoutedOrchestrateOutcome(TESTING_TASK, { ok: true, value: { text: 'x' } });

    expect(store.query()).toHaveLength(0);
  });

  it('writes no row when the category was not detected, rather than defaulting it', () => {
    recordRoutedOrchestrateOutcome(UNDETECTED_TASK, routedSuccess());

    expect(store.query()).toHaveLength(0);
  });
});

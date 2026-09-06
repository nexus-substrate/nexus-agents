/**
 * A timeout knob that is set, valid, and silently discarded must be reported
 * (#5785).
 *
 * `resolveClassGuardMs` applies three clamps and returns one number, so a
 * request that was reduced looks exactly like one that was honoured. The class
 * this hurts is `async-job-body`: its declared guard is EXACTLY
 * `MCP_TIMEOUTS.maxMs`, so `NEXUS_TIMEOUT_CLASS_ASYNC_JOB_BODY_MS` above that
 * is accepted by the schema (an unbounded positive int, and `CLASS_OVERRIDE_MAX_MS`
 * advertises headroom to 7200s) and discarded, and every
 * `NEXUS_TIMEOUT_MULTIPLIER` above 1 is a no-op. For that class the two
 * documented knobs can only lower the guard, and nothing said so.
 *
 * `validateNexusEnv` already reports unknown names and invalid values. A
 * correctly-spelled variable holding a valid value that changes nothing passed
 * both checks — the same "accepted, does nothing" failure #5155 fixed for the
 * boolean flags.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';

import {
  describeClassGuard,
  resolveClassGuardMs,
  MCP_TIMEOUTS,
  OPERATION_CLASSES,
} from './timeouts.js';
import { validateNexusEnv } from './env-schema.js';

const OVERRIDE = 'NEXUS_TIMEOUT_CLASS_ASYNC_JOB_BODY_MS';
const MULTIPLIER = 'NEXUS_TIMEOUT_MULTIPLIER';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the ceiling that swallows an override is visible', () => {
  it('pins the premise: async-job-body is declared AT the request ceiling', () => {
    // If this ever stops being true the rest of the file is testing nothing, so
    // it is asserted rather than assumed.
    expect(OPERATION_CLASSES['async-job-body'].guardMs).toBe(MCP_TIMEOUTS.maxMs);
  });

  it('reports a request that was reduced', () => {
    vi.stubEnv(OVERRIDE, String(MCP_TIMEOUTS.maxMs * 2));

    const resolution = describeClassGuard('async-job-body');

    expect(resolution.effectiveMs).toBe(MCP_TIMEOUTS.maxMs);
    expect(resolution.requestedMs).toBeGreaterThan(resolution.effectiveMs);
    expect(resolution.clampedByRequestCeiling).toBe(true);
    expect(resolution.overrideEnvVar).toBe(OVERRIDE);
  });

  it('reports a request that was honoured as not clamped', () => {
    // The pair that keeps the assertion above from passing for everything.
    vi.stubEnv(OVERRIDE, String(MCP_TIMEOUTS.maxMs / 2));

    const resolution = describeClassGuard('async-job-body');

    expect(resolution.effectiveMs).toBe(MCP_TIMEOUTS.maxMs / 2);
    expect(resolution.clampedByRequestCeiling).toBe(false);
  });

  it('keeps resolveClassGuardMs returning exactly what it always did', () => {
    vi.stubEnv(OVERRIDE, String(MCP_TIMEOUTS.maxMs * 2));
    expect(resolveClassGuardMs('async-job-body')).toBe(MCP_TIMEOUTS.maxMs);
    vi.unstubAllEnvs();
    expect(resolveClassGuardMs('async-job-body')).toBe(OPERATION_CLASSES['async-job-body'].guardMs);
  });
});

describe('validateNexusEnv only reports a knob that actually asked for more', () => {
  it('finds nothing when nothing was set', () => {
    // The empty case, named: with no knob set every declared guard resolves at
    // or below the ceiling, so [] here means "nothing was reduced", not
    // "nothing was checked".
    expect(validateNexusEnv().ineffectiveVars).toEqual([]);
  });

  it('blames the override, not the multiplier, when both are set', () => {
    // The report names a variable to the operator. Defaulting an unattributed
    // clamp to the multiplier would accuse a knob they may not have touched —
    // the same misattribution this report exists to prevent.
    vi.stubEnv(OVERRIDE, String(MCP_TIMEOUTS.maxMs * 2));
    vi.stubEnv(MULTIPLIER, '2');

    const resolution = describeClassGuard('async-job-body');

    expect(resolution.clampCause).toBe('override');
    expect(validateNexusEnv().ineffectiveVars.map((v) => v.name)).toContain(OVERRIDE);
  });

  it('blames the multiplier when only the multiplier is set', () => {
    vi.stubEnv(MULTIPLIER, '2');

    expect(describeClassGuard('async-job-body').clampCause).toBe('multiplier');
    expect(validateNexusEnv().ineffectiveVars.map((v) => v.name)).toContain(MULTIPLIER);
  });

  it('finds the class whose override was discarded', () => {
    vi.stubEnv(OVERRIDE, String(MCP_TIMEOUTS.maxMs * 2));

    expect(validateNexusEnv().ineffectiveVars.map((v) => v.name)).toContain(OVERRIDE);
  });

  it('finds a class whose multiplier was discarded even with no per-class override', () => {
    // `NEXUS_TIMEOUT_MULTIPLIER` is documented as scaling EVERY class. For a
    // class sitting at the ceiling, every value above 1 does nothing.
    vi.stubEnv(MULTIPLIER, '2');

    expect(validateNexusEnv().ineffectiveVars.map((v) => v.name)).toContain(MULTIPLIER);
    expect(describeClassGuard('async-job-body').overrideEnvVar).toBeNull();
    expect(describeClassGuard('async-job-body').clampCause).toBe('multiplier');
  });
});

describe('validateNexusEnv surfaces it alongside typos and bad values', () => {
  it('reports the discarded override as ineffective', () => {
    vi.stubEnv(OVERRIDE, String(MCP_TIMEOUTS.maxMs * 2));

    const result = validateNexusEnv();

    const ineffective = result.ineffectiveVars.find((v) => v.name === OVERRIDE);
    expect(ineffective).toBeDefined();
    expect(ineffective?.effectiveMs).toBe(MCP_TIMEOUTS.maxMs);
    // The variable is spelled correctly and holds a valid value, which is
    // exactly why the two existing checks missed it.
    expect(result.unknownVars.map((u) => u.name)).not.toContain(OVERRIDE);
    expect(result.invalidVars.map((i) => i.name)).not.toContain(OVERRIDE);
  });

  it('reports nothing ineffective when the override is within the ceiling', () => {
    vi.stubEnv(OVERRIDE, String(MCP_TIMEOUTS.maxMs / 2));

    expect(validateNexusEnv().ineffectiveVars).toEqual([]);
  });
});

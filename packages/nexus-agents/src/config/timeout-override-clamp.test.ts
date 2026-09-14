/**
 * A timeout knob that is set, valid, and silently discarded must be reported
 * (#5785), and the ceiling it is reported against must be the one that
 * actually bounds the class (#5995).
 *
 * `resolveClassGuardMs` applies its clamps and returns one number, so a
 * request that was reduced looks exactly like one that was honoured. The class
 * this hurt most is `async-job-body`: its declared guard is EXACTLY
 * `MCP_TIMEOUTS.maxMs`, and until #5995 it was re-clamped to that MCP REQUEST
 * ceiling even though a backgrounded body has no MCP request. Both documented
 * knobs could only lower the guard, and the documented override range
 * `(3.6M, 7.2M]` was unreachable. The class is now bounded by the class
 * override ceiling (7200000) instead; the DEFAULT is unchanged, so the wider
 * range is opt-in.
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
const PIPELINE_OVERRIDE = 'NEXUS_TIMEOUT_CLASS_PIPELINE_MS';
const MULTIPLIER = 'NEXUS_TIMEOUT_MULTIPLIER';

/** The documented per-class override ceiling (`CLASS_OVERRIDE_MAX_MS`, 2h). */
const CLASS_CEILING_MS = 7_200_000;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the ceiling that swallows an override is visible', () => {
  it('pins the premise: async-job-body is still DECLARED at the request ceiling', () => {
    // The default is unchanged by #5995 — only the override range became
    // reachable. If this ever stops being true the "default is unchanged"
    // assertions below are testing nothing, so it is asserted rather than assumed.
    expect(OPERATION_CLASSES['async-job-body'].guardMs).toBe(MCP_TIMEOUTS.maxMs);
    expect(CLASS_CEILING_MS).toBeGreaterThan(MCP_TIMEOUTS.maxMs);
  });

  it('reports a request that was reduced, naming the ceiling that reduced it', () => {
    vi.stubEnv(OVERRIDE, String(CLASS_CEILING_MS + 1));

    const resolution = describeClassGuard('async-job-body');

    expect(resolution.effectiveMs).toBe(CLASS_CEILING_MS);
    expect(resolution.requestedMs).toBe(CLASS_CEILING_MS + 1);
    expect(resolution.clampedByCeiling).toBe(true);
    expect(resolution.ceilingMs).toBe(CLASS_CEILING_MS);
    expect(resolution.overrideEnvVar).toBe(OVERRIDE);
  });

  it('reports a request that was honoured as not clamped', () => {
    // The pair that keeps the assertion above from passing for everything.
    vi.stubEnv(OVERRIDE, String(MCP_TIMEOUTS.maxMs / 2));

    const resolution = describeClassGuard('async-job-body');

    expect(resolution.effectiveMs).toBe(MCP_TIMEOUTS.maxMs / 2);
    expect(resolution.clampedByCeiling).toBe(false);
  });

  it('leaves the default untouched when no knob is set', () => {
    expect(resolveClassGuardMs('async-job-body')).toBe(OPERATION_CLASSES['async-job-body'].guardMs);
    expect(describeClassGuard('async-job-body').clampedByCeiling).toBe(false);
  });
});

describe('async-job-body is bounded by the class ceiling, not the MCP request ceiling (#5995)', () => {
  it('honours an override at the documented ceiling (was clamped to 3600000)', () => {
    vi.stubEnv(OVERRIDE, String(CLASS_CEILING_MS));

    expect(resolveClassGuardMs('async-job-body')).toBe(CLASS_CEILING_MS);
    expect(describeClassGuard('async-job-body').clampedByCeiling).toBe(false);
  });

  it('clamps one past the ceiling back to the ceiling', () => {
    vi.stubEnv(OVERRIDE, String(CLASS_CEILING_MS + 1));

    expect(resolveClassGuardMs('async-job-body')).toBe(CLASS_CEILING_MS);
  });

  it('a multiplier of 2.0 doubles the guard (was a no-op)', () => {
    vi.stubEnv(MULTIPLIER, '2');

    expect(resolveClassGuardMs('async-job-body')).toBe(MCP_TIMEOUTS.maxMs * 2);
    expect(describeClassGuard('async-job-body').clampedByCeiling).toBe(false);
  });

  it('a multiplier past the ceiling is clamped to it and attributed to the multiplier', () => {
    vi.stubEnv(MULTIPLIER, '3');

    const resolution = describeClassGuard('async-job-body');

    expect(resolution.effectiveMs).toBe(CLASS_CEILING_MS);
    expect(resolution.clampedByCeiling).toBe(true);
    expect(resolution.clampCause).toBe('multiplier');
  });

  it('every OTHER class still clamps at MCP_TIMEOUTS.maxMs', () => {
    // The exemption is for the one class with no MCP request. A class that IS
    // a request keeps the request ceiling — pinned so widening the exemption
    // by accident fails here.
    vi.stubEnv(PIPELINE_OVERRIDE, String(CLASS_CEILING_MS));

    const resolution = describeClassGuard('pipeline');

    expect(resolution.effectiveMs).toBe(MCP_TIMEOUTS.maxMs);
    expect(resolution.ceilingMs).toBe(MCP_TIMEOUTS.maxMs);
    expect(resolution.clampedByCeiling).toBe(true);
    for (const cls of Object.keys(OPERATION_CLASSES) as (keyof typeof OPERATION_CLASSES)[]) {
      if (cls === 'async-job-body') continue;
      expect(describeClassGuard(cls).ceilingMs).toBe(MCP_TIMEOUTS.maxMs);
    }
  });
});

describe('validateNexusEnv only reports a knob that actually asked for more', () => {
  it('finds nothing when nothing was set', () => {
    // The empty case, named: with no knob set every declared guard resolves at
    // or below its ceiling, so [] here means "nothing was reduced", not
    // "nothing was checked".
    expect(validateNexusEnv().ineffectiveVars).toEqual([]);
  });

  it('blames the override, not the multiplier, when both are set', () => {
    // The report names a variable to the operator. Defaulting an unattributed
    // clamp to the multiplier would accuse a knob they may not have touched —
    // the same misattribution this report exists to prevent.
    vi.stubEnv(OVERRIDE, String(CLASS_CEILING_MS + 1));
    vi.stubEnv(MULTIPLIER, '2');

    const resolution = describeClassGuard('async-job-body');

    expect(resolution.clampCause).toBe('override');
    expect(validateNexusEnv().ineffectiveVars.map((v) => v.name)).toContain(OVERRIDE);
  });

  it('blames the multiplier when only the multiplier is set', () => {
    // 3 pushes both `pipeline` (1.8M × 3) and `async-job-body` (3.6M × 3)
    // past their respective ceilings; 2 no longer does for async-job-body.
    vi.stubEnv(MULTIPLIER, '3');

    expect(describeClassGuard('pipeline').clampCause).toBe('multiplier');
    expect(describeClassGuard('async-job-body').clampCause).toBe('multiplier');
    expect(validateNexusEnv().ineffectiveVars.map((v) => v.name)).toContain(MULTIPLIER);
  });

  it('finds the class whose override was discarded', () => {
    vi.stubEnv(OVERRIDE, String(CLASS_CEILING_MS + 1));

    expect(validateNexusEnv().ineffectiveVars.map((v) => v.name)).toContain(OVERRIDE);
  });

  it('finds a class whose multiplier was discarded even with no per-class override', () => {
    // `NEXUS_TIMEOUT_MULTIPLIER` is documented as scaling EVERY class. For a
    // class sitting at its ceiling, every value that pushes past it does nothing.
    vi.stubEnv(MULTIPLIER, '3');

    expect(validateNexusEnv().ineffectiveVars.map((v) => v.name)).toContain(MULTIPLIER);
    expect(describeClassGuard('async-job-body').overrideEnvVar).toBeNull();
    expect(describeClassGuard('async-job-body').clampCause).toBe('multiplier');
  });
});

describe('validateNexusEnv surfaces it alongside typos and bad values', () => {
  it('reports the discarded async-job-body override against the class ceiling', () => {
    vi.stubEnv(OVERRIDE, String(CLASS_CEILING_MS + 1));

    const result = validateNexusEnv();

    const ineffective = result.ineffectiveVars.find((v) => v.name === OVERRIDE);
    expect(ineffective).toBeDefined();
    expect(ineffective?.effectiveMs).toBe(CLASS_CEILING_MS);
    expect(ineffective?.requestedMs).toBe(CLASS_CEILING_MS + 1);
    // The message names the ceiling that bit and what raising it costs — a
    // backgrounded body holds a concurrency slot for the whole guard.
    expect(ineffective?.reason).toContain(String(CLASS_CEILING_MS));
    expect(ineffective?.reason).toContain('concurrency slot');
    expect(ineffective?.reason).not.toContain('MCP request ceiling');
    // The variable is spelled correctly and holds a valid value, which is
    // exactly why the two existing checks missed it.
    expect(result.unknownVars.map((u) => u.name)).not.toContain(OVERRIDE);
    expect(result.invalidVars.map((i) => i.name)).not.toContain(OVERRIDE);
  });

  it('no longer reports a value in (3.6M, 7.2M] as discarded for async-job-body', () => {
    vi.stubEnv(OVERRIDE, String(CLASS_CEILING_MS));

    expect(validateNexusEnv().ineffectiveVars).toEqual([]);
  });

  it('still reports a request-bound class against the MCP request ceiling', () => {
    vi.stubEnv(PIPELINE_OVERRIDE, String(CLASS_CEILING_MS));

    const ineffective = validateNexusEnv().ineffectiveVars.find(
      (v) => v.name === PIPELINE_OVERRIDE
    );
    expect(ineffective).toBeDefined();
    expect(ineffective?.effectiveMs).toBe(MCP_TIMEOUTS.maxMs);
    expect(ineffective?.reason).toContain('MCP request ceiling');
    expect(ineffective?.reason).toContain(String(MCP_TIMEOUTS.maxMs));
  });

  it('reports nothing ineffective when the override is within the ceiling', () => {
    vi.stubEnv(OVERRIDE, String(MCP_TIMEOUTS.maxMs / 2));

    expect(validateNexusEnv().ineffectiveVars).toEqual([]);
  });
});

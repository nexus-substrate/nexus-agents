/** Graded evidence comes from existing producers, never defaults (#7069). */
import { describe, expect, it } from 'vitest';
import type { AuthProbeResult } from '../cli/cli-auth-probe.js';
import { resolveAuthEvidence } from './auth-evidence.js';

const unknown = { cli: 'gemini', state: 'unknown' } as const;
describe('auth evidence ladder', () => {
  it('names the empty case and keeps agy unknown unverified', () => {
    expect(resolveAuthEvidence(unknown)).toMatchObject({
      rung: 'none',
      probeState: 'unknown',
      passed: false,
      blocks: false,
      source: 'none',
    });
  });
  it('does not invent provenance for a state-only authenticated input', () => {
    expect(resolveAuthEvidence({ state: 'authenticated' }).rung).toBe('none');
  });
  it.each(['claude', 'codex'] as const)('grades %s env presence as local artifact', (cli) => {
    expect(resolveAuthEvidence({ cli, state: 'authenticated', via: 'env-var' })).toMatchObject({
      rung: 'artifact',
      source: 'artifact',
      passed: true,
    });
  });
  it('grades Claude credential inspection as artifact, not a CLI auth assertion', () => {
    expect(
      resolveAuthEvidence({ cli: 'claude', state: 'authenticated', via: 'cli-credentials' })
    ).toMatchObject({ rung: 'artifact', source: 'artifact' });
  });
  it.each(['codex', 'opencode'] as const)('grades %s CLI auth assertions as probe', (cli) => {
    expect(
      resolveAuthEvidence({ cli, state: 'authenticated', via: 'cli-credentials' })
    ).toMatchObject({ rung: 'probe', source: 'cli', passed: true });
  });
  it('separates rejected artifact inspection from CLI-reported no credentials (#2725)', () => {
    const stale: AuthProbeResult = {
      cli: 'claude',
      state: 'needs-login',
      reason: 'OAuth token expired 2026-10-04T00:00:00Z',
      fixCommand: 'claude /login',
    };
    const noCredentials: AuthProbeResult = {
      cli: 'opencode',
      state: 'needs-login',
      reason: 'No providers configured in opencode',
      fixCommand: 'opencode auth login',
    };
    expect(resolveAuthEvidence(stale)).toMatchObject({
      rung: 'none',
      source: 'artifact',
      passed: false,
      blocks: true,
    });
    expect(resolveAuthEvidence(noCredentials)).toMatchObject({
      rung: 'none',
      source: 'cli',
      passed: false,
      blocks: true,
    });
  });
  it.each(['unknown', 'error', 'not-installed', 'needs-login'] as const)(
    'keeps %s an explicit non-pass probe state',
    (state) => {
      expect(resolveAuthEvidence({ state })).toMatchObject({ probeState: state, passed: false });
    }
  );
});

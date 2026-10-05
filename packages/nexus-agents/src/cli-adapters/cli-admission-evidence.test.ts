/** Proves admission consumes the ladder's decision rather than duplicating it. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as evidence from './auth-evidence.js';
import { cliAuthBlocks, isCliAdmitted } from './cli-admission.js';

afterEach(() => vi.restoreAllMocks());

describe('admission evidence delegation', () => {
  it('uses the measured block verdict in isCliAdmitted', () => {
    const auth = { cli: 'opencode', state: 'authenticated', via: 'cli-credentials' } as const;
    const measurement = evidence.resolveAuthEvidence(auth);
    vi.spyOn(evidence, 'resolveAuthEvidence').mockReturnValue({ ...measurement, blocks: true });
    expect(isCliAdmitted({ healthy: true }, auth)).toBe(false);
  });
  it('uses the measured block verdict in cliAuthBlocks', () => {
    const auth = { cli: 'opencode', state: 'needs-login' } as const;
    const measurement = evidence.resolveAuthEvidence(auth);
    vi.spyOn(evidence, 'resolveAuthEvidence').mockReturnValue({ ...measurement, blocks: false });
    expect(cliAuthBlocks(auth)).toBe(false);
  });
  it('still excludes an unhealthy binary regardless of evidence', () => {
    const auth = { state: 'authenticated' } as const;
    expect(isCliAdmitted({ healthy: false }, auth)).toBe(false);
  });
});

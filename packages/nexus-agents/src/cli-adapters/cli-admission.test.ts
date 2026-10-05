/** Admission characterization before introducing the evidence ladder (#7069). */
import { describe, expect, it } from 'vitest';
import type { AuthProbeResult } from '../cli/cli-auth-probe.js';
import type { CliName } from './types.js';
import { cliAuthBlocks, isCliAdmitted } from './cli-admission.js';

const clis = ['claude', 'codex', 'gemini', 'opencode'] as const satisfies readonly CliName[];
// Expected decisions are literal observations of the pre-ladder policy.
const states = [
  { state: 'authenticated', blocks: false, healthyAdmits: true },
  { state: 'needs-login', blocks: true, healthyAdmits: false },
  { state: 'not-installed', blocks: true, healthyAdmits: false },
  { state: 'unknown', blocks: false, healthyAdmits: true },
  { state: 'error', blocks: false, healthyAdmits: true },
] as const satisfies readonly {
  state: AuthProbeResult['state'];
  blocks: boolean;
  healthyAdmits: boolean;
}[];

describe.each(clis)('%s admission characterization', (cli) => {
  describe.each(states)('$state', ({ state, blocks, healthyAdmits }) => {
    const auth = { cli, state };
    it('preserves the auth block decision', () => {
      expect(cliAuthBlocks(auth)).toBe(blocks);
    });
    it.each([true, false])('preserves admission with healthy=%s', (healthy) => {
      expect(isCliAdmitted({ healthy }, auth)).toBe(healthy ? healthyAdmits : false);
    });
  });
});

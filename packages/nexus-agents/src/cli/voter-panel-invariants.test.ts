import { describe, expect, it } from 'vitest';

import { getCommandDescription } from '../cli-command-catalog.js';
import { SUPERMAJORITY_THRESHOLD } from '../consensus/decision/thresholds.js';
import { getVoterRoles } from './voter-roles.js';

describe('voter panel invariants (#5120)', () => {
  it.each([true, false])('has at least three seats when quick mode is %s', (quick) => {
    expect(getVoterRoles(quick).length).toBeGreaterThanOrEqual(3);
  });

  it.each([true, false])(
    'keeps supermajority distinct from unanimity when quick mode is %s',
    (quick) => {
      const panelSize = getVoterRoles(quick).length;
      expect(Math.ceil(SUPERMAJORITY_THRESHOLD * panelSize)).toBeLessThan(panelSize);
    }
  );

  it('describes the actual full and quick panel sizes in the CLI catalog', () => {
    const description = getCommandDescription('vote');
    expect(description).toContain(`${String(getVoterRoles(false).length)} agents`);
    expect(description).toContain(`uses ${String(getVoterRoles(true).length)}`);
  });
});

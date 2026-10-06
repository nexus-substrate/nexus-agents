/** The run input reaches executors through their declared options only (#4464). */
import { expect, it, vi } from 'vitest';

vi.mock('./run-tool-executors.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./run-tool-executors.js')>()),
  buildDefaultExecutors: vi.fn(() => ({
    consensus: () => Promise.resolve({ decision: 'approved' }),
  })),
}));

import { executeGoal } from './run-tool.js';
import { buildDefaultExecutors } from './run-tool-executors.js';

it('passes only declared executor options when executing a run', async () => {
  await executeGoal(
    {
      goal: 'Decide whether to approve the proposed implementation',
      execute: true,
      forceStrategy: 'consensus',
      sourceTrustTier: '3',
      dryRun: false,
    },
    { consensusEnforcementMode: 'audit' }
  );
  expect(vi.mocked(buildDefaultExecutors).mock.calls[0]?.[2]).toEqual({
    consensusEnforcementMode: 'audit',
    logger: undefined,
    sourceTrustTier: '3',
    dryRun: false,
  });
});

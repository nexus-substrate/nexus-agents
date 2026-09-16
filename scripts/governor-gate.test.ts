/** Stable base-ref dispatcher contract (#6369). */
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runGovernorGate } from './governor-gate.js';
import { runGovernorPathsTouched } from './governor-paths-touched.js';
import { runRequiredJobsCheck } from './check-required-jobs.js';
import { runRatificationGate } from './check-governor-ratification.js';
import { runCodeownersErrors } from './check-codeowners-errors.js';

vi.mock('./governor-paths-touched.js', () => ({ runGovernorPathsTouched: vi.fn() }));
vi.mock('./check-required-jobs.js', () => ({ runRequiredJobsCheck: vi.fn() }));
vi.mock('./check-governor-ratification.js', () => ({ runRatificationGate: vi.fn() }));
vi.mock('./check-codeowners-errors.js', () => ({ runCodeownersErrors: vi.fn() }));

afterEach(() => vi.restoreAllMocks());

describe('governor-gate', () => {
  const targetDir = '/tmp/head checkout';
  // The governor set is policy: `touched` reads it from the gate's own checkout
  // (this repository), not from --target.
  const policyDir = dirname(dirname(fileURLToPath(import.meta.url)));
  const cases = [
    { step: 'touched', run: runGovernorPathsTouched, args: [policyDir] },
    { step: 'required-jobs', run: runRequiredJobsCheck, args: [targetDir] },
    { step: 'ratification', run: runRatificationGate, args: [process.env, targetDir] },
    { step: 'codeowners-errors', run: runCodeownersErrors, args: [targetDir, []] },
  ];
  describe.each(cases)('$step', ({ step, run, args }) => {
    it.each([0, 1, 2])('dispatches only the named function and preserves exit %i', async (exit) => {
      vi.mocked(runGovernorPathsTouched).mockReturnValue(exit);
      vi.mocked(runRequiredJobsCheck).mockReturnValue(exit);
      vi.mocked(runRatificationGate).mockReturnValue(exit);
      vi.mocked(runCodeownersErrors).mockResolvedValue(exit);
      expect(await runGovernorGate([step, '--target', targetDir])).toBe(exit);
      expect(run).toHaveBeenCalledExactlyOnceWith(...args);
      for (const other of cases.filter((candidate) => candidate.step !== step)) {
        expect(other.run).not.toHaveBeenCalled();
      }
    });
  });

  it.each(['constructor', '__proto__', 'toString'])(
    'a step named like an Object prototype member is unknown (exit 2), never a runner: %s',
    async (step) => {
      expect(await runGovernorGate([step, '--target', targetDir])).toBe(2);
      for (const { run } of cases) expect(run).not.toHaveBeenCalled();
    }
  );

  it('forwards CODEOWNERS ref arguments', async () => {
    vi.mocked(runCodeownersErrors).mockResolvedValue(0);
    expect(
      await runGovernorGate(['codeowners-errors', '--target', '/tmp/head', '--ref', 'abc'])
    ).toBe(0);
    expect(runCodeownersErrors).toHaveBeenCalledWith('/tmp/head', ['--ref', 'abc']);
  });

  it.each(['unknown', ''])('names unknown step %j and exits 2', async (step) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await runGovernorGate([step, '--target', '/tmp/head'])).toBe(2);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('unknown step'));
  });

  it.each([[], ['touched'], ['touched', '--target'], ['touched', '--target', '']])(
    'refuses missing target: %j',
    async (...args) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      expect(await runGovernorGate(args)).toBe(2);
    }
  );
});

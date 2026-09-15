/** The stamp precondition executes the trusted injector against target data (#6369). */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { injectorIsClean } from './governance-stamp-exemption.js';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));
const root = dirname(dirname(fileURLToPath(import.meta.url)));
afterEach(() => vi.resetAllMocks());

describe('injector target binding', () => {
  it('changes the target sent to the trusted script and propagates its measured failure', () => {
    const result = { pid: 1, output: ['', '', ''], stdout: '', stderr: '', signal: null };
    vi.mocked(spawnSync).mockReturnValueOnce({ ...result, status: 0 });
    expect(injectorIsClean('/tmp/target-one')).toBe(true);
    vi.mocked(spawnSync).mockReturnValueOnce({ ...result, status: 1 });
    expect(injectorIsClean('/tmp/target-two')).toBe(false);
    for (const [call, target] of [
      [1, '/tmp/target-one'],
      [2, '/tmp/target-two'],
    ] as const) {
      expect(spawnSync).toHaveBeenNthCalledWith(
        call,
        'pnpm',
        ['exec', 'tsx', join(root, 'scripts/inject-governance.ts'), 'check'],
        expect.objectContaining({
          cwd: root,
          env: expect.objectContaining({ NEXUS_SCRIPT_ROOT: target, NEXUS_GOVERNOR_GATE: '1' }),
        })
      );
    }
  });
});

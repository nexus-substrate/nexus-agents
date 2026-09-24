/**
 * Seam test: the sandbox resolves the working directory ONCE, in the policy
 * evaluation, and runs the command in that canonical directory. A resolver
 * that answers differently on a second call (a symlink swapped between check
 * and use) must not move execution to the caller's raw path.
 *
 * @module security/sandbox/sandbox-executor-cwd-seam.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const resolveInsideRoot = vi.fn<(filePath: string, root?: string) => string | null>();
vi.mock('../safe-path.js', () => ({
  resolveInsideRoot: (filePath: string, root?: string) => resolveInsideRoot(filePath, root),
}));

const { PolicySandboxExecutor } = await import('./sandbox-executor.js');
const { STANDARD_POLICY } = await import('./default-policies.js');

describe('sandbox cwd is resolved once', () => {
  let rawDir: string;
  let canonicalDir: string;

  beforeEach(() => {
    resolveInsideRoot.mockReset();
    // Distinct real dirs, so the child's physical cwd shows which one was used.
    rawDir = realpathSync(mkdtempSync(join(tmpdir(), 'nexus-sbx-raw-')));
    canonicalDir = realpathSync(mkdtempSync(join(tmpdir(), 'nexus-sbx-canon-')));
  });

  afterEach(() => {
    rmSync(rawDir, { recursive: true, force: true });
    rmSync(canonicalDir, { recursive: true, force: true });
  });

  const options = (): Parameters<InstanceType<typeof PolicySandboxExecutor>['execute']>[2] => ({
    cwd: rawDir,
    policy: {
      ...STANDARD_POLICY,
      allowedCommands: ['pwd'],
      pathRules: [{ path: rawDir, access: 'read' }],
    },
  });

  it('runs in the approved canonical dir even if a second resolve would return null', async () => {
    resolveInsideRoot.mockReturnValueOnce(canonicalDir).mockReturnValue(null);
    const executor = new PolicySandboxExecutor({ enforce: true });

    const result = await executor.execute('pwd', ['-P'], options());

    expect(result.success).toBe(true);
    expect(result.stdout.trim()).toBe(canonicalDir);
    expect(resolveInsideRoot).toHaveBeenCalledTimes(1);
  });

  it('denies under enforce when the cwd does not resolve, without running', async () => {
    resolveInsideRoot.mockReturnValue(null);
    const executor = new PolicySandboxExecutor({ enforce: true });

    const result = await executor.execute('pwd', ['-P'], options());

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(126);
    expect(result.stdout).toBe('');
  });
});

/** Shared scope for captured changes and dependency coverage. */
import { execFileTree, type CommandWrapper } from '../cli-adapters/exec-file-tree.js';
import { hermeticGitEnv } from '../utils/hermetic-git-env.js';

// Installed dependencies are runtime inputs, excluded even when not ignored.
// The security gate scans this same root; its excludes (COMPLETE_SCAN_FLAGS in
// mcp/tools/security-scan.ts) must stay a subset of these, or captured files go unscanned.
export const PATCH_PATHS = [
  '.',
  ':(exclude,glob)**/node_modules',
  ':(exclude,glob)**/node_modules/**',
];

/** Manifest destinations changed since the capture baseline, including new files. */
export async function changedPackageManifests(
  root: string,
  baseSha: string,
  options: { env?: NodeJS.ProcessEnv | undefined; wrapper?: CommandWrapper | undefined },
  signal?: AbortSignal
): Promise<string[]> {
  const git = async (args: string[]): Promise<string[]> => {
    const { stdout } = await execFileTree(
      'git',
      ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', ...args],
      {
        cwd: root,
        env: { ...hermeticGitEnv(), ...options.env, GIT_OPTIONAL_LOCKS: '0' },
        wrapper: options.wrapper,
        signal,
        timeoutMs: 30_000,
        maxBuffer: 16 * 1024 * 1024,
      }
    );
    return stdout.split('\0').filter((file) => file !== '');
  };
  // Without rename detection, the destination is an addition and the deleted
  // source is excluded. Untracked additions have not yet been staged by capture.
  const changed = await git([
    'diff',
    '--name-only',
    '-z',
    '--no-renames',
    '--diff-filter=AMT',
    '--no-ext-diff',
    '--no-textconv',
    baseSha,
    '--',
    ...PATCH_PATHS,
  ]);
  const added = await git([
    'ls-files',
    '--others',
    '--exclude-standard',
    '-z',
    '--',
    ...PATCH_PATHS,
  ]);
  return [...new Set([...changed, ...added])].filter(
    (file) => file.split('/').at(-1) === 'package.json'
  );
}

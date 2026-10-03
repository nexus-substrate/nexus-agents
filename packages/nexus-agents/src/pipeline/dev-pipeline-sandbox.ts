/** One bwrap invocation profile for scratch installs and gates (#7011). */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { execFileTree, type CommandWrapper } from '../cli-adapters/exec-file-tree.js';
import {
  BWRAP_READ_ONLY_ARGS,
  createBwrapPreflight,
} from '../cli-adapters/codex-sandbox-preflight.js';
import { hermeticGitEnv } from '../utils/hermetic-git-env.js';

/** One measurement shared by every scratch pipeline in this process. */
export const bwrapPreflight = createBwrapPreflight();

interface SandboxPaths {
  readonly scratch: string;
  readonly gitDir: string;
  readonly temp: string;
  readonly caches: readonly string[];
}

/** Writable mounts are explicit. Network stays in the host namespace for cache misses. */
export function buildSandboxInvocation(
  command: Parameters<CommandWrapper>[0],
  args: Parameters<CommandWrapper>[1],
  options: Parameters<CommandWrapper>[2],
  paths: SandboxPaths
): ReturnType<CommandWrapper> {
  const writable = [...new Set([paths.scratch, paths.gitDir, paths.temp, ...paths.caches])];
  return {
    command: 'bwrap',
    args: [
      ...BWRAP_READ_ONLY_ARGS,
      ...writable.flatMap((path) => ['--bind', path, path]),
      '--',
      command,
      ...args,
    ],
    options: {
      ...options,
      env: {
        ...(options.env ?? process.env),
        TMPDIR: paths.temp,
        SEMGREP_SETTINGS_FILE: join(paths.temp, 'semgrep-settings.yaml'),
        SEMGREP_LOG_FILE: join(paths.temp, 'semgrep.log'),
        SEMGREP_VERSION_CACHE_PATH: join(paths.temp, 'semgrep-version'),
      },
    },
  };
}

function gitPath(scratch: string, flag: string): string {
  return realpathSync(
    execFileSync('git', ['rev-parse', '--path-format=absolute', flag], {
      cwd: scratch,
      env: hermeticGitEnv(),
      encoding: 'utf8',
      timeout: 10_000,
    }).trim()
  );
}

/** Resolve symlinked ancestors even when the cache does not exist yet. */
function canonicalPath(path: string): string {
  if (existsSync(path)) return realpathSync(path);
  return join(canonicalPath(dirname(path)), relative(dirname(path), path));
}

function overlaps(a: string, b: string): boolean {
  const contains = (parent: string, child: string): boolean => {
    const path = relative(parent, child);
    return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
  };
  return contains(a, b) || contains(b, a);
}

/** Drop inherited directory redirects before pinning scratch-local install paths. */
export function dependencyInstallEnv(scratchPath: string): NodeJS.ProcessEnv {
  const env = Object.fromEntries(
    Object.entries(hermeticGitEnv()).filter(
      ([name]) =>
        !/^npm_config_(?:virtual_store_dir|modules_dir|lockfile_dir|dir|global_dir|prefix)$/i.test(
          name
        )
    )
  );
  // Shared cache imports must be copies, never hardlinks into source dependencies.
  env['npm_config_package_import_method'] = 'copy';
  env['npm_config_enable_global_virtual_store'] = 'false';
  env['npm_config_modules_dir'] = 'node_modules';
  env['npm_config_virtual_store_dir'] = join(scratchPath, 'node_modules/.pnpm');
  // Husky would otherwise change the git config shared with the source repository.
  env['HUSKY'] = '0';
  return env;
}

function cacheQueries(scratch: string): [string, string[]][] {
  if (existsSync(join(scratch, 'pnpm-lock.yaml')))
    return [
      ['pnpm', ['store', 'path']],
      ['pnpm', ['config', 'get', 'cache-dir']],
    ];
  if (existsSync(join(scratch, 'package-lock.json'))) return [['npm', ['config', 'get', 'cache']]];
  if (existsSync(join(scratch, 'yarn.lock'))) return [['yarn', ['cache', 'dir']]];
  return []; // No supported lockfile means no package-cache mounts.
}

/** Resolve the selected manager's actual store/cache under the read-only profile. */
async function resolveCaches(paths: SandboxPaths, source: string): Promise<string[]> {
  const caches: string[] = [];
  const commonDir = gitPath(paths.scratch, '--git-common-dir');
  for (const [command, args] of cacheQueries(paths.scratch)) {
    const { stdout } = await execFileTree(command, args, {
      cwd: paths.scratch,
      env: dependencyInstallEnv(paths.scratch),
      timeoutMs: 10_000,
      wrapper: (cmd, argv, opts) => buildSandboxInvocation(cmd, argv, opts, paths),
    });
    let value = stdout.trim();
    // pnpm's Linux default metadata cache is separate from its content store.
    if (value === 'undefined' && args.includes('cache-dir')) {
      value = join(process.env['XDG_CACHE_HOME'] ?? join(homedir(), '.cache'), 'pnpm');
    }
    if (value === '' || value === 'undefined') throw new Error(`Cannot resolve ${command} cache`);
    const cache = canonicalPath(resolve(paths.scratch, value));
    if (overlaps(cache, source) || overlaps(cache, commonDir)) {
      throw new Error(`Package cache overlaps protected source or git metadata: ${cache}`);
    }
    mkdirSync(cache, { recursive: true });
    caches.push(cache);
  }
  return caches;
}

/** Allocate private temp and pin the scratch's exact worktree index directory. */
export async function createScratchSandbox(
  scratch: string,
  source: string
): Promise<{ wrapper: CommandWrapper; gitEnv: NodeJS.ProcessEnv; dispose: () => void }> {
  const temp = mkdtempSync(join(dirname(scratch), 'sandbox-tmp-'));
  try {
    const paths: SandboxPaths = {
      scratch: realpathSync(scratch),
      gitDir: gitPath(scratch, '--git-dir'),
      temp,
      caches: [],
    };
    const caches = await resolveCaches(paths, realpathSync(source));
    // Even intent-to-add creates the empty blob. Keep all object writes private.
    const objects = join(paths.gitDir, 'sandbox-objects');
    mkdirSync(objects);
    const gitEnv = {
      GIT_OBJECT_DIRECTORY: objects,
      GIT_ALTERNATE_OBJECT_DIRECTORIES: JSON.stringify(
        join(gitPath(scratch, '--git-common-dir'), 'objects')
      ),
    };
    return {
      gitEnv,
      wrapper: (command, args, options) =>
        buildSandboxInvocation(
          command,
          args,
          { ...options, env: { ...(options.env ?? process.env), ...gitEnv } },
          { ...paths, caches }
        ),
      dispose: () => {
        rmSync(temp, { recursive: true, force: true });
      },
    };
  } catch (error: unknown) {
    rmSync(temp, { recursive: true, force: true });
    throw error;
  }
}

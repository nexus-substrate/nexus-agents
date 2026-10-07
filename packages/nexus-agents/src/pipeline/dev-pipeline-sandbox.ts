/** One bwrap profile for scratch experts, installs, gates and change capture (#7011). */
import { execFileSync } from 'node:child_process';
import {
  accessSync,
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { type CommandWrapper } from '../cli-adapters/exec-file-tree.js';
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
}

/** Pin the host executable before scratch code can add a bwrap alias to PATH. */
const bwrapCommand = (() => {
  for (const directory of (process.env['PATH'] ?? '').split(delimiter)) {
    if (!isAbsolute(directory)) continue;
    const binary = join(directory, 'bwrap');
    try {
      accessSync(binary, constants.X_OK);
      return realpathSync(binary);
    } catch {
      // Try the next absolute host PATH entry. Missing bwrap is measured by preflight.
    }
  }
  return '/usr/bin/bwrap';
})();

/** Drop host IPC and package cache redirects before installing private paths. */
function sandboxEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const ipcNames = new Set([
    'DBUS_SESSION_BUS_ADDRESS',
    'DBUS_SYSTEM_BUS_ADDRESS',
    'DOCKER_HOST',
    'XDG_RUNTIME_DIR',
    'SSH_AUTH_SOCK',
  ]);
  return Object.fromEntries(
    Object.entries(env).filter(
      ([name]) =>
        !ipcNames.has(name) &&
        !/^npm_config_(?:store_dir|cache|cache_dir|package_import_method|enable_global_virtual_store)$/i.test(
          name
        ) &&
        name.toUpperCase() !== 'YARN_CACHE_FOLDER'
    )
  );
}

/** Writable paths are private. Network and abstract-namespace sockets remain reachable. */
export function buildSandboxInvocation(
  command: Parameters<CommandWrapper>[0],
  args: Parameters<CommandWrapper>[1],
  options: Parameters<CommandWrapper>[2],
  paths: SandboxPaths
): ReturnType<CommandWrapper> {
  const writable = [...new Set([paths.scratch, paths.gitDir, paths.temp])];
  const socketPaths = [
    ...new Set(
      ['/var/run/docker.sock', '/run/docker.sock']
        .filter(existsSync)
        .map((path) => realpathSync(path))
    ),
  ];
  const env = sandboxEnv(options.env ?? process.env);
  return {
    command: bwrapCommand,
    args: [
      ...BWRAP_READ_ONLY_ARGS,
      ...writable.flatMap((path) => ['--bind', path, path]),
      '--tmpfs',
      '/run/user',
      // Canonicalize /var/run aliases because bwrap cannot mount through that symlink.
      ...socketPaths.flatMap((path) => ['--ro-bind', '/dev/null', path]),
      '--',
      command,
      ...args,
    ],
    options: {
      ...options,
      env: {
        ...env,
        TMPDIR: paths.temp,
        npm_config_store_dir: join(paths.temp, 'pnpm-store'),
        npm_config_cache: join(paths.temp, 'npm-cache'),
        npm_config_cache_dir: join(paths.temp, 'pnpm-cache'),
        YARN_CACHE_FOLDER: join(paths.temp, 'yarn-cache'),
        // The home dir is read-only here, and codex refuses to start without a
        // writable home ("failed to initialize in-process app-server client").
        CODEX_HOME: join(paths.temp, CODEX_HOME_DIR),
        npm_config_package_import_method: 'copy',
        npm_config_enable_global_virtual_store: 'false',
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

/**
 * A package-manager script (`pnpm run`, `npm run`, `npx`) exports its whole
 * resolved config as npm_config_* plus its own run context. That is the
 * launcher's config, flattened, not the operator's: npm treats an env entry like
 * a CLI flag, so `allow-scripts=…` that npm accepts in ~/.npmrc fails the scratch
 * `npm ci` with EALLOWSCRIPTS once re-exported (#7137), and pnpm points
 * npm_config_globalconfig at its own rc. The child installer re-reads the config
 * files itself, so dropping the flattened layer loses nothing it would honour.
 */
function launchedByPackageManagerScript(env: NodeJS.ProcessEnv): boolean {
  return env['npm_lifecycle_event'] !== undefined || env['npm_execpath'] !== undefined;
}

const PACKAGE_MANAGER_SCRIPT_ENV = /^(?:npm_|pnpm_|PNPM_SCRIPT_SRC_DIR$|NODE_PATH$)/i;

/** Drop inherited directory redirects before pinning scratch-local install paths. */
export function dependencyInstallEnv(scratchPath: string): NodeJS.ProcessEnv {
  const inherited = hermeticGitEnv();
  const fromLauncher = launchedByPackageManagerScript(inherited);
  const env = Object.fromEntries(
    Object.entries(inherited).filter(
      ([name]) =>
        !(fromLauncher && PACKAGE_MANAGER_SCRIPT_ENV.test(name)) &&
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

/** Allocate private temp and pin the scratch's exact worktree index directory. */
const CODEX_HOME_DIR = 'codex-home';
/** Only what codex needs to authenticate and keep its configured defaults. */
const CODEX_HOME_SEED_FILES = ['auth.json', 'config.toml'] as const;

/**
 * Give a sandboxed codex a PRIVATE home seeded with copies of its auth and
 * config. Measured (#7011): with the real home read-only, `codex exec` exits 1;
 * with a private CODEX_HOME holding these two copies it runs. The host home is
 * never writable, so a sandboxed process cannot plant config the host's own
 * codex would later load; token refreshes land in the throwaway copy.
 */
function seedCodexHome(target: string): void {
  mkdirSync(target, { recursive: true });
  const configured = process.env['CODEX_HOME']?.trim() ?? '';
  const hostHome = configured !== '' ? configured : join(homedir(), '.codex');
  for (const name of CODEX_HOME_SEED_FILES) {
    const from = join(hostHome, name);
    if (existsSync(from)) copyFileSync(from, join(target, name));
  }
}

export async function createScratchSandbox(
  scratch: string,
  source: string
): Promise<{ wrapper: CommandWrapper; gitEnv: NodeJS.ProcessEnv; dispose: () => void }> {
  const protectedSource = await realpath(source);
  const scratchPath = realpathSync(scratch);
  const contains = (parent: string, child: string): boolean => {
    const path = relative(parent, child);
    return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
  };
  if (contains(protectedSource, scratchPath) || contains(scratchPath, protectedSource)) {
    throw new Error('Writable scratch path overlaps protected source');
  }
  const temp = mkdtempSync(join(dirname(scratchPath), 'sandbox-tmp-'));
  try {
    const paths: SandboxPaths = {
      scratch: scratchPath,
      gitDir: gitPath(scratch, '--git-dir'),
      temp,
    };
    seedCodexHome(join(temp, CODEX_HOME_DIR));
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
          paths
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

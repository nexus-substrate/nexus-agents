import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let configKeys: ReadonlySet<string> | undefined;

/** Query the installed npm once, without project/user config or pnpm's env. */
function npmConfigKeys(source: NodeJS.ProcessEnv): ReadonlySet<string> {
  if (configKeys !== undefined) return configKeys;
  const cwd = mkdtempSync(join(tmpdir(), 'nexus-npm-config-'));
  try {
    const parsed: unknown = JSON.parse(
      execFileSync(
        'npm',
        [
          'config',
          'ls',
          '-l',
          '--json',
          `--userconfig=${join(cwd, 'user.npmrc')}`,
          `--globalconfig=${join(cwd, 'global.npmrc')}`,
        ],
        {
          cwd,
          env: Object.fromEntries(
            Object.entries({ ...process.env, ...source }).filter(
              ([key]) => !/^npm_config_/i.test(key)
            )
          ),
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 30_000,
        }
      )
    );
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !['registry', 'userconfig', 'cache', 'provenance'].every((key) => key in parsed)
    ) {
      throw new Error('npm config ls -l --json did not return npm config defaults');
    }
    // Auth is redacted from npm's listing. Internal env keys are accepted by
    // @npmcli/config even though they are not public config definitions.
    configKeys = new Set([...Object.keys(parsed), '_auth', 'global-prefix', 'local-prefix']);
    return configKeys;
  } catch (cause) {
    throw new Error('Cannot discover npm config keys; check npm on PATH before publishing', {
      cause,
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

/** npm's nerf-dart auth keys, omitted from `npm config ls` (npmcli/config). */
const SCOPED_AUTH = new Set([
  '_auth',
  '_authToken',
  '_password',
  'certfile',
  'email',
  'keyfile',
  'username',
]);

function knownConfig(key: string, known: ReadonlySet<string>): boolean {
  if (!/^npm_config_/i.test(key)) return true;
  let name = key.slice('npm_config_'.length);
  // Match npm loadEnv: preserve leading underscores and nerf-dart spelling.
  if (!name.startsWith('//')) name = name.replace(/(?!^)_/g, '-').toLowerCase();
  if (known.has(name)) return true;
  const scopedKey = name.includes(':') ? name.slice(name.lastIndexOf(':') + 1) : undefined;
  return scopedKey !== undefined && (known.has(scopedKey) || SCOPED_AUTH.has(scopedKey));
}

/** Environment shared by staging and release publishing (#6894, #6904). */
export function publishEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const known = npmConfigKeys(source);
  const env: NodeJS.ProcessEnv = Object.fromEntries(
    Object.entries(source).filter(([key]) => knownConfig(key, known))
  );
  // pnpm 10 injects the legacy npm variable into exec/run children. Keep its
  // pnpm-only equivalent so nested commands retain the same verification policy.
  env['pnpm_config_verify_deps_before_run'] ??=
    source['npm_config_verify_deps_before_run'] ?? source['NPM_CONFIG_VERIFY_DEPS_BEFORE_RUN'];
  // Changesets invokes pnpm again: CLI flags on the outer exec do not survive.
  // pnpm-workspace.yaml reads this variable; npm does not treat it as config.
  env['NEXUS_PUBLISH_NODE_LINKER'] = 'hoisted';
  return env;
}

// Execute AFTER pnpm exec/run has exported its configuration. All commands
// downstream (including pnpm publish's npm child) inherit the cleaned env.
if (process.argv[1]?.endsWith('publish-env.ts') === true) {
  const [command, ...args] = process.argv.slice(2);
  if (command === undefined) throw new Error('publish-env requires a command');
  const child = spawnSync(command, args, { stdio: 'inherit', env: publishEnv(process.env) });
  if (child.error !== undefined) throw child.error;
  // Re-raise a signal death so callers (release-publish.ts) still see a null
  // exit code and report "killed by a signal" rather than a generic exit 1.
  if (child.signal !== null) process.kill(process.pid, child.signal);
  else process.exitCode = child.status ?? 1;
}

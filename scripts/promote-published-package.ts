/** Promote a downloadable package from next to latest using npm's OIDC support (#6514). */
import { spawnSync } from 'node:child_process';
import semver from 'semver';
import { z } from 'zod';

export interface CommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: Error | undefined;
}

export type CommandRunner = (command: string, args: readonly string[]) => CommandResult;
export type PromotionResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const PromotionInput = z.object({
  packageName: z.string().max(214).regex(PACKAGE_NAME),
  version: z.string().refine((version) => semver.valid(version) === version),
});

const runCommand: CommandRunner = (command, args) => {
  const result = spawnSync(command, [...args], {
    encoding: 'utf8',
    timeout: 120_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.error,
  };
};

function runWrappedNpm(args: readonly string[], run: CommandRunner): CommandResult {
  try {
    return run('pnpm', ['exec', 'tsx', 'scripts/publish-env.ts', 'npm', ...args]);
  } catch (error: unknown) {
    return {
      status: null,
      stdout: '',
      stderr: '',
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

function commandFailure(result: CommandResult): string | undefined {
  if (result.error !== undefined) return result.error.message;
  if (result.status === 0) return undefined;
  return result.stderr.trim() || result.stdout.trim() || `npm exited ${String(result.status)}`;
}

function failure(message: string): Extract<PromotionResult, { readonly ok: false }> {
  const escaped = message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  return { ok: false, reason: `::error::${escaped}` };
}

function inspectCurrentLatest(
  packageName: string,
  version: string,
  run: CommandRunner
):
  | { readonly ok: true; readonly alreadyLatest: boolean }
  | { readonly ok: false; readonly reason: string } {
  const view = runWrappedNpm(['view', packageName, 'dist-tags.latest'], run);
  const viewError = commandFailure(view);
  if (viewError !== undefined)
    return failure(`Could not read current latest for ${packageName}: ${viewError}.`);
  const latest = view.stdout.trim();
  if (latest === '' || semver.valid(latest) !== latest) {
    return failure(
      `Could not measure current latest for ${packageName}: ${latest === '' ? '(empty)' : latest}.`
    );
  }
  if (semver.gt(latest, version)) {
    return failure(`Refusing to roll back ${packageName} latest from ${latest} to ${version}.`);
  }
  return { ok: true, alreadyLatest: latest === version };
}

function failedPromotion(id: string, add: CommandResult, addError: string): PromotionResult {
  const refused =
    add.error === undefined && add.status !== null && /E401|E403|\b403\b|\b401\b/.test(addError);
  const setup = refused
    ? ' Enable "Allow npm dist-tag" in the package trusted-publisher configuration and use npm CLI >= 11.21.0 (or >= 12.2.0).'
    : '';
  const state = refused
    ? 'latest remains on the previous version.'
    : 'The promotion outcome is unknown; inspect latest before retrying.';
  return failure(`Could not promote ${id}: ${addError}.${setup} ${state}`);
}

/** Missing or duplicate latest lines cannot verify a promotion. */
function latestFromTags(stdout: string): string {
  const latestTags = stdout.split(/\r?\n/).filter((line) => line.startsWith('latest:'));
  return latestTags.length === 1 ? (latestTags[0]?.slice('latest:'.length).trim() ?? '') : '';
}

/** Call only after the exact package version's tarball has returned HTTP 200. */
export function promotePublishedPackage(
  packageName: string,
  version: string,
  run: CommandRunner = runCommand
): PromotionResult {
  if (!PromotionInput.safeParse({ packageName, version }).success) {
    return failure('Promotion requires a valid npm package name and an exact semantic version.');
  }
  const current = inspectCurrentLatest(packageName, version, run);
  if (!current.ok) return current;
  if (current.alreadyLatest) return { ok: true };
  const id = `${packageName}@${version}`;
  const add = runWrappedNpm(['dist-tag', 'add', id, 'latest'], run);
  const addError = commandFailure(add);
  if (addError !== undefined) {
    return failedPromotion(id, add, addError);
  }
  // The package document used by npm view may be cached after promotion.
  // dist-tag ls reads the dist-tags endpoint directly instead (#6514).
  const tags = runWrappedNpm(['dist-tag', 'ls', packageName], run);
  const tagsError = commandFailure(tags);
  if (tagsError !== undefined) {
    return failure(`Promotion of ${id} ran, but could not verify latest: ${tagsError}.`);
  }
  const latest = latestFromTags(tags.stdout);
  if (latest === '' || latest !== version) {
    return failure(
      `Promotion of ${id} ran, but could not verify latest: expected ${version}, received ${latest === '' ? '(empty)' : latest}.`
    );
  }
  return { ok: true };
}

if (process.argv[1]?.endsWith('promote-published-package.ts') === true) {
  const [packageName = '', version = ''] = process.argv.slice(2);
  const result = promotePublishedPackage(packageName, version);
  if (!result.ok) {
    console.error(result.reason);
    process.exitCode = 1;
  } else {
    console.log(`Verified ${packageName} dist-tags.latest is ${version}`);
  }
}

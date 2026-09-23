/**
 * Run `changeset publish`, forgiving only npm's staged-publish conflict (#6500).
 *
 * npm stages a publish before it becomes visible — for up to about 17 minutes
 * (observed 2026-09-23). Inside that window `npm view` and changesets' own
 * "not found in registry" check both miss the version, so a second release
 * run on main tries to publish it again and npm answers
 * `E409 ... Cannot publish over previously staged version "X"`. changesets
 * then exits 1 and the release job goes red although the version is already
 * on its way (run 35831579625).
 *
 * This wrapper runs `changeset publish` under the hoisted linker, streams its
 * output through unchanged, and on a non-zero exit forgives it ONLY when every
 * failed package's error is that staged-version E409 for exactly the version
 * in the package's local package.json. Anything else — another error, a mix,
 * a different version, output it cannot parse, or a non-zero exit with no
 * parsed failure at all — keeps the non-zero exit.
 *
 * changesets/action (v2) learns what was published from the NDJSON file named
 * by `CHANGESETS_OUTPUT`, which the child inherits through the environment,
 * not from stdout. A staged package gets no `git-tag` event, so the action
 * creates no tag or GitHub Release for it on this run — correct, because the
 * run that staged the version already did.
 *
 * @module scripts/release-publish
 * (Source: Issue #6500)
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { ROOT } from './script-paths.js';

export interface PublishFailure {
  readonly name: string;
  readonly version: string;
  /** The `└ CODE: message` line, or undefined when changesets printed none. */
  readonly error: string | undefined;
}

export type PublishVerdict =
  | { readonly ok: true; readonly staged: readonly PublishFailure[] }
  | { readonly ok: false; readonly reason: string };

const FAILURE_HEADER = 'Some packages failed to publish:';
const ENTRY_LINE = /^(@?[^@\s]+)@(\S+)$/;
const ERROR_LINE = /^└\s+(.+)$/;
const STAGED_E409 = /^E409:\s.*Cannot publish over previously staged version "([^"]+)"/;
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;

/** Parse the failure section changesets v3 prints; [] when there is none. */
export function parsePublishFailures(output: string): PublishFailure[] {
  const lines = output
    .replace(ANSI, '')
    .split(/\r?\n/)
    .map((line) => line.trim());
  const start = lines.findIndex((line) => line.endsWith(FAILURE_HEADER));
  if (start === -1) return [];
  const failures: PublishFailure[] = [];
  for (const line of lines.slice(start + 1)) {
    const entry = ENTRY_LINE.exec(line);
    const error = ERROR_LINE.exec(line);
    const last = failures.at(-1);
    if (entry?.[1] !== undefined && entry[2] !== undefined) {
      failures.push({ name: entry[1], version: entry[2], error: undefined });
    } else if (error?.[1] !== undefined && last !== undefined && last.error === undefined) {
      failures[failures.length - 1] = { ...last, error: error[1] };
    } else {
      break;
    }
  }
  return failures;
}

/** Why `failure` is not the forgivable staged E409, or undefined when it is. */
function whyNotStaged(
  failure: PublishFailure,
  localVersions: ReadonlyMap<string, string>
): string | undefined {
  const id = `${failure.name}@${failure.version}`;
  const local = localVersions.get(failure.name);
  if (local === undefined) return `${id}: no local package.json for ${failure.name}`;
  if (failure.version !== local) return `${id}: local package.json is at ${local}`;
  const staged = failure.error === undefined ? null : STAGED_E409.exec(failure.error);
  if (staged === null) return `${id}: ${failure.error ?? '(no error line)'}`;
  if (staged[1] !== local) return `${id}: npm staged ${staged[1] ?? '?'}, local is ${local}`;
  return undefined;
}

/** Decide whether a `changeset publish` exit is a real failure. */
export function evaluatePublishExit(input: {
  readonly exitCode: number | null;
  readonly output: string;
  readonly localVersions: ReadonlyMap<string, string>;
}): PublishVerdict {
  if (input.exitCode === 0) return { ok: true, staged: [] };
  if (input.exitCode === null)
    return { ok: false, reason: 'changeset publish was killed by a signal' };
  const failures = parsePublishFailures(input.output);
  if (failures.length === 0) {
    return { ok: false, reason: `exit ${String(input.exitCode)} with no parsable package failure` };
  }
  const reasons = failures
    .map((failure) => whyNotStaged(failure, input.localVersions))
    .filter((reason): reason is string => reason !== undefined);
  if (reasons.length > 0) return { ok: false, reason: reasons.join('; ') };
  return { ok: true, staged: failures };
}

/** Map each `packages/*` workspace package name to its package.json version. */
export function readLocalVersions(root: string): Map<string, string> {
  const versions = new Map<string, string>();
  const packagesDir = join(root, 'packages');
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    const manifest = join(packagesDir, entry.name, 'package.json');
    if (!entry.isDirectory() || !existsSync(manifest)) continue;
    const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) continue;
    const { name, version } = parsed as Record<string, unknown>;
    if (typeof name === 'string' && typeof version === 'string') versions.set(name, version);
  }
  return versions;
}

export interface TeeSinks {
  readonly stdout: (chunk: Buffer) => void;
  readonly stderr: (chunk: Buffer) => void;
}

/** Run a command, streaming each chunk to `sinks` and capturing combined output. */
export function teeCommand(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  sinks: TeeSinks
): Promise<{ exitCode: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const child = spawn(command, args, { env, stdio: ['inherit', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      sinks.stdout(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      sinks.stderr(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ exitCode: code, output: Buffer.concat(chunks).toString('utf8') });
    });
  });
}

async function main(argv: readonly string[]): Promise<number> {
  const { exitCode, output } = await teeCommand(
    'pnpm',
    ['exec', 'changeset', 'publish', ...argv],
    { ...process.env, npm_config_node_linker: 'hoisted' },
    { stdout: (c) => process.stdout.write(c), stderr: (c) => process.stderr.write(c) }
  );
  const verdict = evaluatePublishExit({ exitCode, output, localVersions: readLocalVersions(ROOT) });
  if (!verdict.ok) {
    console.error(`release-publish: changeset publish failed (${verdict.reason}).`);
    return exitCode === null || exitCode === 0 ? 1 : exitCode;
  }
  for (const pkg of verdict.staged) {
    console.log(
      `::warning::${pkg.name}@${pkg.version} is staged on npm but not yet visible, so this run could not publish it again (#6500). The run that staged it owns the tag and GitHub Release; confirm with \`npm view ${pkg.name}@${pkg.version} version\` once npm makes it visible.`
    );
  }
  return 0;
}

if (process.argv[1]?.endsWith('release-publish.ts') === true) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error('release-publish: could not run changeset publish:', err);
      process.exit(1);
    }
  );
}

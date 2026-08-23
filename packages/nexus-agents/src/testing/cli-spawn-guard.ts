/**
 * Fails any unit test that spawns a real agent-CLI binary (#4639).
 *
 * ## Why
 *
 * #4629 found 23 real `opencode` spawns across four test files, none of them an
 * opt-in integration test. The visible cost was disk — each spawn unpacks an
 * 8.2 MB `libopentui.so` into `$TMPDIR` and never removes it. The cost that
 * matters is determinism: a unit test that shells out to an installed binary
 * makes the suite's result depend on what is on the machine. On a box without
 * `opencode` those four tests took a different branch, and nothing reported
 * which branch had run.
 *
 * Fixing the four instances does not stop the fifth. This does.
 *
 * ## Why it lives here and not in production code
 *
 * A guard inside `isCliAvailable` was the obvious placement and is wrong twice:
 *
 * 1. It would have covered 6 of the 23 spawns. `verify-command` reaches the
 *    binary through `probeAllClis` → `probeCli` → `execFileAsync`, never
 *    touching `isCliAvailable`.
 * 2. Production code cannot tell a mocked `child_process` from a real one. An
 *    `if (isTestRunner()) throw` runs whether or not the test mocked the
 *    subprocess layer, so it would fire on correctly-mocked tests. Intercepting
 *    at the module boundary gets that distinction for free: a test that mocks
 *    `node:child_process` itself replaces this wrapper along with it, which is
 *    exactly the right behaviour.
 *
 * ## Why a named set rather than "no subprocesses"
 *
 * 16 test files spawn `git` or `node` legitimately. A blanket throw would break
 * tests doing nothing wrong and would be reverted within a day. This blocks only
 * the agent CLIs this repo drives; everything else passes through untouched.
 *
 * @module testing/cli-spawn-guard
 */

import { CLI_NAMES } from '../config/model-capabilities-types.js';

/**
 * Binaries a unit test must not spawn for real.
 *
 * `CLI_NAMES` is the canonical routing-arm list. `agy` is probed as a binary at
 * `cli/cli-auth-probe.ts:209` but is deliberately not a routing arm, so it is
 * absent from `CLI_NAMES` and named here explicitly rather than silently missed.
 */
export const GUARDED_CLI_BINARIES: ReadonlySet<string> = new Set<string>([...CLI_NAMES, 'agy']);

/**
 * Extracts the binary name from the first argument of a `child_process` call.
 *
 * Handles both call shapes in this tree: `execFile('opencode', ['--version'])`
 * passes a bare binary, while `exec('opencode --version')` passes a whole
 * command line. Taking the last token instead of the first resolves the latter
 * to `--version` and lets the spawn through — the guard would then pass its own
 * tests while missing `base-adapter.ts:294`, which uses the `exec` form.
 */
export function binaryNameFrom(command: unknown): string {
  // Non-string first arguments (a URL, a file descriptor) are never a guarded
  // binary name, and stringifying one would yield '[object Object]' — which
  // could never match, but would do so silently.
  if (typeof command !== 'string') return '';
  const first = command.trim().split(/\s+/)[0] ?? '';
  const withoutPath = first.split('/').pop() ?? '';
  return withoutPath.replace(/\.(exe|cmd|bat)$/i, '');
}

/**
 * True when this run has explicitly opted into real CLI spawns.
 *
 * Keyed on the `*_E2E` convention the gated suites already use — `OPENCODE_E2E`
 * is the only one in the default suite today, and a future gated suite needs no
 * change here. A path allowlist was the alternative and would be a one-row
 * registry duplicating a signal the file already carries.
 */
export function realCliSpawnsAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return Object.entries(env).some(
    ([key, value]) =>
      key.endsWith('_E2E') && value !== undefined && value !== '' && value !== 'false'
  );
}

/** The error a guarded spawn raises. Exported so the guard's own tests can match it. */
export function guardedSpawnError(binary: string, fnName: string): Error {
  return new Error(
    `[cli-spawn-guard] This test spawned the real '${binary}' binary via ${fnName}().\n` +
      `Unit tests must not shell out to an agent CLI — the result then depends on what is\n` +
      `installed on the machine, and the spawn leaks scratch that nothing cleans up.\n` +
      `Mock the module that reaches it (commonly 'cli-adapters/factory.js' or\n` +
      `'cli/cli-auth-probe.js'), replacing it WHOLESALE rather than spreading importOriginal —\n` +
      `a module's internal calls to its own siblings bypass a partial stub.\n` +
      `For a genuine integration test, gate the file behind a '*_E2E' env var.`
  );
}

/**
 * Blocked spawn attempts since the last {@link takeSpawnViolations} call.
 *
 * Throwing alone is not enough. Every CLI probe in this tree wraps its spawn in
 * a try/catch that converts any failure into "this CLI is unavailable" — which
 * is correct production behaviour and fatal for a guard. Measured: with the
 * guard installed and the mock removed, `verify-command.test.ts` went from 51
 * real spawns to 0 while still reporting 25 passing tests and no error. The
 * spawn was prevented and nobody was told.
 *
 * A guard whose failure is swallowed by the code it guards is a check that
 * cannot fail. So attempts are recorded here and re-raised from an `afterEach`
 * hook, outside any production catch block.
 */
const spawnViolations: string[] = [];

/** Records a blocked attempt. Called by the setup file before it throws. */
export function recordSpawnViolation(binary: string, fnName: string): void {
  spawnViolations.push(`${binary} (via ${fnName})`);
}

/** Returns and clears the recorded attempts. */
export function takeSpawnViolations(): string[] {
  return spawnViolations.splice(0, spawnViolations.length);
}

/**
 * nexus-agents/cli - CLI detection error classification (#2152)
 *
 * Small helper shared by `setup-codex.ts`, `setup-gemini.ts`, `setup-opencode.ts`
 * (and later `setup-cli-detection.ts` once #2155 consolidates them) so that a
 * `which`/`where` or `<cli> --version` failure is classified instead of
 * silently collapsed into `installed: false`.
 *
 * Before this file, all three setup modules did `catch { return { installed: false } }`,
 * treating `ENOENT` (genuinely not installed), `ETIMEDOUT` (PATH lookup hung),
 * `EACCES` (binary present but not executable), and arbitrary other exec
 * failures identically. That made doctor/verify diagnostics unactionable.
 *
 * @module cli/cli-detection-error
 */

/**
 * Stable classification of why a CLI-detection exec failed.
 *
 * - `not-found`: binary is not on PATH (`ENOENT`). User action: install the CLI.
 * - `timeout`: the exec hung past the configured timeout (`ETIMEDOUT`,
 *   `exit code null with signal`). User action: investigate PATH for hung
 *   filesystems (NFS mounts, dead autofs entries).
 * - `permission`: binary is present but the current user can't execute it
 *   (`EACCES`, `EPERM`). User action: fix mode bits or ownership.
 * - `other`: any other exec failure. User action: re-run with verbose
 *   logging or inspect stderr directly.
 */
export type DetectionError = 'not-found' | 'timeout' | 'permission' | 'other';

/**
 * Human-readable explanation for each detection-error class. Intended for
 * `doctor`/`verify` output — short enough to fit on one line next to the CLI
 * name.
 */
export const DETECTION_ERROR_MESSAGES: Record<DetectionError, string> = {
  'not-found': 'binary not on PATH',
  timeout: 'detection timed out (hung PATH?)',
  permission: 'binary present but not executable',
  other: 'detection failed — check verbose logs',
};

/**
 * Formats a user-facing "not installed" message that incorporates the
 * detection-error class. Called by setup runners to replace the flat
 * "<cli> not installed" message when the underlying cause is more specific.
 *
 * - `not-found` or undefined → "<cli> not installed"
 * - other classes → "<cli> detection failed: <class-message>"
 */
export function formatDetectionMessage(cliName: string, detectionError?: DetectionError): string {
  if (detectionError === undefined || detectionError === 'not-found') {
    return `${cliName} not installed`;
  }
  return `${cliName} detection failed: ${DETECTION_ERROR_MESSAGES[detectionError]}`;
}

/**
 * Actionable recovery step for each detection-error class (#3213). Each takes
 * the CLI's **binary** name (e.g. `opencode`, not the display name) so the
 * suggested command is runnable verbatim. Intended to be shown alongside the
 * `formatDetectionMessage` line on setup/doctor failures.
 */
export const DETECTION_ERROR_SOLUTIONS: Record<DetectionError, (cliBinary: string) => string> = {
  'not-found': (cli) =>
    `Install ${cli} and make sure it is on your PATH — see docs/getting-started/INSTALLATION.md.`,
  permission: (cli) =>
    `The ${cli} binary is present but not executable. Run: chmod +x "$(command -v ${cli})"`,
  timeout: (cli) =>
    `${cli} detection timed out. Check PATH for hung mounts (e.g. NFS); re-run with --verbose to see where detection hangs.`,
  other: (cli) => `Re-run with --verbose for detailed ${cli} detection logs.`,
};

/**
 * One-line actionable recovery hint for a detection error, with a docs pointer.
 * `cliBinary` is the runnable binary name (e.g. `gemini`); defaults the class to
 * `not-found` when unclassified.
 */
export function detectionRecoveryHint(cliBinary: string, detectionError?: DetectionError): string {
  const cls: DetectionError = detectionError ?? 'not-found';
  return `${DETECTION_ERROR_SOLUTIONS[cls](cliBinary)} (more: docs/TROUBLESHOOTING.md)`;
}

/**
 * Classifies a thrown error from `execFileSync('which'|'where', ...)` or
 * `execFileSync(cli, ['--version'])`.
 *
 * Node's `execFileSync` throws with a `code` property on the error object
 * (string like `'ENOENT'`) for most OS-level failures. Timeouts additionally
 * set `signal: 'SIGTERM'` and may have `code: undefined`. We probe both.
 */
export function classifyExecError(err: unknown): DetectionError {
  if (typeof err !== 'object' || err === null) return 'other';

  // Duck-type rather than instanceof — execFileSync errors aren't always
  // `Error` instances across Node versions and test harnesses.
  const e = err as { code?: unknown; signal?: unknown; killed?: unknown };

  if (e.code === 'ENOENT') return 'not-found';
  if (e.code === 'ETIMEDOUT') return 'timeout';
  if (e.killed === true || e.signal === 'SIGTERM' || e.signal === 'SIGKILL') {
    // execFileSync sets `killed: true` + SIGTERM when its own timeout fires.
    return 'timeout';
  }
  if (e.code === 'EACCES' || e.code === 'EPERM') return 'permission';

  return 'other';
}

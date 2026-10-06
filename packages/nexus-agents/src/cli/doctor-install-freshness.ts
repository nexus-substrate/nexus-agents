/**
 * nexus-agents doctor — install-freshness sub-check (#4767).
 *
 * `.mcp.json` runs the MCP server off the **globally installed** package, not
 * the working tree. Nothing keeps the two in step: the release workflow
 * publishes to npm, and the global install is a separate manual
 * `npm install -g`. Drift accumulates silently, and every MCP call then
 * executes code the operator did not think they were running.
 *
 * Measured twice on 2026-08-25 alone: eleven minor versions behind in the
 * morning, three more by the afternoon.
 *
 * Versions are compared as semver (major, minor, patch, pre-release; build
 * metadata ignored). Exact string equality reported a NEWER global install as
 * `behind` and failed the exit code on it (#6782).
 *
 * @module cli/doctor-install-freshness
 * (Source: #4767)
 */

import { posix, win32 } from 'node:path';
import semver from 'semver';

/** What the check could determine about the installed versions. */
export type InstallFreshness =
  /** Global install matches the package under test. */
  (
    | { readonly state: 'aligned'; readonly version: string }
    /** Global install is present and strictly older. The only failing state. */
    | { readonly state: 'behind'; readonly global: string; readonly expected: string }
    /**
     * Global install is present and strictly NEWER (#6782). Not stale, so not a
     * failure; rendered ⚠ because the MCP server still runs code other than
     * this build's, which is the divergence this check exists to show.
     */
    | { readonly state: 'ahead'; readonly global: string; readonly expected: string }
    /**
     * The global version could not be read.
     *
     * Reported as its own state rather than folded into `aligned`: "no global
     * install found" and "the versions match" are different facts, and a check
     * that renders the first as the second is the shape this repo treats as a p1
     * on instrumentation. Rendered ⚠ and named in the summary as unmeasured;
     * it does not fail the verdict by itself (#6782).
     */
    | { readonly state: 'unknown'; readonly reason: string }
  ) & { readonly prefix?: string };

/** `version.ts` reports this when `__NEXUS_VERSION__` was never injected. */
const UNVERSIONED_BUILD = 'dev';

/** The remediation an operator has to perform, in full. */
export const INSTALL_FRESHNESS_REMEDY =
  'npm install -g nexus-agents@latest — then RESTART any running MCP server. ' +
  'An already-spawned server keeps the old code until it is restarted, so ' +
  'updating alone leaves the session on the stale build.';

/**
 * Compare the globally installed version against the expected one.
 *
 * Pure so the verdict is testable without npm. `expected` is the version of
 * the package this CLI was built from — the drift that matters is between what
 * the operator invokes and what the MCP server loads, and both derive from the
 * installed tree rather than from the registry.
 */
export function assessInstallFreshness(
  globalVersion: string | null,
  expected: string,
  unavailableReason = 'no global nexus-agents install found'
): InstallFreshness {
  // `VERSION` is `'dev'` when `__NEXUS_VERSION__` was not injected — i.e. the
  // CLI is running from source rather than a build. There is no version to
  // compare against, so the honest answer is `unknown`. Reporting `behind`
  // would fire on every developer checkout and train people to ignore the one
  // line that matters on a real install (#4959).
  if (expected === UNVERSIONED_BUILD) {
    return {
      state: 'unknown',
      reason: 'running from source — this build has no version to compare',
    };
  }
  if (globalVersion === null || globalVersion === '') {
    return { state: 'unknown', reason: unavailableReason };
  }
  // An unparseable version is a failed measurement, not evidence of drift.
  if (semver.valid(expected) === null) {
    return { state: 'unknown', reason: `this build's version "${expected}" is not semver` };
  }
  if (semver.valid(globalVersion) === null) {
    return { state: 'unknown', reason: `global version "${globalVersion}" is not semver` };
  }
  const order = semver.compare(globalVersion, expected);
  if (order === 0) return { state: 'aligned', version: expected };
  if (order > 0) return { state: 'ahead', global: globalVersion, expected };
  return { state: 'behind', global: globalVersion, expected };
}

/** One operator-facing line for a freshness verdict. */
export function describeInstallFreshness(result: InstallFreshness): string {
  const scope = result.prefix === undefined ? '' : ` (prefix: ${result.prefix})`;
  switch (result.state) {
    case 'aligned':
      return `✓ Global install matches this build (${result.version})${scope}`;
    case 'behind':
      return `✗ Global install is ${result.global}, this build is ${result.expected}${scope} — the MCP server runs the global one. ${INSTALL_FRESHNESS_REMEDY}`;
    case 'ahead':
      return `⚠ Global install is ${result.global}, newer than this build (${result.expected})${scope} — the MCP server runs the global one, not this build`;
    case 'unknown':
      return `⚠ Global install version not determined (${result.reason})${scope} — cannot confirm the MCP server runs this build`;
  }
}

/**
 * True only when the global install is measured and strictly older (#6782).
 *
 * `unknown` does not fail the verdict by itself. Every section that feeds the
 * verdict follows one rule: unmeasured renders ⚠ and is named in the summary
 * ({@link installFreshnessIsUnmeasured}), but does not fail the exit code —
 * doctor must not fail closed on a diagnostic it could not run. #4767's
 * failure (nobody checked, so nobody knew) is answered by naming it, which a
 * default-to-pass never did. #5613 asked for exactly this rule.
 */
export function installFreshnessFailsVerdict(result: InstallFreshness): boolean {
  switch (result.state) {
    case 'behind':
      return true;
    case 'aligned':
    case 'ahead':
    case 'unknown':
      return false;
  }
}

/** True when the versions could not be compared (#6782); the summary names it. */
export function installFreshnessIsUnmeasured(result: InstallFreshness): boolean {
  return result.state === 'unknown';
}

/**
 * A short qualification for the overall doctor summary. `unknown` has none of
 * its own: the summary's unmeasured list names it (#6782).
 */
export function describeInstallFreshnessSummary(result: InstallFreshness): string {
  if (result.state === 'behind') return ' — stale global install';
  if (result.state === 'ahead') return ' — global install newer than this build';
  return '';
}

/** Resolve bundled npm and its global prefix from the running interpreter (#7159). */
function resolveInterpreterInstall(
  execPath: string,
  platform: NodeJS.Platform
): { prefix: string; npmCli: string } {
  const path = platform === 'win32' ? win32 : posix;
  const binDir = path.dirname(execPath);
  const prefix = platform === 'win32' ? binDir : path.dirname(binDir);
  const modules =
    platform === 'win32'
      ? path.join(prefix, 'node_modules')
      : path.join(prefix, 'lib', 'node_modules');
  return { prefix, npmCli: path.join(modules, 'npm', 'bin', 'npm-cli.js') };
}

/**
 * Read the globally installed version, or null when it cannot be determined.
 *
 * Run the interpreter's bundled npm CLI with that same interpreter and an
 * explicit prefix: PATH and npm configuration may select another Node install
 * (#7159). POSIX uses `<prefix>/lib/node_modules`; Windows uses
 * `<prefix>/node_modules`. Any failure yields null — reported as `unknown`
 * with the checked prefix rather than falling back to another install.
 */
export function readGlobalVersion(
  exec: (cmd: string, args: readonly string[]) => string | null,
  execPath = process.execPath,
  platform = process.platform
): {
  version: string | null;
  reason: string;
  prefix: string;
} {
  const { prefix, npmCli } = resolveInterpreterInstall(execPath, platform);
  const raw = exec(execPath, [
    npmCli,
    'ls',
    '-g',
    'nexus-agents',
    '--depth=0',
    '--json',
    `--prefix=${prefix}`,
  ]);
  if (raw === null) return { version: null, reason: 'npm ls -g failed', prefix };
  try {
    const parsed: unknown = JSON.parse(raw);
    const deps = (parsed as { dependencies?: Record<string, { version?: string }> }).dependencies;
    const version = deps?.['nexus-agents']?.version;
    if (typeof version !== 'string' || version === '') {
      return { version: null, reason: 'no global nexus-agents install found', prefix };
    }
    return { version, reason: '', prefix };
  } catch {
    return { version: null, reason: 'npm ls -g returned unparseable JSON', prefix };
  }
}

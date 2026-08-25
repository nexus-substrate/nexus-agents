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
 * @module cli/doctor-install-freshness
 * (Source: #4767)
 */

/** What the check could determine about the installed versions. */
export type InstallFreshness =
  /** Global install matches the package under test. */
  | { readonly state: 'aligned'; readonly version: string }
  /** Global install is present and older. */
  | { readonly state: 'behind'; readonly global: string; readonly expected: string }
  /**
   * The global version could not be read.
   *
   * Reported as its own state rather than folded into `aligned`: "no global
   * install found" and "the versions match" are different facts, and a check
   * that renders the first as the second is the shape this repo treats as a p1
   * on instrumentation.
   */
  | { readonly state: 'unknown'; readonly reason: string };

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
  if (globalVersion === null || globalVersion === '') {
    return { state: 'unknown', reason: unavailableReason };
  }
  if (globalVersion === expected) return { state: 'aligned', version: expected };
  return { state: 'behind', global: globalVersion, expected };
}

/** One operator-facing line for a freshness verdict. */
export function describeInstallFreshness(result: InstallFreshness): string {
  switch (result.state) {
    case 'aligned':
      return `✓ Global install matches this build (${result.version})`;
    case 'behind':
      return `✗ Global install is ${result.global}, this build is ${result.expected} — the MCP server runs the global one. ${INSTALL_FRESHNESS_REMEDY}`;
    case 'unknown':
      return `? Global install version not determined (${result.reason}) — cannot confirm the MCP server runs this build`;
  }
}

/** True when the verdict should count against doctor's health score. */
export function installFreshnessIsHealthy(result: InstallFreshness): boolean {
  // `unknown` is NOT healthy. It is the state that produced #4767: nobody
  // checked, so nobody knew, and the absence read as fine.
  return result.state === 'aligned';
}

/**
 * Read the globally installed version, or null when it cannot be determined.
 *
 * `npm ls -g` is the only reliable source: the global prefix is not derivable
 * from this process, which may itself be running from the global install, a
 * workspace link, or `npx`. Any failure yields null — reported as `unknown`
 * rather than guessed at.
 */
export function readGlobalVersion(exec: (cmd: string, args: readonly string[]) => string | null): {
  version: string | null;
  reason: string;
} {
  const raw = exec('npm', ['ls', '-g', 'nexus-agents', '--depth=0', '--json']);
  if (raw === null) return { version: null, reason: 'npm ls -g failed' };
  try {
    const parsed: unknown = JSON.parse(raw);
    const deps = (parsed as { dependencies?: Record<string, { version?: string }> }).dependencies;
    const version = deps?.['nexus-agents']?.version;
    if (typeof version !== 'string' || version === '') {
      return { version: null, reason: 'no global nexus-agents install found' };
    }
    return { version, reason: '' };
  } catch {
    return { version: null, reason: 'npm ls -g returned unparseable JSON' };
  }
}

/**
 * Wrapper for `changeset publish` with recovery for npm's staged-publish window (#6500).
 *
 * ## Why this exists
 *
 * When publishing packages with provenance / OIDC, npm holds accepted packages in a
 * staged state for up to 17+ minutes before they become visible in registry metadata
 * (e.g. `npm view`). During this window, any release run checking the registry sees the
 * version missing, attempts to re-publish, and fails with:
 *
 *   E409: 409 Conflict - PUT https://registry.npmjs.org/<pkg> - Cannot publish over previously staged version "<version>".
 *
 * An E409 previously staged error means npm has already accepted and staged the package.
 * This script runs `changeset publish`, inspects the output, and if every failed package
 * failed solely because it was already staged in npm:
 *   1. It logs that the version is staged on npm and treats it as published.
 *   2. It ensures the local git tag exists (matching what changeset publish would do).
 *   3. It exits 0 so subsequent non-publishing or quick-merge runs stay green.
 *
 * Genuine errors (e.g. E403 Forbidden, network timeouts) are never swallowed and exit
 * with the runner's failure exit code.
 *
 * @module scripts/publish-packages
 * (Source: Issue #6500)
 */

import { execFileSync, spawnSync } from 'node:child_process';

export interface FailedPackage {
  readonly name: string;
  readonly version: string;
  readonly isStaged: boolean;
  readonly code?: string;
  readonly message?: string;
}

export interface PublishAnalysis {
  readonly successfulPackages: readonly string[];
  readonly failedPackages: readonly FailedPackage[];
  readonly allFailuresAreStaged: boolean;
}

export interface RunnerResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type CommandRunner = (args: readonly string[]) => RunnerResult;

export interface RunPublishOptions {
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly runner?: CommandRunner;
}

export interface RunPublishResult {
  readonly ok: boolean;
  readonly status: number;
  readonly analysis: PublishAnalysis;
  readonly treatedAsPublished: boolean;
}

/**
 * Checks whether an error line or message indicates npm's staged-publish conflict.
 * Specifically distinguishes between "previously staged version" (recoverable staged state)
 * and "previously published versions" (unrecoverable re-publish of old version).
 */
export function isStagedPublishError(text: string): boolean {
  if (text === '') return false;
  return /Cannot publish over previously staged version/i.test(text);
}

/** Extracts successfully published packages from changeset output. */
function parseSuccessfulPackages(output: string): readonly string[] {
  const successSection = output.match(
    /Successfully published:\s*([\s\S]*?)(?=(?:Created git tags:|Some packages failed|🦋|$))/
  );
  if (successSection?.[1] === undefined) return [];

  const successful: string[] = [];
  const lines = successSection[1].split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed !== '' && trimmed.includes('@')) {
      successful.push(trimmed);
    }
  }
  return successful;
}

/** Parses error detail line for a failed package. */
function parseFailedPackageDetail(
  currentPkg: { name: string; version: string },
  line: string
): FailedPackage {
  const cleaned = line.replace(/^[└\s]+/, '').trim();
  const codeMatch = cleaned.match(/^([A-Z0-9]+):\s*(.*)$/);
  const code = codeMatch?.[1];
  const message = codeMatch?.[2] ?? cleaned;
  const isStaged = isStagedPublishError(cleaned);

  return {
    name: currentPkg.name,
    version: currentPkg.version,
    isStaged,
    code,
    message,
  };
}

/** Extracts failed packages and their failure reasons from changeset output. */
function parseFailedPackages(output: string): readonly FailedPackage[] {
  const failedSection = output.match(
    /Some packages failed to publish:\s*([\s\S]*?)(?=(?:🦋 Exited|🦋|$))/
  );
  if (failedSection?.[1] === undefined) return [];

  const lines = failedSection[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '');
  const failures: FailedPackage[] = [];
  let currentPkg: { name: string; version: string } | null = null;

  for (const line of lines) {
    const pkgMatch = line.match(/^(@?[^@\s]+)@([0-9a-zA-Z.-]+)$/);
    if (pkgMatch?.[1] !== undefined && pkgMatch[2] !== undefined) {
      currentPkg = { name: pkgMatch[1], version: pkgMatch[2] };
      continue;
    }

    if (currentPkg !== null && (line.startsWith('└') || /^[A-Z0-9]+:/.test(line))) {
      failures.push(parseFailedPackageDetail(currentPkg, line));
      currentPkg = null;
    }
  }

  return failures;
}

/**
 * Parses the combined stdout/stderr of `changeset publish` to identify successful
 * and failed package releases, classifying whether failures are solely due to npm's staged window.
 */
export function parsePublishOutput(output: string): PublishAnalysis {
  if (output === '') {
    return {
      successfulPackages: [],
      failedPackages: [],
      allFailuresAreStaged: false,
    };
  }

  const successfulPackages = parseSuccessfulPackages(output);
  const failedPackages = parseFailedPackages(output);
  const allFailuresAreStaged = failedPackages.length > 0 && failedPackages.every((p) => p.isStaged);

  return {
    successfulPackages,
    failedPackages,
    allFailuresAreStaged,
  };
}

/** Default runner: invokes `changeset publish` via `pnpm exec`. */
function defaultRunner(args: readonly string[], cwd?: string): RunnerResult {
  const result = spawnSync('pnpm', ['exec', 'changeset', 'publish', ...args], {
    cwd,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  });

  const stdout = result.stdout;
  const stderr = result.stderr;
  process.stdout.write(stdout);
  process.stderr.write(stderr);

  return {
    status: result.status ?? (result.error !== undefined ? 1 : 0),
    stdout,
    stderr,
  };
}

/** Ensures local git tag exists for a recovered staged package release. */
function ensureGitTag(cwd: string, tagName: string): void {
  try {
    const existing = execFileSync('git', ['tag', '-l', tagName], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (existing === tagName) return;
    execFileSync('git', ['tag', tagName], { cwd, stdio: 'ignore' });
    process.stdout.write(`[publish-packages] Created git tag ${tagName}\n`);
  } catch (error: unknown) {
    process.stderr.write(
      `[publish-packages] Warning: could not verify or create git tag ${tagName}: ${String(error)}\n`
    );
  }
}

/**
 * Executes package publishing with changeset, handling recovery when packages
 * are already staged in npm registry.
 */
export function runPublish(options: RunPublishOptions = {}): RunPublishResult {
  const { args = [], cwd = process.cwd(), runner } = options;
  const execRunner = runner ?? ((cmdArgs) => defaultRunner(cmdArgs, cwd));

  const result = execRunner(args);
  const combinedOutput = `${result.stdout}\n${result.stderr}`;
  const analysis = parsePublishOutput(combinedOutput);

  if (result.status === 0) {
    return {
      ok: true,
      status: 0,
      analysis,
      treatedAsPublished: false,
    };
  }

  if (analysis.allFailuresAreStaged) {
    for (const pkg of analysis.failedPackages) {
      process.stdout.write(
        `[publish-packages] ${pkg.name}@${pkg.version} is staged on npm (not yet visible in registry). Treating as published (#6500).\n`
      );
      ensureGitTag(cwd, `${pkg.name}@${pkg.version}`);
    }
    return {
      ok: true,
      status: 0,
      analysis,
      treatedAsPublished: true,
    };
  }

  return {
    ok: false,
    status: result.status,
    analysis,
    treatedAsPublished: false,
  };
}

if (process.argv[1]?.endsWith('publish-packages.ts') === true) {
  const result = runPublish({ args: process.argv.slice(2) });
  if (!result.ok) {
    process.exit(result.status || 1);
  }
}

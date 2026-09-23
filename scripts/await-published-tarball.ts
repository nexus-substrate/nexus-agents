/**
 * Await and measure the post-publish tarball availability window on npm (#6525).
 *
 * After npm publishes a package (including the staged-E409 path), the tarball
 * may 404 on the registry CDN for several minutes before becoming available.
 * This script polls the tarball URL until it returns HTTP 200, logs the delay,
 * appends a summary line to GITHUB_STEP_SUMMARY, and fails with an error if
 * the bounded timeout (default 30 min) is exceeded.
 *
 * @module scripts/await-published-tarball
 * (Source: Issue #6525)
 */

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_REGISTRY = 'https://registry.npmjs.org';
export const DEFAULT_TIMEOUT_SECONDS = 1800; // 30 minutes
export const DEFAULT_POLL_INTERVAL_SECONDS = 15;
export const DEFAULT_PACKAGE_NAME = 'nexus-agents';

export interface CliOptions {
  readonly packageName?: string | undefined;
  readonly version?: string | undefined;
  readonly registryUrl?: string | undefined;
  readonly timeoutSeconds?: number | undefined;
  readonly pollIntervalSeconds?: number | undefined;
}

export interface PollTarballOptions {
  readonly url: string;
  readonly timeoutSeconds?: number | undefined;
  readonly pollIntervalSeconds?: number | undefined;
  readonly fetchFn?: ((url: string, init?: RequestInit) => Promise<{ status: number }>) | undefined;
  readonly sleepFn?: ((seconds: number) => Promise<void>) | undefined;
  readonly nowFn?: (() => number) | undefined;
  readonly logger?:
    | {
        readonly log: (msg: string) => void;
        readonly error: (msg: string) => void;
      }
    | undefined;
}

export type PollTarballResult =
  | {
      readonly ok: true;
      readonly durationSeconds: number;
      readonly attempts: number;
      readonly url: string;
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly durationSeconds: number;
      readonly attempts: number;
      readonly lastStatus?: number | undefined;
      readonly url: string;
    };

/**
 * Builds the registry tarball URL for an unscoped or scoped npm package.
 * Returns empty string if either packageName or version is empty (named empty case).
 */
export function buildTarballUrl(
  packageName: string,
  version: string,
  registryUrl: string = DEFAULT_REGISTRY
): string {
  if (packageName.trim() === '' || version.trim() === '') {
    return '';
  }
  const cleanRegistry = registryUrl.replace(/\/+$/, '');
  if (packageName.startsWith('@')) {
    const parts = packageName.split('/');
    const scope = parts[0] ?? '';
    const pkg = parts[1] ?? '';
    if (scope === '' || pkg === '') return '';
    return `${cleanRegistry}/${scope}/${pkg}/-/${pkg}-${version}.tgz`;
  }
  return `${cleanRegistry}/${packageName}/-/${packageName}-${version}.tgz`;
}

interface CliArgsMutable {
  packageName?: string | undefined;
  version?: string | undefined;
  registryUrl?: string | undefined;
  timeoutSeconds?: number | undefined;
  pollIntervalSeconds?: number | undefined;
}

function applyCliArg(args: CliArgsMutable, key: string, value: string): void {
  switch (key) {
    case '--package':
      args.packageName = value;
      break;
    case '--version':
      args.version = value;
      break;
    case '--registry':
      args.registryUrl = value;
      break;
    case '--timeout-seconds':
      args.timeoutSeconds = Number(value);
      break;
    case '--poll-interval-seconds':
      args.pollIntervalSeconds = Number(value);
      break;
    default:
      break;
  }
}

/** Parses known CLI arguments. */
export function parseCliArgs(argv: readonly string[]): CliOptions {
  const result: CliArgsMutable = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key?.startsWith('--') === true && next !== undefined && !next.startsWith('--')) {
      applyCliArg(result, key, next);
      i++;
    }
  }
  return result;
}

/** Formats markdown content for GITHUB_STEP_SUMMARY. */
export function formatJobSummary(
  result: PollTarballResult,
  packageName: string,
  version: string
): string {
  const lines: string[] = [
    '### Package Publish Tarball Verification',
    '',
    `- **Package:** \`${packageName}@${version}\``,
    `- **Tarball URL:** ${result.url}`,
    `- **Attempts:** ${String(result.attempts)}`,
  ];

  if (result.ok) {
    lines.push(
      `- **Availability Delay:** ${String(result.durationSeconds)}s`,
      '- **Status:** Available (HTTP 200)'
    );
  } else {
    lines.push(
      `- **Elapsed Time:** ${String(result.durationSeconds)}s`,
      `- **Status:** Unavailable (${result.reason})`
    );
  }

  lines.push('');
  return lines.join('\n');
}

/** Reads local version of packages/nexus-agents/package.json. */
export function readLocalPackageVersion(
  repoRoot: string,
  relativePath: string = 'packages/nexus-agents/package.json'
): string {
  const manifestPath = join(repoRoot, relativePath);
  if (!existsSync(manifestPath)) {
    throw new Error(`Package manifest not found at ${manifestPath}`);
  }
  const raw: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (typeof raw !== 'object' || raw === null || !('version' in raw)) {
    throw new Error(`Invalid package manifest at ${manifestPath}`);
  }
  const version = (raw as Record<string, unknown>).version;
  if (typeof version !== 'string' || version.trim() === '') {
    throw new Error(`Missing or empty version in ${manifestPath}`);
  }
  return version;
}

const defaultSleep = async (seconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, seconds * 1000));

interface PollLoopState {
  attempts: number;
  lastStatus: number | undefined;
}

async function checkTarballAttempt(
  url: string,
  fetchFn: (url: string, init?: RequestInit) => Promise<{ status: number }>
): Promise<{ status: number | undefined; error?: unknown }> {
  try {
    const res = await fetchFn(url, { method: 'HEAD' });
    return { status: res.status };
  } catch (err: unknown) {
    return { status: undefined, error: err };
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'network error';
}

async function runPollIteration(
  options: {
    readonly url: string;
    readonly interval: number;
    readonly timeout: number;
    readonly start: number;
    readonly fetchFn: (url: string, init?: RequestInit) => Promise<{ status: number }>;
    readonly sleepFn: (seconds: number) => Promise<void>;
    readonly nowFn: () => number;
    readonly logger: { readonly log: (msg: string) => void };
  },
  state: PollLoopState
): Promise<{ done: boolean; ok: boolean }> {
  state.attempts += 1;
  const { status, error } = await checkTarballAttempt(options.url, options.fetchFn);
  state.lastStatus = status;

  if (status === 200) {
    return { done: true, ok: true };
  }

  const elapsed = Math.max(0, options.nowFn() - options.start);
  if (elapsed >= options.timeout) {
    return { done: true, ok: false };
  }

  const statusDesc = status !== undefined ? `HTTP ${String(status)}` : formatError(error);
  options.logger.log(
    `[await-published-tarball] ${options.url} returned ${statusDesc}; waiting ${String(options.interval)}s (elapsed: ${String(elapsed)}s / timeout: ${String(options.timeout)}s)...`
  );

  const sleepDuration = Math.min(options.interval, Math.max(0, options.timeout - elapsed));
  await options.sleepFn(sleepDuration);
  return { done: false, ok: false };
}

function initialGuard(url: string, timeoutSeconds: number): PollTarballResult | undefined {
  if (url.trim() === '') {
    return { ok: false, reason: 'Empty tarball URL', durationSeconds: 0, attempts: 0, url };
  }
  if (timeoutSeconds <= 0) {
    return { ok: false, reason: 'Timeout zero or negative', durationSeconds: 0, attempts: 0, url };
  }
  return undefined;
}

function resolvePollFinal(
  res: { readonly done: boolean; readonly ok: boolean },
  state: PollLoopState,
  timeoutSeconds: number,
  durationSeconds: number,
  url: string
): PollTarballResult {
  if (res.done && res.ok) {
    return { ok: true, durationSeconds, attempts: state.attempts, url };
  }
  return {
    ok: false,
    reason: `Timed out waiting for tarball after ${String(timeoutSeconds)}s`,
    durationSeconds,
    attempts: state.attempts,
    lastStatus: state.lastStatus,
    url,
  };
}

/** Polls a tarball URL until it returns HTTP 200 or times out. */
export async function pollTarball(options: PollTarballOptions): Promise<PollTarballResult> {
  const {
    url,
    timeoutSeconds = DEFAULT_TIMEOUT_SECONDS,
    pollIntervalSeconds = DEFAULT_POLL_INTERVAL_SECONDS,
    fetchFn = fetch,
    sleepFn = defaultSleep,
    nowFn = () => Math.floor(Date.now() / 1000),
    logger = console,
  } = options;

  const guard = initialGuard(url, timeoutSeconds);
  if (guard !== undefined) return guard;

  const start = nowFn();
  const state: PollLoopState = { attempts: 0, lastStatus: undefined };
  let lastIteration = { done: false, ok: false };

  while (nowFn() - start < timeoutSeconds) {
    lastIteration = await runPollIteration(
      {
        url,
        interval: pollIntervalSeconds,
        timeout: timeoutSeconds,
        start,
        fetchFn,
        sleepFn,
        nowFn,
        logger,
      },
      state
    );
    if (lastIteration.done) break;
  }

  const durationSeconds = Math.max(0, nowFn() - start);
  return resolvePollFinal(lastIteration, state, timeoutSeconds, durationSeconds, url);
}

export interface MainDeps {
  readonly pollFn?: ((options: PollTarballOptions) => Promise<PollTarballResult>) | undefined;
  readonly getCwd?: (() => string) | undefined;
}

function writeSummaryFile(
  summaryFile: string | undefined,
  result: PollTarballResult,
  packageName: string,
  version: string
): void {
  if (summaryFile === undefined || summaryFile.trim() === '') return;
  try {
    const summary = formatJobSummary(result, packageName, version);
    appendFileSync(summaryFile, summary, 'utf8');
  } catch (err: unknown) {
    console.warn('[await-published-tarball] Failed to write to GITHUB_STEP_SUMMARY:', err);
  }
}

function reportOutcome(result: PollTarballResult, packageName: string, version: string): number {
  if (result.ok) {
    console.log(
      `[await-published-tarball] Tarball for ${packageName}@${version} is available after ${String(result.durationSeconds)}s (${String(result.attempts)} attempts).`
    );
    return 0;
  }
  console.error(
    `::error::Tarball for ${packageName}@${version} did not become available at ${result.url} within ${String(result.durationSeconds)}s: ${result.reason}`
  );
  return 1;
}

/** Main CLI runner. */
export async function main(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  deps: MainDeps = {}
): Promise<number> {
  const cli = parseCliArgs(argv);
  const repoRoot = deps.getCwd?.() ?? process.cwd();
  const packageName = cli.packageName ?? DEFAULT_PACKAGE_NAME;
  const version = cli.version ?? readLocalPackageVersion(repoRoot);
  const registryUrl = cli.registryUrl ?? DEFAULT_REGISTRY;
  const url = buildTarballUrl(packageName, version, registryUrl);
  const poller = deps.pollFn ?? pollTarball;

  console.log(
    `[await-published-tarball] Awaiting tarball for ${packageName}@${version} at ${url}...`
  );

  const result = await poller({
    url,
    timeoutSeconds: cli.timeoutSeconds,
    pollIntervalSeconds: cli.pollIntervalSeconds,
  });

  writeSummaryFile(env.GITHUB_STEP_SUMMARY, result, packageName, version);
  return reportOutcome(result, packageName, version);
}

if (process.argv[1]?.endsWith('await-published-tarball.ts') === true) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error('[await-published-tarball] Fatal error:', err);
      process.exit(1);
    }
  );
}

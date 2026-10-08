/**
 * Security Scan Tool (#1683)
 *
 * Runs a SAST scanner (Semgrep) against a local codebase and returns
 * structured findings via the SARIF parser. Part of the Proactive
 * Defensive Security epic (#1681).
 *
 * @module mcp/tools/security-scan
 */

import { z } from 'zod';
import type { SecurityScanInput } from './security-scan-types.js';
import { parseSarif } from '../../security/sarif-parser.js';
import type { SarifParseResult } from '../../security/sarif-types.js';
import { createLogger } from '../../core/index.js';
import { resolveInsideRoot } from '../../security/safe-path.js';
import { execFileTree, type CommandWrapper } from '../../cli-adapters/exec-file-tree.js';
import { access, constants } from 'node:fs/promises';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { delimiter, isAbsolute, join, parse, resolve } from 'node:path';

const logger = createLogger({ component: 'security-scan' });

/** Timeout for scanner execution (5 minutes). */
const SCAN_TIMEOUT_MS = 300_000;

/** Measure semgrep's version, preserving why a probe could not measure it. */
async function probeSemgrepVersion(
  signal: AbortSignal | undefined,
  env: NodeJS.ProcessEnv | undefined,
  wrapper: CommandWrapper | undefined,
  binary = 'semgrep',
  cwd?: string
): Promise<string | { error: string }> {
  try {
    const { stdout } = await execFileTree(binary, ['--version'], {
      timeoutMs: 10_000,
      signal,
      env,
      wrapper,
      cwd,
    });
    const version = stdout.trim();
    return version === '' ? { error: 'semgrep version probe returned empty output' } : version;
  } catch (error: unknown) {
    if (
      failureCode(error) === 'ENOENT' &&
      wrapper === undefined &&
      (await isSemgrepExecutableMissing(binary, env, cwd))
    ) {
      return { error: 'semgrep is not installed. Install with: pip install semgrep' };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      error: `semgrep version probe failed (exit ${String(failureCode(error))}): ${message}`,
    };
  }
}

/** Match explicit executable paths and POSIX PATH lookup against the probe cwd. */
function probeExecutableCandidates(
  binary: string,
  env: NodeJS.ProcessEnv | undefined,
  cwd: string | undefined
): readonly string[] | undefined {
  const root = cwd ?? process.cwd();
  const searchPath = (env ?? process.env)['PATH'];
  return isAbsolute(binary) || /[/\\]/.test(binary)
    ? [resolve(root, binary)]
    : process.platform === 'win32'
      ? undefined
      : searchPath?.split(delimiter).map((directory) => resolve(root, directory, binary));
}

/** ENOENT may name a missing interpreter rather than a missing scanner. */
async function isSemgrepExecutableMissing(
  binary: string,
  env: NodeJS.ProcessEnv | undefined,
  cwd: string | undefined
): Promise<boolean> {
  const candidates = probeExecutableCandidates(binary, env, cwd);
  // An implicit platform PATH cannot prove absence; retain the execution failure.
  if (candidates === undefined || candidates.length === 0) return false;
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return false;
    } catch (error: unknown) {
      // Inconclusive filesystem failures must not claim the scanner is absent.
      if (failureCode(error) !== 'ENOENT' && failureCode(error) !== 'ENOTDIR') return false;
    }
  }
  return true;
}

/**
 * Run semgrep and return raw SARIF JSON output. The timeout and the abort end
 * semgrep's whole process tree (#6747): it runs its analysis in child
 * processes, which killing semgrep alone would leave running.
 */
async function runSemgrep(
  targetDir: string,
  rulesets: readonly string[],
  signal: AbortSignal | undefined,
  env: NodeJS.ProcessEnv | undefined,
  options: SecurityScanOptions
): Promise<string> {
  const prepared = options.preparedScan;
  const flags = prepared?.flags ?? (options.completeResults === true ? COMPLETE_SCAN_FLAGS : []);
  const configs =
    prepared?.rulesets ??
    rulesets.map((ruleset) =>
      /^(?:[pr]\/|https?:\/\/|auto$)/.test(ruleset) ? ruleset : resolve(ruleset)
    );
  const args = [
    '--sarif',
    '--quiet',
    ...flags,
    ...configs.flatMap((r) => ['--config', r]),
    targetDir,
  ];

  const { stdout } = await execFileTree(prepared?.binary ?? 'semgrep', args, {
    cwd: parse(targetDir).root,
    timeoutMs: SCAN_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024, // 10MB for large SARIF output
    signal,
    env,
    wrapper: options.wrapper,
  });

  return stdout;
}

/**
 * Validate that target path is safe (no traversal).
 *
 * Security: the target must resolve inside the current working directory.
 * The previous check `resolved.startsWith(path.resolve('/'))` was
 * effectively a no-op on POSIX (every absolute path starts with `/`).
 * (#1913 Class D — path traversal gap.)
 */
function validateTargetPath(target: string, root: string = process.cwd()): string {
  // Require the target to be inside the root (or the root itself), following symlinks.
  const resolved = resolveInsideRoot(target, root);
  if (resolved === null) {
    throw new Error(`Invalid target path: must resolve inside ${root} (got ${target})`);
  }
  return resolved;
}

/** Options for {@link executeSecurityScan}; one object so a wrapper forwards them whole. */
export interface SecurityScanOptions {
  /** Read every finding for a security comparison rather than an MCP display cap. */
  readonly completeResults?: boolean;
  /** Frozen scanner and rules shared by baseline and worktree scans. */
  readonly preparedScan?: PreparedSecurityScan;
  /** Caller abort (#6747). */
  readonly signal?: AbortSignal | undefined;
  /** Scanner subprocess environment. Absent: inherit the caller's. */
  readonly env?: NodeJS.ProcessEnv | undefined;
  /** Optional scratch OS sandbox. */
  readonly wrapper?: CommandWrapper | undefined;
  /**
   * Root the target must resolve inside. Absent: the server's cwd. Only a
   * caller that CREATED the directory may pass it: the dev pipeline's scratch
   * worktree lives outside cwd by design (#6794), so cwd containment rejected
   * every pipeline scan and left security unmeasured.
   */
  readonly root?: string | undefined;
}

/** Frozen configuration prepared once for an occurrence-aware comparison. */
interface PreparedSecurityScan {
  readonly binary: string;
  readonly version: string;
  readonly rulesets: readonly string[];
  readonly flags: readonly string[];
}

const COMPLETE_SCAN_FLAGS = [
  '--no-git-ignore',
  '--max-target-bytes=0',
  '--metrics=off',
  '--disable-nosem',
  '--no-rewrite-rule-ids',
  // Avoid mutable ignore files and hidden-ancestor skips in scratch worktrees.
  // Unsupported scanner versions fail closed on this explicitly pinned flag.
  '--x-ignore-semgrepignore-files',
  // Must exclude nothing the dev pipeline captures (PATCH_PATHS in
  // pipeline/dev-pipeline-workspace.ts), or a captured file ships unscanned.
  '--exclude=node_modules',
  '--exclude=.git',
] as const;

/** Resolve an executable before either tree can affect PATH lookup. */
async function resolveSemgrep(env: NodeJS.ProcessEnv): Promise<string> {
  for (const directory of (env['PATH'] ?? '').split(delimiter)) {
    if (!isAbsolute(directory)) continue;
    const binary = join(directory, process.platform === 'win32' ? 'semgrep.exe' : 'semgrep');
    try {
      await access(binary, constants.X_OK);
      return await realpath(binary);
    } catch {
      // Continue through the host PATH; an absent scanner fails preparation.
    }
  }
  throw new Error('semgrep is not installed. Install with: pip install semgrep');
}

/** Download registry/URL rules once, or copy a local rule file into private scratch. */
async function readRuleset(ruleset: string, signal: AbortSignal | undefined): Promise<string> {
  const url = /^[pr]\//.test(ruleset) ? `https://semgrep.dev/c/${ruleset}` : ruleset;
  if (!/^https?:\/\//.test(url)) return await readFile(resolve(ruleset), 'utf8');
  const timeout = AbortSignal.timeout(30_000);
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
  });
  if (!response.ok) throw new Error(`Ruleset download failed: HTTP ${String(response.status)}`);
  const text = await response.text();
  if (text.length > 10 * 1024 * 1024) throw new Error('Ruleset download exceeds 10MB');
  return unwrapRuleset(text);
}

/** Normalize the registry envelope without interpreting scanner rule syntax. */
function unwrapRuleset(text: string): string {
  // The registry supports both native rules JSON and a rule_config envelope.
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return text;
  }
  if (typeof raw === 'object' && raw !== null && 'rule_config' in raw) {
    const config: unknown = raw.rule_config;
    return typeof config === 'string' ? config : JSON.stringify(config);
  }
  return text;
}

/** Probe the same prepared executable and reject version drift before scanning. */
async function measureScannerVersion(
  options: SecurityScanOptions,
  targetDir: string
): Promise<string | { error: string }> {
  const version = await probeSemgrepVersion(
    options.signal,
    options.env,
    options.wrapper,
    options.preparedScan?.binary,
    parse(targetDir).root
  );
  if (options.signal?.aborted === true) return { error: 'Scan aborted before semgrep ran' };
  if (typeof version !== 'string') return version;
  if (options.preparedScan !== undefined && options.preparedScan.version !== version) {
    return {
      error: `Scanner version changed: expected ${options.preparedScan.version}, got ${version}`,
    };
  }
  return version;
}

/** Pin scanner version and freeze rule contents in a caller-owned scratch directory. */
export async function prepareSecurityScan(
  rulesets: readonly string[],
  options: SecurityScanOptions & { readonly directory: string }
): Promise<PreparedSecurityScan | { error: string }> {
  try {
    if (rulesets.length === 0) throw new Error('No security rulesets configured');
    const binary = await resolveSemgrep(options.env ?? process.env);
    const version = await probeSemgrepVersion(
      options.signal,
      options.env,
      options.wrapper,
      binary,
      parse(resolve(options.directory)).root
    );
    if (typeof version !== 'string') throw new Error(version.error);
    const configs: string[] = [];
    for (const [index, ruleset] of rulesets.entries()) {
      const contents = await readRuleset(ruleset, options.signal);
      const file = join(options.directory, `security-rules-${String(index)}.yaml`);
      await writeFile(file, contents, { mode: 0o400, flag: 'wx' });
      configs.push(file);
    }
    return Object.freeze({
      binary,
      version,
      rulesets: Object.freeze(configs),
      flags: COMPLETE_SCAN_FLAGS,
    });
  } catch (error: unknown) {
    return {
      error: `Security scan preparation failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Execute a security scan against a local codebase.
 *
 * @param input - Scan configuration
 * @param options - `signal` (#6747: an abort ends the scanner's process tree and
 *   returns an `error` saying the scan was aborted, not a result), the scanner
 *   `env` (absent: inherit), and the containment
 *   `root` the target must resolve inside (absent: the server's cwd).
 * @returns Parsed SARIF findings or error message
 */
export async function executeSecurityScan(
  input: SecurityScanInput,
  options: SecurityScanOptions = {}
): Promise<SarifParseResult | { error: string }> {
  const { signal, env } = options;
  let targetDir: string;
  try {
    targetDir = validateTargetPath(input.target, options.root);
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  logger.info('Starting security scan', {
    target: targetDir,
    scanner: input.scanner,
    rulesets: input.rulesets,
  });

  const version = await measureScannerVersion(options, targetDir);
  if (typeof version !== 'string') return version;

  try {
    const sarifOutput = await runSemgrep(targetDir, input.rulesets, signal, env, options);
    const result = parseSarif(
      sarifOutput,
      options.completeResults === true ? Infinity : input.maxFindings
    );

    logger.info('Security scan completed', {
      scanner: result.scanner,
      findings: result.totalFindings,
      errors: result.errors.length,
    });

    return { ...result, scannerVersion: version };
  } catch (error: unknown) {
    return handleScanFailure(
      error,
      version,
      options.completeResults === true ? Infinity : input.maxFindings
    );
  }
}

/** A nonzero scan needs positive invocation-success evidence before parse recovery. */
const InvocationSuccessSchema = z.object({
  runs: z
    .array(
      z.object({
        invocations: z.array(z.object({ executionSuccessful: z.literal(true) })).min(1),
      })
    )
    .min(1),
});

function failureCode(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : 'unknown';
}

function failureOutput(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('stdout' in error)) return undefined;
  return typeof error.stdout === 'string' && error.stdout.length > 0 ? error.stdout : undefined;
}

function scannerInvocationsSuccessful(output: string): boolean {
  try {
    return InvocationSuccessSchema.safeParse(JSON.parse(output)).success;
  } catch {
    return false;
  }
}

function hasFileDiagnostics(result: SarifParseResult): boolean {
  return (result.parseDiagnostics?.length ?? 0) + (result.scannerDiagnostics?.length ?? 0) > 0;
}

function handleScanFailure(
  error: unknown,
  version: string,
  maxFindings: number
): SarifParseResult | { error: string } {
  const output = failureOutput(error);
  const result = output === undefined ? undefined : parseSarif(output, maxFindings);
  if (result !== undefined && output !== undefined && failureCode(error) === 3) {
    if (
      result.coverageComplete === true &&
      hasFileDiagnostics(result) &&
      scannerInvocationsSuccessful(output)
    ) {
      return { ...result, scannerVersion: version };
    }
  }
  const message = `${summarizeScanFailure(error)}${failedOutputDetails(result)}`;
  logger.warn('Security scan failed', { error: message });
  return { error: message };
}

function failedOutputDetails(result: SarifParseResult | undefined): string {
  if (result === undefined) return '';
  const files = [...(result.parseDiagnostics ?? []), ...(result.scannerDiagnostics ?? [])].map(
    (diagnostic) => diagnostic.file
  );
  const diagnostics = files.length > 0 ? `; affected files: ${[...new Set(files)].join(', ')}` : '';
  const errors = result.errors.length > 0 ? `; ${result.errors.join('; ')}` : '';
  return diagnostics + errors;
}

/** Keep exit codes and the actual diagnostic visible when command arguments are long. */
function summarizeScanFailure(error: unknown): string {
  const code = String(failureCode(error));
  const message = error instanceof Error ? error.message : String(error);
  const commandFailure = message.startsWith('Command failed:');
  const newline = message.indexOf('\n');
  const rawDiagnostic = commandFailure && newline >= 0 ? message.slice(newline + 1) : message;
  const diagnostic = rawDiagnostic
    .split('\n')
    .filter((line) => !isScannerNoise(line))
    .join('\n');
  const detail =
    diagnostic.length > 500 ? `[diagnostic truncated] ${diagnostic.slice(-500)}` : diagnostic;
  const files = [
    ...new Set(
      [...diagnostic.matchAll(/^(?:Syntax error|Other syntax error) at line (.+):\d+:/gm)].map(
        (match) => match[1]
      )
    ),
  ];
  const affected = files.length > 0 ? `; affected files: ${files.join(', ')}` : '';
  const unavailable =
    commandFailure && failureOutput(error) === undefined ? '; scanner stdout unavailable' : '';
  return `Scan failed (exit ${code}${unavailable}${affected}): ${detail}`;
}

/** Known incidental Python/runtime warnings must not hide scanner diagnostics. */
function isScannerNoise(line: string): boolean {
  return (
    /opentelemetry\/instrumentation\/dependencies\.py.*UserWarning: pkg_resources/.test(line) ||
    /^\s*from pkg_resources import \(/.test(line) ||
    /^pyenv: (?:cannot rehash|warning:)/.test(line) ||
    /^.*WARNING.*(?:experimental|--x-).*$/i.test(line) ||
    /^.*These options are not part of the semgrep API.*$/.test(line)
  );
}

/** Test-only surface — do not import in production code. */
export const _testing = { validateTargetPath };

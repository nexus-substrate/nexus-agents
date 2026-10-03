/**
 * Security Scan Tool (#1683)
 *
 * Runs a SAST scanner (Semgrep) against a local codebase and returns
 * structured findings via the SARIF parser. Part of the Proactive
 * Defensive Security epic (#1681).
 *
 * @module mcp/tools/security-scan
 */

import type { SecurityScanInput } from './security-scan-types.js';
import { parseSarif } from '../../security/sarif-parser.js';
import type { SarifParseResult } from '../../security/sarif-types.js';
import { createLogger } from '../../core/index.js';
import { resolveInsideRoot } from '../../security/safe-path.js';
import { execFileTree } from '../../cli-adapters/exec-file-tree.js';

const logger = createLogger({ component: 'security-scan' });

/** Timeout for scanner execution (5 minutes). */
const SCAN_TIMEOUT_MS = 300_000;

/** Check if semgrep is available. */
async function isSemgrepAvailable(
  signal: AbortSignal | undefined,
  env: NodeJS.ProcessEnv | undefined
): Promise<boolean> {
  try {
    await execFileTree('semgrep', ['--version'], { timeoutMs: 10_000, signal, env });
    return true;
  } catch {
    return false;
  }
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
  env: NodeJS.ProcessEnv | undefined
): Promise<string> {
  const args = ['--sarif', '--quiet', ...rulesets.flatMap((r) => ['--config', r]), targetDir];

  const { stdout } = await execFileTree('semgrep', args, {
    timeoutMs: SCAN_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024, // 10MB for large SARIF output
    signal,
    env,
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
  /** Caller abort (#6747). */
  readonly signal?: AbortSignal | undefined;
  /** Scanner subprocess environment. Absent: inherit the caller's. */
  readonly env?: NodeJS.ProcessEnv | undefined;
  /**
   * Root the target must resolve inside. Absent: the server's cwd. Only a
   * caller that CREATED the directory may pass it: the dev pipeline's scratch
   * worktree lives outside cwd by design (#6794), so cwd containment rejected
   * every pipeline scan and left security unmeasured.
   */
  readonly root?: string | undefined;
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

  const available = await isSemgrepAvailable(signal, env);
  // An abort during the probe is not a missing scanner.
  if (signal?.aborted === true) return { error: 'Scan aborted before semgrep ran' };
  if (!available) {
    return {
      error: 'semgrep is not installed. Install with: pip install semgrep',
    };
  }

  try {
    const sarifOutput = await runSemgrep(targetDir, input.rulesets, signal, env);
    const result = parseSarif(sarifOutput, input.maxFindings);

    logger.info('Security scan completed', {
      scanner: result.scanner,
      findings: result.totalFindings,
      errors: result.errors.length,
    });

    return result;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.warn('Security scan failed', { error: msg });
    return { error: `Scan failed: ${msg.slice(0, 500)}` };
  }
}

/** Test-only surface — do not import in production code. */
export const _testing = { validateTargetPath };

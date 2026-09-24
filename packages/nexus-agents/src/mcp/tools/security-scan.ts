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
async function isSemgrepAvailable(signal: AbortSignal | undefined): Promise<boolean> {
  try {
    await execFileTree('semgrep', ['--version'], { timeoutMs: 10_000, signal });
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
  signal: AbortSignal | undefined
): Promise<string> {
  const args = ['--sarif', '--quiet', ...rulesets.flatMap((r) => ['--config', r]), targetDir];

  const { stdout } = await execFileTree('semgrep', args, {
    timeoutMs: SCAN_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024, // 10MB for large SARIF output
    signal,
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
function validateTargetPath(target: string): string {
  // Require the target to be inside cwd (or cwd itself), following symlinks.
  const resolved = resolveInsideRoot(target);
  if (resolved === null) {
    throw new Error(`Invalid target path: must resolve inside ${process.cwd()} (got ${target})`);
  }
  return resolved;
}

/**
 * Execute a security scan against a local codebase.
 *
 * @param input - Scan configuration
 * @param signal - Caller abort (#6747): ends the scanner's process tree and
 *   returns an `error` saying the scan was aborted, not a result.
 * @returns Parsed SARIF findings or error message
 */
export async function executeSecurityScan(
  input: SecurityScanInput,
  signal?: AbortSignal
): Promise<SarifParseResult | { error: string }> {
  let targetDir: string;
  try {
    targetDir = validateTargetPath(input.target);
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  logger.info('Starting security scan', {
    target: targetDir,
    scanner: input.scanner,
    rulesets: input.rulesets,
  });

  const available = await isSemgrepAvailable(signal);
  // An abort during the probe is not a missing scanner.
  if (signal?.aborted === true) return { error: 'Scan aborted before semgrep ran' };
  if (!available) {
    return {
      error: 'semgrep is not installed. Install with: pip install semgrep',
    };
  }

  try {
    const sarifOutput = await runSemgrep(targetDir, input.rulesets, signal);
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

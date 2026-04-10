/**
 * Security Gate — SARIF-based quality gate for the pipeline (#1681, #1684)
 *
 * Integrates the SARIF parser and security_scan tool into the
 * quality-gated pipeline as a scan stage check.
 *
 * @module pipeline/security-gate
 */

import type { GateCheckResult } from '../security/quality-gate-types.js';
import type { GateCheckFn } from '../security/quality-gate.js';
import { executeSecurityScan } from '../mcp/tools/security-scan.js';
import { recordScanResults } from '../security/finding-lifecycle.js';
import type { FindingLifecycleEntry } from '../security/finding-lifecycle.js';
import { createLogger } from '../core/index.js';

const logger = createLogger({ component: 'security-gate' });

/** In-memory lifecycle entries for the current scan. Consumers can retrieve via getLastScanLifecycle(). */
let lastScanLifecycle: readonly FindingLifecycleEntry[] = [];

/** Get lifecycle entries from the most recent security gate scan. */
export function getLastScanLifecycle(): readonly FindingLifecycleEntry[] {
  return lastScanLifecycle;
}

/** Severity levels that block the pipeline. */
const BLOCKING_SEVERITIES = new Set(['critical', 'high']);

/**
 * Create a quality gate check that runs Semgrep and fails
 * if critical or high severity findings are detected.
 *
 * @param targetDir - Directory to scan
 * @param rulesets - Semgrep rulesets (default: p/default)
 * @returns GateCheckFn for use in runQualityPipeline
 */
export function checkSecurityScan(
  targetDir: string,
  rulesets: readonly string[] = ['p/default']
): GateCheckFn {
  return async (): Promise<GateCheckResult> => {
    const start = Date.now();
    const result = await executeSecurityScan({
      target: targetDir,
      scanner: 'auto',
      rulesets: [...rulesets],
      maxFindings: 50,
    });

    if ('error' in result) {
      logger.warn('Security scan skipped', { error: result.error });
      return {
        name: 'security_scan',
        verdict: 'skip',
        details: result.error,
        durationMs: Date.now() - start,
      };
    }

    const sarifResult = result;

    // Record scan findings in lifecycle tracker (#1681 Phase 3)
    const lifecycleEntries: FindingLifecycleEntry[] = [];
    lastScanLifecycle = recordScanResults(sarifResult.findings, (entry) => {
      lifecycleEntries.push(entry);
    });
    logger.debug('Security findings recorded', { count: lifecycleEntries.length });

    const blocking = sarifResult.findings.filter((f) => BLOCKING_SEVERITIES.has(f.severity));

    if (blocking.length > 0) {
      const summary = blocking
        .slice(0, 5)
        .map((f) => `${f.severity}: ${f.rule} in ${f.file}:${String(f.startLine)}`)
        .join('; ');
      return {
        name: 'security_scan',
        verdict: 'fail',
        details: `${String(blocking.length)} blocking findings: ${summary}`,
        durationMs: Date.now() - start,
      };
    }

    return {
      name: 'security_scan',
      verdict: 'pass',
      details: `${String(sarifResult.totalFindings)} findings (none blocking)`,
      durationMs: Date.now() - start,
    };
  };
}

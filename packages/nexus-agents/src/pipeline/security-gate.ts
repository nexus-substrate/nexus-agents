/**
 * Security Gate — security pipeline for the quality-gated flow (#1681, #1684)
 *
 * Pipeline: scan → OSV enrich → report.
 *
 * There was a triage stage between scan and OSV. It is gone (#5119 item 1),
 * and the reason is recorded here so a future producer finds the prior art
 * instead of rebuilding blind. `SecurityGateConfig.triageFn` was a delegate
 * seam with **zero production producers** — both callers
 * (`pipeline/agent-executor.ts`, `mcp/tools/quality-gate-tool.ts`) passed no
 * config — so a `defaultTriageDelegate` fabricated
 * `{confirmed: true, confidence: 0.5, suggestedSeverity: 'high'}` for every
 * finding. That made `falsePositiveCount` structurally 0, which made the
 * summary's "N filtered as false positives" branch unreachable and the word
 * "confirmed" in "N confirmed blocking" a verdict claim backed by no verdict.
 *
 * The re-entry contract, should triage be wanted: it returns through TDD with
 * a named producer AND a named consumer arriving together. A delegate seam
 * kept ahead of its producer is what produced the fabricated default.
 *
 * @module pipeline/security-gate
 */

import type { GateCheckResult } from '../security/quality-gate-types.js';
import type { GateCheckFn } from '../security/quality-gate.js';
import { executeSecurityScan } from '../mcp/tools/security-scan.js';
import { queryOsvBatch } from '../security/osv-lookup.js';
import type { OsvVulnerability } from '../security/osv-lookup.js';
import type { SecurityFinding } from '../security/sarif-types.js';
import { createLogger } from '../core/index.js';

const logger = createLogger({ component: 'security-gate' });

/** Severity levels that block the pipeline. */
const BLOCKING_SEVERITIES = new Set(['critical', 'high']);

/** Configuration for the security gate. */
export interface SecurityGateConfig {
  /** Whether to run OSV dependency checks (default: true). */
  readonly enableOsv?: boolean | undefined;
}

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
  rulesets: readonly string[] = ['p/default'],
  config: SecurityGateConfig = {}
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

    return runSecurityPipeline(result, targetDir, config, start);
  };
}

// ============================================================================
// Security Pipeline (#1773)
// ============================================================================

/** Run the pipeline: OSV → assess → report. */
async function runSecurityPipeline(
  sarifResult: {
    totalFindings: number;
    findings: readonly SecurityFinding[];
    // #5343 follow-up: `errors` was absent from this type, so every
    // "Skipped result N" the parser produced was structurally unreachable from
    // the only consumer whose verdict depends on it. A finding the parser could
    // not read is not the same as a clean scan, and the gate could not tell.
    errors: readonly string[];
  },
  targetDir: string,
  config: SecurityGateConfig,
  start: number
): Promise<GateCheckResult> {
  // OSV dependency check (#1773)
  const osv = await runOsvCheck(targetDir, config.enableOsv ?? true);
  const osvVulns = osv.vulnerabilities;

  // Assess: a finding blocks because its severity blocks. Nothing filters.
  const blocking = getBlockingFindings(sarifResult.findings);
  const details = buildScanSummary(
    sarifResult.totalFindings,
    blocking.length,
    osvVulns.length,
    osv,
    sarifResult.errors.length
  );

  logger.info('Security gate complete', {
    total: sarifResult.totalFindings,
    blocking: blocking.length,
    osvVulns: osvVulns.length,
    osvFailedLookups: osv.failedLookups,
    sarifParseErrors: sarifResult.errors.length,
  });

  const failed = blocking.length > 0 || osvVulns.some((v) => v.severity === 'CRITICAL');
  return {
    name: 'security_scan',
    verdict: failed ? 'fail' : 'pass',
    details,
    durationMs: Date.now() - start,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/** Run OSV dependency check if enabled (#1773). */
/**
 * Result of the OSV dependency lookup, carrying what it could NOT check.
 *
 * #5018: this returned a bare array, so an unreachable OSV API produced `[]`
 * — byte-identical to a clean scan — and `buildScanSummary` folded it into
 * "none blocking". `queryOsv` reports `{ vulnerabilities: [], error }` on a
 * non-200 or a timeout; the error was never read.
 */
interface OsvCheckResult {
  readonly vulnerabilities: OsvVulnerability[];
  /** Lookups that returned an error rather than a verdict. */
  readonly failedLookups: number;
  /** Dependencies queried, and how many the manifest declared. */
  readonly queried: number;
  readonly declared: number;
  /**
   * The check did not run to completion — a manifest read error, or
   * `queryOsvBatch` throwing.
   *
   * Distinct from `failedLookups`, which counts dependencies whose INDIVIDUAL
   * lookup errored. The outer catch used to return `OSV_EMPTY`, resetting
   * `failedLookups` to 0 and so defeating the disclosure #5018 added: the
   * summary fell through to "none blocking", the exact phrase that counter
   * exists to prevent.
   *
   * Also distinct from the two HONEST empties — OSV disabled, and a manifest
   * with no dependencies — which keep `checkFailed: false` so the new message
   * does not print on every opted-out run.
   */
  readonly checkFailed: boolean;
}

const OSV_EMPTY: OsvCheckResult = {
  vulnerabilities: [],
  failedLookups: 0,
  queried: 0,
  declared: 0,
  checkFailed: false,
};

/** The empty result for a check that ERRORED, as opposed to finding nothing. */
const OSV_CHECK_FAILED: OsvCheckResult = { ...OSV_EMPTY, checkFailed: true };

/** Dependencies queried per run. The cap is disclosed in the scan summary. */
const OSV_DEPENDENCY_CAP = 20;

async function runOsvCheck(targetDir: string, enabled: boolean): Promise<OsvCheckResult> {
  if (!enabled) return OSV_EMPTY;
  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const pkgPath = path.join(targetDir, 'package.json');
    if (!fs.existsSync(pkgPath)) return OSV_EMPTY;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
      dependencies?: Record<string, string>;
    };
    const declared = Object.keys(pkg.dependencies ?? {}).length;
    const deps = Object.entries(pkg.dependencies ?? {})
      .slice(0, OSV_DEPENDENCY_CAP)
      .map(([name, version]) => ({
        name,
        version: version.replace(/^[\^~>=<]+/, ''),
      }));
    if (deps.length === 0) return OSV_EMPTY;
    const results = await queryOsvBatch(deps);
    return {
      vulnerabilities: results.flatMap((r) => [...r.vulnerabilities]),
      // The half that used to be dropped: a 503 or a timeout yields an empty
      // `vulnerabilities` array with an `error` set, which read as "clean".
      failedLookups: results.filter((r) => r.error !== null).length,
      queried: deps.length,
      declared,
      // The check ran. Individual lookups may still have errored — that is
      // `failedLookups`, a different and finer-grained fact.
      checkFailed: false,
    };
  } catch (error) {
    // `warn`, not `debug`: debug is invisible at normal log levels, so an
    // operator saw a clean security summary with no signal the check failed.
    logger.warn('OSV check did not run', { error: String(error) });
    return OSV_CHECK_FAILED;
  }
}

/**
 * Filter to the findings whose severity blocks the pipeline.
 *
 * This used to be `getConfirmedBlockingFindings`, which then dropped any
 * finding a triage verdict marked unconfirmed. #2933 fixed a bug in that
 * filter — it matched `verdicts[i]` positionally against a severity-sorted,
 * truncated verdict list, so a high-severity finding could be dropped on
 * another finding's verdict. With the triage seam gone (#5119 item 1) there is
 * no filter and therefore no drop; the fail-safe the old code reached for by
 * treating a missing verdict as confirmed is now the only behaviour there is.
 */
function getBlockingFindings(findings: readonly SecurityFinding[]): SecurityFinding[] {
  return findings.filter((f) => BLOCKING_SEVERITIES.has(f.severity));
}

/**
 * Build human-readable scan summary.
 *
 * Two phrases used to live here and no longer do. "N filtered as false
 * positives" was guarded by a count that was structurally 0, so it could never
 * render. "N **confirmed** blocking" claimed a triage confirmation that the
 * fabricated default verdict had not performed. A finding is reported as
 * blocking because its severity blocks — which is all this gate knows.
 */
/**
 * The one line that says what the OSV verdict actually covers.
 *
 * Ordered deliberately, strictest claim last. #5018: an OSV outage used to land
 * in "none blocking" — a lookup that errored produced no vulnerabilities, which
 * is not the same as finding none. The `checkFailed` arm comes FIRST because a
 * check that never ran reports zero failed lookups, so without it a whole-check
 * error fell through to the clean-scan phrase.
 */
function osvCoverageNote(blocking: number, osvCount: number, osv?: OsvCheckResult): string {
  if (osv?.checkFailed === true) {
    return 'OSV check did not run (error) — dependency vulnerabilities unknown';
  }
  if (osv !== undefined && osv.failedLookups > 0) {
    return `OSV not checked for ${String(osv.failedLookups)} of ${String(osv.queried)} dependencies (lookup failed)`;
  }
  if (blocking === 0 && osvCount === 0) return 'none blocking';
  return '';
}

function buildScanSummary(
  total: number,
  blocking: number,
  osvCount: number,
  osv?: OsvCheckResult,
  sarifParseErrors = 0
): string {
  const parts = [`${String(total)} SAST findings`];
  // A result the parser could not read is not a result it did not find.
  // Without this the two are indistinguishable in the gate's own summary.
  if (sarifParseErrors > 0) {
    parts.push(
      `${String(sarifParseErrors)} scanner output line(s) unreadable — SAST coverage is partial`
    );
  }
  if (blocking > 0) parts.push(`${String(blocking)} blocking`);
  if (osvCount > 0) parts.push(`${String(osvCount)} OSV dependency vulnerabilities`);
  parts.push(osvCoverageNote(blocking, osvCount, osv));
  // State the denominator the OSV verdict actually covers: the query is capped,
  // and devDependencies are never queried at all.
  if (osv !== undefined && osv.declared > osv.queried) {
    parts.push(
      `OSV covered ${String(osv.queried)} of ${String(osv.declared)} declared dependencies`
    );
  }
  return parts.filter((p) => p !== '').join(', ');
}

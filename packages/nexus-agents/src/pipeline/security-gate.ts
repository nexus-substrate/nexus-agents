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
import { executeSecurityScan } from '../mcp/tools/security-scan.js';
import { runOsvCheck, type OsvCheckResult } from './dependency-gate.js';
import type { SecurityFinding } from '../security/sarif-types.js';
import { createLogger } from '../core/index.js';
import {
  compareSecurityBaseline,
  type SecurityBaselineComparison,
  type SecurityBaseline,
} from './security-baseline.js';
export type { SecurityBaselineComparison, SecurityBaseline } from './security-baseline.js';

export interface SecurityGateResult extends GateCheckResult {
  readonly comparison?: SecurityBaselineComparison;
  /** Blocking SAST findings measured by a non-baseline scan. */
  readonly blockingFindings?: readonly SecurityFinding[];
  /** Dependency coverage the verdict did not reach. Present on any verdict, including a pass. */
  readonly coverageNote?: string;
}

import { throwIfAborted } from '../adapters/abort-utils.js';

const logger = createLogger({ component: 'security-gate' });

/** Severity levels that block the pipeline. */
const BLOCKING_SEVERITIES = new Set(['critical', 'high']);

/** Configuration for the security gate. */
export interface SecurityGateConfig {
  /** Manifest directory for OSV checks. Defaults to the file scan target. */
  readonly dependencyTarget?: string | undefined;
  /** Shared capture root used to select changed manifests. Absent: check dependencyTarget only. */
  readonly dependencyCaptureRoot?: string | undefined;
  /** Actual pipeline base resolved before implementation. */
  readonly baseline?: SecurityBaseline | undefined;
  /** Whether to run OSV dependency checks (default: true). */
  readonly enableOsv?: boolean | undefined;
  /** Subprocess environment. Absent: inherit the caller's environment. */
  readonly env?: NodeJS.ProcessEnv | undefined;
  /** Optional scratch OS sandbox. */
  readonly wrapper?: import('../cli-adapters/exec-file-tree.js').CommandWrapper | undefined;
  /** Containment root for the target. Absent: the server's cwd (see SecurityScanOptions.root). */
  readonly root?: string | undefined;
}

/**
 * Create a quality gate check that runs Semgrep and fails
 * if critical or high severity findings are detected.
 *
 * @param targetDir - Directory to scan
 * @param rulesets - Semgrep rulesets (default: p/default)
 * @returns GateCheckFn — a gate predicate. `runQualityPipeline`, the
 * orchestrator this once pointed at, was deleted in #5771: it never had a
 * production caller and its docstring claimed dev-pipeline's workflow.
 */
export function checkSecurityScan(
  targetDir: string,
  rulesets: readonly string[] = ['p/default'],
  config: SecurityGateConfig = {}
): (signal?: AbortSignal) => Promise<SecurityGateResult> {
  return async (signal?: AbortSignal): Promise<SecurityGateResult> => {
    if (config.baseline !== undefined) return runBaselineGate(targetDir, rulesets, config, signal);
    const start = Date.now();
    const result = await executeSecurityScan(
      {
        target: targetDir,
        scanner: 'auto',
        rulesets: [...rulesets],
        maxFindings: 50,
      },
      { signal, env: config.env, root: config.root, wrapper: config.wrapper }
    );
    // #6747: an aborted scan measured nothing. Rejecting keeps it from being
    // reported as a `skip`, and keeps the OSV lookups from starting.
    throwIfAborted(signal, 'Security scan aborted');

    if ('error' in result) {
      logger.warn('Security scan skipped', { error: result.error });
      return {
        name: 'security_scan',
        verdict: 'skip',
        details: result.error,
        durationMs: Date.now() - start,
      };
    }

    const gateResult = await runSecurityPipeline(
      result,
      config.dependencyTarget ?? targetDir,
      config,
      start,
      signal
    );
    // Incomplete coverage cannot erase a measured SAST or OSV failure.
    if (gateResult.verdict === 'fail') return gateResult;
    if (result.parseDiagnostics !== undefined && result.parseDiagnostics.length > 0) {
      return {
        ...gateResult,
        verdict: 'skip',
        details: `Security scan incomplete: unparsed files ${result.parseDiagnostics.map((d) => d.file).join(', ')}`,
        durationMs: Date.now() - start,
      };
    }
    return gateResult;
  };
}

/** Preserve dependency checking while comparing only the SAST change. */
async function runBaselineGate(
  target: string,
  rulesets: readonly string[],
  config: SecurityGateConfig,
  signal?: AbortSignal
): Promise<SecurityGateResult> {
  const start = Date.now();
  const comparison = await compareSecurityBaseline(target, rulesets, config, signal);
  const osv = await runOsvCheck(config.dependencyTarget ?? target, config, signal);
  throwIfAborted(signal, 'Security baseline scan aborted');
  const osvFailed = blocksDependencyCheck(osv);
  const details = comparison.complete
    ? `Base ${String(comparison.baseCount)}, worktree ${String(comparison.worktreeCount)} findings; ${String(comparison.introducedBlockingCount)} introduced blocking; ${buildScanSummary(comparison.worktreeCount ?? 0, comparison.introducedBlockingCount ?? 0, osv.vulnerabilities.length, osv)}`
    : `Dependency check: ${buildScanSummary(null, 0, osv.vulnerabilities.length, osv)}; Security comparison incomplete: ${comparison.errors.join('; ')}`;
  return {
    name: 'security_scan',
    verdict: osvFailed
      ? 'fail'
      : !comparison.complete
        ? 'skip'
        : comparison.introducedBlockingCount === 0
          ? 'pass'
          : 'fail',
    details: (osv.manifestError === undefined ? details : `${osv.manifestError}; ${details}`).slice(
      0,
      500
    ),
    comparison,
    ...coverageNoteField(osv),
    durationMs: Date.now() - start,
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
  start: number,
  signal: AbortSignal | undefined
): Promise<SecurityGateResult> {
  // OSV dependency check (#1773)
  const osv = await runOsvCheck(targetDir, config, signal);
  // A batch cut short by the abort covers only some dependencies; no verdict.
  throwIfAborted(signal, 'Security scan aborted');
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

  const failed = blocking.length > 0 || blocksDependencyCheck(osv);
  return {
    name: 'security_scan',
    verdict: failed ? 'fail' : 'pass',
    details: osv.manifestError === undefined ? details : `${osv.manifestError}; ${details}`,
    blockingFindings: blocking,
    ...coverageNoteField(osv),
    durationMs: Date.now() - start,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/** A changed-manifest coverage error blocks alongside measured critical advisories. */
function blocksDependencyCheck(osv: OsvCheckResult): boolean {
  return (
    osv.manifestError !== undefined || osv.vulnerabilities.some((v) => v.severity === 'CRITICAL')
  );
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
  if (osv?.checkFailed === true) return OSV_DID_NOT_RUN;
  if (osv !== undefined && osv.failedLookups > 0) return failedLookupsNote(osv);
  if (blocking === 0 && osvCount === 0) return 'none blocking';
  return '';
}

const OSV_DID_NOT_RUN = 'OSV check did not run (error) — dependency vulnerabilities unknown';

function failedLookupsNote(osv: OsvCheckResult): string {
  return `OSV not checked for ${String(osv.failedLookups)} of ${String(osv.queried)} dependencies (lookup failed)`;
}

function cappedCoverageNote(osv: OsvCheckResult): string {
  return `OSV covered ${String(osv.queried)} of ${String(osv.declared)} declared dependencies`;
}

/**
 * Dependency coverage the OSV verdict did not reach, as a field for the gate
 * result. `details` is dropped on a pass, so partial coverage needs its own
 * field to avoid being recorded as full coverage. Absent when coverage is full.
 */
function coverageNoteField(osv: OsvCheckResult): { coverageNote?: string } {
  const gaps: string[] = [];
  if (osv.checkFailed) gaps.push(OSV_DID_NOT_RUN);
  if (osv.failedLookups > 0) gaps.push(failedLookupsNote(osv));
  if (osv.declared > osv.queried) gaps.push(cappedCoverageNote(osv));
  return gaps.length === 0
    ? {}
    : { coverageNote: `Dependency coverage partial: ${gaps.join('; ')}` };
}

function buildScanSummary(
  total: number | null,
  blocking: number,
  osvCount: number,
  osv?: OsvCheckResult,
  sarifParseErrors = 0
): string {
  // An incomplete baseline has no measured SAST total; report dependencies only.
  const parts = total === null ? [] : [`${String(total)} SAST findings`];
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
    parts.push(cappedCoverageNote(osv));
  }
  return parts.filter((p) => p !== '').join(', ');
}

// Security gate — cohesive single module with triage pipeline
/**
 * Security Gate — Intelligent security pipeline for the quality-gated flow (#1681, #1684)
 *
 * Pipeline: scan → triage (filter FPs) → OSV enrich → severity consensus → report
 *
 * @module pipeline/security-gate
 */

import type { GateCheckResult } from '../security/quality-gate-types.js';
import type { GateCheckFn } from '../security/quality-gate.js';
import { executeSecurityScan } from '../mcp/tools/security-scan.js';
import {
  recordScanResults,
  recordTriaged,
  summarizeLifecycle,
} from '../security/finding-lifecycle.js';
import type { FindingLifecycleEntry } from '../security/finding-lifecycle.js';
import { triageFindings } from '../security/finding-triage.js';
import type { TriagedFinding } from '../security/finding-triage.js';
import { queryOsvBatch } from '../security/osv-lookup.js';
import type { OsvVulnerability } from '../security/osv-lookup.js';
import type { SecurityFinding } from '../security/sarif-types.js';
import { createLogger } from '../core/index.js';

const logger = createLogger({ component: 'security-gate' });

/** In-memory lifecycle entries for the current scan. */
let lastScanLifecycle: readonly FindingLifecycleEntry[] = [];
/** Last OSV vulnerabilities found. */
let lastOsvVulnerabilities: readonly OsvVulnerability[] = [];
/** Last triage verdicts (paired with their finding IDs — see #2933). */
let lastTriageVerdicts: readonly TriagedFinding[] = [];

/** Get lifecycle entries from the most recent security gate scan. */
export function getLastScanLifecycle(): readonly FindingLifecycleEntry[] {
  return lastScanLifecycle;
}

/** Get OSV vulnerabilities from the most recent scan. */
export function getLastOsvVulnerabilities(): readonly OsvVulnerability[] {
  return lastOsvVulnerabilities;
}

/** Get triage verdicts from the most recent scan (each paired with its finding id, #2933). */
export function getLastTriageVerdicts(): readonly TriagedFinding[] {
  return lastTriageVerdicts;
}

/** Severity levels that block the pipeline. */
const BLOCKING_SEVERITIES = new Set(['critical', 'high']);

/** Default delegate function that returns a conservative assessment (no LLM available). */
function defaultTriageDelegate(_prompt: string): Promise<string> {
  // Without a real LLM, assume findings are real (fail-safe)
  return Promise.resolve(
    JSON.stringify({
      confirmed: true,
      confidence: 0.5,
      reasoning: 'No triage model available — assuming confirmed (fail-safe)',
      suggestedSeverity: 'high',
    })
  );
}

/** Configuration for the enhanced security gate. */
export interface SecurityGateConfig {
  /** Function to delegate triage assessment to an LLM (optional). */
  readonly triageFn?: ((prompt: string) => Promise<string>) | undefined;
  /** Whether to run OSV dependency checks (default: true). */
  readonly enableOsv?: boolean | undefined;
  /** Max findings to triage (default: 10). */
  readonly maxTriageFindings?: number | undefined;
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

    return runTriagePipeline(result, targetDir, config, start);
  };
}

// ============================================================================
// Triage Pipeline (#1770, #1773, #1775)
// ============================================================================

/** Run the full triage pipeline: record → triage → OSV → assess → report. */
async function runTriagePipeline(
  sarifResult: { totalFindings: number; findings: readonly SecurityFinding[] },
  targetDir: string,
  config: SecurityGateConfig,
  start: number
): Promise<GateCheckResult> {
  // Step 1: Record all findings as 'detected' (#1775)
  const lifecycleEntries: FindingLifecycleEntry[] = [];
  lastScanLifecycle = recordScanResults(sarifResult.findings, (e) => lifecycleEntries.push(e));

  // Step 2: Triage to filter false positives (#1770)
  const triageFn = config.triageFn ?? defaultTriageDelegate;
  const triageResult = await triageFindings([...sarifResult.findings], triageFn, {
    maxFindings: config.maxTriageFindings ?? 10,
    contextLines: 5,
    minConfidence: 0.5,
  });
  lastTriageVerdicts = triageResult.triaged;
  recordTriageLifecycle(triageResult.triaged, lifecycleEntries);

  // Step 3: OSV dependency check (#1773)
  const osvVulns = await runOsvCheck(targetDir, config.enableOsv ?? true);
  lastOsvVulnerabilities = osvVulns;

  // Assess: only confirmed findings block
  const confirmed = getConfirmedBlockingFindings(sarifResult.findings, triageResult.triaged);
  const lifecycle = summarizeLifecycle(lifecycleEntries);
  const details = buildScanSummary(
    sarifResult.totalFindings,
    confirmed.length,
    lifecycle.falsePositiveCount,
    osvVulns.length
  );

  logger.info('Security gate complete', {
    total: sarifResult.totalFindings,
    confirmed: confirmed.length,
    falsePositives: lifecycle.falsePositiveCount,
    osvVulns: osvVulns.length,
  });

  const failed = confirmed.length > 0 || osvVulns.some((v) => v.severity === 'CRITICAL');
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

/**
 * Record triage verdicts in lifecycle tracker (#1775).
 *
 * Pre-#2933 this paired `findings[i]` with `verdicts[i]` positionally — wrong,
 * because `triageFindings` sorts by severity and may skip parse-failed verdicts,
 * so position-i in each array refers to different findings. Each TriagedFinding
 * now carries its own finding object, so the pairing is intrinsic.
 */
function recordTriageLifecycle(
  verdicts: readonly TriagedFinding[],
  entries: FindingLifecycleEntry[]
): void {
  for (const triaged of verdicts) {
    recordTriaged(triaged.finding, triaged.verdict, (entry) => entries.push(entry));
  }
}

/** Run OSV dependency check if enabled (#1773). */
async function runOsvCheck(targetDir: string, enabled: boolean): Promise<OsvVulnerability[]> {
  if (!enabled) return [];
  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const pkgPath = path.join(targetDir, 'package.json');
    if (!fs.existsSync(pkgPath)) return [];
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
      dependencies?: Record<string, string>;
    };
    const deps = Object.entries(pkg.dependencies ?? {})
      .slice(0, 20)
      .map(([name, version]) => ({
        name,
        version: version.replace(/^[\^~>=<]+/, ''),
      }));
    if (deps.length === 0) return [];
    const results = await queryOsvBatch(deps);
    return results.flatMap((r) => [...r.vulnerabilities]);
  } catch (error) {
    logger.debug('OSV check skipped', { error: String(error) });
    return [];
  }
}

/**
 * Filter to confirmed blocking findings (triage-aware) (#1770).
 *
 * Verdicts are matched to findings by **id**, not array position — see #2933.
 * Pre-#2933 the filter used `verdicts[i]` where `i` indexed `blocking` in
 * original order, but `verdicts` was in severity-sorted-then-truncated order,
 * so a high-severity finding could get matched against a verdict for a
 * different (often lower-severity) finding and be silently dropped.
 */
function getConfirmedBlockingFindings(
  findings: readonly SecurityFinding[],
  verdicts: readonly TriagedFinding[]
): SecurityFinding[] {
  const blocking = findings.filter((f) => BLOCKING_SEVERITIES.has(f.severity));
  if (verdicts.length === 0) return [...blocking]; // No triage — all block (fail-safe)

  const verdictById = new Map(verdicts.map((t) => [t.finding.id, t.verdict]));
  return blocking.filter((f) => {
    const verdict = verdictById.get(f.id);
    return verdict === undefined || verdict.confirmed; // Unknown = confirmed (fail-safe)
  });
}

/** Build human-readable scan summary. */
function buildScanSummary(
  total: number,
  confirmed: number,
  falsePositives: number,
  osvCount: number
): string {
  const parts = [`${String(total)} SAST findings`];
  if (falsePositives > 0) parts.push(`${String(falsePositives)} filtered as false positives`);
  if (confirmed > 0) parts.push(`${String(confirmed)} confirmed blocking`);
  if (osvCount > 0) parts.push(`${String(osvCount)} OSV dependency vulnerabilities`);
  if (confirmed === 0 && osvCount === 0) parts.push('none blocking');
  return parts.join(', ');
}

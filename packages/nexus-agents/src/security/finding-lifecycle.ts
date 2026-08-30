/**
 * Finding Lifecycle Tracker — Bridge security findings to outcome store (#1681 Phase 3)
 *
 * Records the lifecycle of security findings (scan→triage→fix→verify) in the
 * outcome store for performance measurement and remediation tracking.
 *
 * @module security/finding-lifecycle
 */

import { z } from 'zod';
import type { SecurityFinding } from './sarif-types.js';
import type { TriageVerdict } from './finding-triage.js';
import type { GeneratedFix } from './fix-generator.js';

// ============================================================================
// Types
// ============================================================================

export const FindingLifecycleStageSchema = z.enum([
  'detected',
  'triaged',
  'fix_generated',
  'fix_applied',
  'verified',
  'dismissed',
]);

export type FindingLifecycleStage = z.infer<typeof FindingLifecycleStageSchema>;

export interface FindingLifecycleEntry {
  readonly findingId: string;
  readonly rule: string;
  readonly file: string;
  readonly severity: string;
  readonly stage: FindingLifecycleStage;
  readonly timestamp: string;
  readonly confirmed: boolean | null;
  readonly fixGenerated: boolean;
  readonly metadata: Record<string, unknown>;
}

export interface FindingLifecycleSummary {
  readonly totalDetected: number;
  readonly totalTriaged: number;
  readonly confirmedCount: number;
  readonly falsePositiveCount: number;
  readonly fixesGenerated: number;
  readonly fixesApplied: number;
  readonly verified: number;
  readonly dismissed: number;
  /**
   * False positives as a share of triaged findings, or `null` when nothing was
   * triaged (#5119 item 1).
   *
   * This was `number`, and the no-triage case returned `0` — a rate of zero
   * false positives, which reads as a good score and is indistinguishable from
   * a real one. It is the same shape its sibling `meanTimeToTriageMs` already
   * declined to take: an average over an empty set is `null` here, and a rate
   * over an empty set is too.
   */
  readonly falsePositiveRate: number | null;
  readonly meanTimeToTriageMs: number | null;
}

/** Callback to persist a lifecycle entry. */
export type PersistFn = (entry: FindingLifecycleEntry) => void;

// ============================================================================
// Implementation
// ============================================================================

/**
 * Create a lifecycle entry for a detected finding.
 */
export function recordDetected(
  finding: SecurityFinding,
  persist: PersistFn
): FindingLifecycleEntry {
  const entry: FindingLifecycleEntry = {
    findingId: finding.id,
    rule: finding.rule,
    file: `${finding.file}:${String(finding.startLine)}`,
    severity: finding.severity,
    stage: 'detected',
    timestamp: new Date().toISOString(),
    confirmed: null,
    fixGenerated: false,
    metadata: { scanner: finding.scanner, cweIds: finding.cweIds },
  };
  persist(entry);
  return entry;
}

/**
 * Record a triage verdict for a finding.
 */
export function recordTriaged(
  finding: SecurityFinding,
  verdict: TriageVerdict,
  persist: PersistFn
): FindingLifecycleEntry {
  const entry: FindingLifecycleEntry = {
    findingId: finding.id,
    rule: finding.rule,
    file: `${finding.file}:${String(finding.startLine)}`,
    severity: verdict.suggestedSeverity,
    stage: verdict.confirmed ? 'triaged' : 'dismissed',
    timestamp: new Date().toISOString(),
    confirmed: verdict.confirmed,
    fixGenerated: false,
    metadata: {
      confidence: verdict.confidence,
      reasoning: verdict.reasoning,
      originalSeverity: finding.severity,
    },
  };
  persist(entry);
  return entry;
}

/**
 * Record that a fix was generated for a finding.
 */
export function recordFixGenerated(
  findingId: string,
  finding: SecurityFinding,
  fix: GeneratedFix,
  persist: PersistFn
): FindingLifecycleEntry {
  const entry: FindingLifecycleEntry = {
    findingId,
    rule: finding.rule,
    file: `${finding.file}:${String(finding.startLine)}`,
    severity: finding.severity,
    stage: 'fix_generated',
    timestamp: new Date().toISOString(),
    confirmed: true,
    fixGenerated: true,
    metadata: { fixConfidence: fix.confidence, caveats: fix.caveats },
  };
  persist(entry);
  return entry;
}

/**
 * Record scan results as a batch of lifecycle entries.
 * Convenience function for recording all findings from a scan.
 */
export function recordScanResults(
  findings: readonly SecurityFinding[],
  persist: PersistFn
): readonly FindingLifecycleEntry[] {
  return findings.map((f) => recordDetected(f, persist));
}

/**
 * Compute a lifecycle summary from a collection of entries.
 */
export function summarizeLifecycle(
  entries: readonly FindingLifecycleEntry[]
): FindingLifecycleSummary {
  const detected = entries.filter((e) => e.stage === 'detected');
  const triaged = entries.filter((e) => e.stage === 'triaged' || e.stage === 'dismissed');
  const confirmed = entries.filter((e) => e.confirmed === true);
  const falsePositives = entries.filter((e) => e.confirmed === false && e.stage === 'dismissed');
  const fixesGenerated = entries.filter((e) => e.stage === 'fix_generated');
  const fixesApplied = entries.filter((e) => e.stage === 'fix_applied');
  const verified = entries.filter((e) => e.stage === 'verified');
  const dismissed = entries.filter((e) => e.stage === 'dismissed');

  const totalTriaged = triaged.length;
  // The empty case, named: no triaged findings means the rate is UNMEASURED,
  // not zero. `0` would report an absent measurement as a perfect score.
  const falsePositiveRate =
    totalTriaged > 0 ? Math.round((falsePositives.length / totalTriaged) * 100) / 100 : null;

  // Mean time to triage: average gap between detected and triaged timestamps
  let meanTimeToTriageMs: number | null = null;
  if (detected.length > 0 && triaged.length > 0) {
    const detectedMap = new Map(detected.map((e) => [e.findingId, e.timestamp]));
    const triageTimes: number[] = [];
    for (const t of triaged) {
      const detectedTs = detectedMap.get(t.findingId);
      if (detectedTs !== undefined) {
        const delta = new Date(t.timestamp).getTime() - new Date(detectedTs).getTime();
        if (delta >= 0) triageTimes.push(delta);
      }
    }
    if (triageTimes.length > 0) {
      meanTimeToTriageMs = triageTimes.reduce((a, b) => a + b, 0) / triageTimes.length;
    }
  }

  return {
    totalDetected: detected.length,
    totalTriaged,
    confirmedCount: confirmed.length,
    falsePositiveCount: falsePositives.length,
    fixesGenerated: fixesGenerated.length,
    fixesApplied: fixesApplied.length,
    verified: verified.length,
    dismissed: dismissed.length,
    falsePositiveRate,
    meanTimeToTriageMs,
  };
}

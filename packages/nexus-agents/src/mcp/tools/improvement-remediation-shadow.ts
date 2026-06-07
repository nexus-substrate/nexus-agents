/**
 * Shadow-mode auto-remediation selector (#3540 increment 2a / #3611).
 *
 * The safe, zero-blast-radius first step of the capability loop's auto-invoke
 * gate. For each remediation task derived from improvement_review signals
 * (#3609), it records the decision the *future* gate WOULD make — "would this
 * signal be auto-routed through the dev-pipeline?" — WITHOUT executing anything.
 * No pipeline is invoked, no PR opened, no issue filed.
 *
 * This accumulates the selection data that #3612 (the quantified shadow→enforce
 * exit criterion) evaluates before any enforcement (#3618) is ever enabled —
 * mirroring the learned-selection shadow tier (#3551) and tune-loop (#3147).
 *
 * The one hard exclusion encoded here is security-category signals (always
 * human-gated, never auto-remediated) — the fail-closed classifier hardening is
 * #3615; the rate-limit / Rule-of-Two / runaway bounds land with their own
 * issues. This module decides nothing operational: it only observes.
 *
 * @module mcp/tools/improvement-remediation-shadow
 */

import { getTimeProvider } from '../../core/index.js';
import type { ImprovementSignal } from './improvement-review.js';
import { remediationTaskId } from './improvement-remediation.js';

/** One shadow decision: would the gate auto-route this remediation? (Logged only.) */
export interface RemediationShadowRecord {
  readonly timestamp: string;
  /** The improvement signal's stable key. */
  readonly signalKey: string;
  /** The remediation task id (from the #3609 bridge). */
  readonly taskId: string;
  readonly category: ImprovementSignal['category'];
  readonly severity: ImprovementSignal['severity'];
  /** Whether the gate WOULD auto-route this to the dev-pipeline (shadow — not executed). */
  readonly wouldAutoRemediate: boolean;
  /** Human-readable explanation of the shadow decision. */
  readonly reason: string;
}

/**
 * The shadow decision for one signal. Security-category signals are always
 * human-gated (never auto-remediated), even in shadow — so the accumulated data
 * reflects the real gate's hard exclusion. Everything else is a shadow
 * would-remediate=true (no execution happens regardless).
 */
export function evaluateRemediationShadow(signal: ImprovementSignal): RemediationShadowRecord {
  const isSecurity = signal.category === 'security';
  return {
    timestamp: new Date(getTimeProvider().now()).toISOString(),
    signalKey: signal.signalKey,
    taskId: remediationTaskId(signal),
    category: signal.category,
    severity: signal.severity,
    wouldAutoRemediate: !isSecurity,
    reason: isSecurity
      ? 'security-category — always human-gated, never auto-remediated'
      : 'shadow: would route to the dev-pipeline for remediation (not executed)',
  };
}

/** Offline-evaluation summary over shadow records (consumed by #3612). */
export interface RemediationShadowSummary {
  readonly total: number;
  /** How many the gate would have auto-routed (non-security). */
  readonly wouldAutoRemediate: number;
  /** How many were held for a human (security-category). */
  readonly humanGated: number;
  readonly byCategory: Readonly<Record<string, number>>;
}

/** A sink that records every shadow decision. Must not throw. */
export interface RemediationShadowSink {
  record(record: RemediationShadowRecord): void;
}

/** A {@link RemediationShadowSink} that also exposes its buffered records. */
export interface IRecordingRemediationShadowSink extends RemediationShadowSink {
  getRecords(): readonly RemediationShadowRecord[];
}

/** Default cap for the in-memory recording sink (matches the other shadow sinks). */
const DEFAULT_MAX_RECORDS = 200;

/** Creates an in-memory shadow sink with a bounded buffer (oldest evicted). */
export function createRemediationShadowSink(
  maxRecords = DEFAULT_MAX_RECORDS
): IRecordingRemediationShadowSink {
  const records: RemediationShadowRecord[] = [];
  return {
    record(record: RemediationShadowRecord): void {
      records.push(record);
      if (records.length > maxRecords) {
        records.splice(0, records.length - maxRecords);
      }
    },
    getRecords(): readonly RemediationShadowRecord[] {
      return records;
    },
  };
}

/** Summarizes shadow records for offline policy evaluation (#3612). */
export function summarizeRemediationShadow(
  records: readonly RemediationShadowRecord[]
): RemediationShadowSummary {
  const byCategory: Record<string, number> = {};
  let wouldAutoRemediate = 0;
  for (const r of records) {
    if (r.wouldAutoRemediate) wouldAutoRemediate++;
    byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
  }
  return {
    total: records.length,
    wouldAutoRemediate,
    humanGated: records.length - wouldAutoRemediate,
    byCategory,
  };
}

let singletonSink: IRecordingRemediationShadowSink | undefined;

/** Process-scoped shadow sink — accumulates would-remediate decisions across runs. */
export function getRemediationShadowSink(): IRecordingRemediationShadowSink {
  singletonSink ??= createRemediationShadowSink();
  return singletonSink;
}

/**
 * Records shadow would-remediate decisions for a set of detected signals — the
 * default-on, zero-blast-radius observability path (#3611). Returns the records
 * it logged. Executes nothing; never throws is the caller's contract (wrap in
 * try/catch at the call site so observability can't break the tool).
 *
 * `tasks` is accepted to assert the bridge produced a task per non-excluded
 * signal, keeping the shadow log aligned with what would actually be routed.
 */
export function recordRemediationShadow(
  signals: readonly ImprovementSignal[],
  sink: RemediationShadowSink = getRemediationShadowSink()
): readonly RemediationShadowRecord[] {
  const records = signals.map(evaluateRemediationShadow);
  for (const record of records) sink.record(record);
  return records;
}

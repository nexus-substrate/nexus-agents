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

import { z } from 'zod';

import { getTimeProvider } from '../../core/index.js';
import type { ImprovementSignal } from './improvement-review.js';
import { remediationTaskId } from './improvement-remediation.js';
import { SECURITY_KEYWORDS } from '../gateway/gateway-keywords.js';
import { JsonlStore } from '../../config/jsonl-store.js';
import { nexusDataPath } from '../../config/nexus-data-dir.js';
import { scanForSecrets, describeSecretFindings } from './diff-secret-scan.js';

/**
 * Fail-closed security classification (#3540 inc.2e / #3615). The hard
 * exclusion "security signals are always human-gated" only holds if
 * classification is correct — a security issue mislabeled by a detector (e.g. as
 * `bug` or `routing`) would otherwise silently bypass the gate. So we treat a
 * signal as security if EITHER its declared category is `security` OR any
 * security keyword appears in its key/title/body. Uncertain → security →
 * human-gated. This is intentionally over-inclusive (false positives only cost a
 * human review; a false negative auto-remediates a security issue unreviewed),
 * and is reused by the future enforce path (#3618) so both decide identically.
 */
export function isSecuritySignal(signal: ImprovementSignal): boolean {
  if (signal.category === 'security') return true;
  const haystack = `${signal.signalKey}\n${signal.title}\n${signal.body}`.toLowerCase();
  // #4518 DELIBERATELY NOT APPLIED HERE. The governance classifier moved to
  // word-boundary matching because over-matching escalated unrelated work to a
  // supermajority bar — an annoyance. This predicate has the opposite risk
  // profile, stated above: a false negative auto-remediates a security issue
  // WITHOUT human review. Broad substring matching is the fail-safe direction
  // for this call site, so it stays, and the divergence is recorded rather
  // than quietly unified for consistency's sake.
  return SECURITY_KEYWORDS.some((kw) => haystack.includes(kw));
}

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
  // Fail-closed (#3615): category==='security' OR any security keyword → gate.
  const isSecurity = isSecuritySignal(signal);
  const gatedByKeyword = isSecurity && signal.category !== 'security';
  return {
    timestamp: new Date(getTimeProvider().now()).toISOString(),
    signalKey: signal.signalKey,
    taskId: remediationTaskId(signal),
    category: signal.category,
    severity: signal.severity,
    wouldAutoRemediate: !isSecurity,
    reason: gatedByKeyword
      ? `security-related (keyword match, declared category '${signal.category}') — fail-closed human-gated`
      : isSecurity
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

// ============================================================================
// Durable audit-mode SOAK sink (#3762) — the enforce-decision-gate evidence.
// ============================================================================

/**
 * Verdict tally from a consensus vote (approved/rejected + the approval %).
 * Mirrors {@link AutoRemediationDeps.vote}'s return shape (#3653).
 */
export const SoakVoteOutcomeSchema = z.object({
  approved: z.boolean(),
  /** Approval percentage at vote time, 0–100 (the consensus tally). */
  approvalPercentage: z.number(),
});
export type SoakVoteOutcome = z.infer<typeof SoakVoteOutcomeSchema>;

/**
 * One durable record of what AUDIT mode decided for a single signal — the
 * cross-run soak evidence the enforce-by-default decision gate consumes (#3540
 * / #3762). Captures the vote/plan outcome with ZERO writes to the repo.
 *
 * Free-text fields (`reason`, `dryRunResult`) are secret-scrubbed before
 * persistence (see {@link scrubSoakRecord}) — persisted evidence must never
 * carry a secret (#3669 / Security condition).
 */
export const RemediationSoakRecordSchema = z.object({
  /** ISO-8601 capture time. */
  timestamp: z.string(),
  /** The improvement signal's stable key. */
  signalKey: z.string(),
  /** The signal's category. */
  category: z.string(),
  /** The classified remediation priority (p0–p4). */
  priority: z.string(),
  /** The signal's declared severity. */
  severity: z.string(),
  /** Vote outcome (approved/rejected + tally), undefined if the signal never reached a vote. */
  voteOutcome: SoakVoteOutcomeSchema.optional(),
  /** Number of plan steps research produced (0 if research/plan failed). */
  planStepCount: z.number(),
  /** p0 dry-run result detail (scrubbed); undefined for non-p0 or when no dry-run ran. */
  dryRunResult: z.string().optional(),
  /** Human-readable verdict reason (scrubbed). */
  reason: z.string(),
});
export type RemediationSoakRecord = z.infer<typeof RemediationSoakRecordSchema>;

/**
 * Retention cap for the durable soak sink. Generous enough to accumulate a real
 * multi-week soak while bounding disk usage (oldest-evicted, #3762 Contrarian
 * condition). Override is intentionally NOT an env var — a fixed bound keeps the
 * evidence file size predictable for the readiness collector (#3764).
 */
export const SOAK_MAX_RECORDS = 10_000;

/** JSONL file under NEXUS_DATA_DIR holding the durable audit-mode soak evidence. */
export function getRemediationSoakFile(): string {
  return nexusDataPath('learning', 'remediation-soak.jsonl');
}

/**
 * Redact any secret in a soak record's free-text fields before it is persisted.
 * On a hit the value is replaced with a value-free marker naming the matched
 * pattern(s) — the record stays useful as evidence without leaking the secret.
 */
export function scrubSoakRecord(record: RemediationSoakRecord): RemediationSoakRecord {
  const scrub = (text: string): string => {
    const result = scanForSecrets(text);
    if (result.clean) return text;
    return `[redacted: ${describeSecretFindings(result)}]`;
  };
  const scrubbed: RemediationSoakRecord = {
    ...record,
    reason: scrub(record.reason),
    ...(record.dryRunResult !== undefined ? { dryRunResult: scrub(record.dryRunResult) } : {}),
  };
  return scrubbed;
}

/** Durable sink for audit-mode soak records. Scrubs + persists; never throws. */
export interface RemediationSoakSink {
  record(record: RemediationSoakRecord): void;
}

/** A {@link RemediationSoakSink} that also exposes its persisted records. */
export interface IRecordingRemediationSoakSink extends RemediationSoakSink {
  getRecords(): readonly RemediationSoakRecord[];
}

/**
 * Create a durable soak sink backed by an append-only JSONL file (reuses the
 * shared {@link JsonlStore} primitive — hydrate-on-construct, append-on-write,
 * Zod-validate each line, oldest-eviction at {@link SOAK_MAX_RECORDS}).
 * Records are secret-scrubbed before they hit disk.
 */
export function createRemediationSoakSink(
  filePath: string = getRemediationSoakFile(),
  maxRecords: number = SOAK_MAX_RECORDS
): IRecordingRemediationSoakSink {
  const store = new JsonlStore<RemediationSoakRecord>({
    filePath,
    schema: RemediationSoakRecordSchema,
    maxRecords,
    component: 'RemediationSoakSink',
  });
  return {
    record(record: RemediationSoakRecord): void {
      store.append(scrubSoakRecord(record));
    },
    getRecords(): readonly RemediationSoakRecord[] {
      return store.all();
    },
  };
}

let soakSingleton: IRecordingRemediationSoakSink | undefined;

/** Process-wide durable soak sink (lazily constructed, hydrates from disk). */
export function getRemediationSoakSink(): IRecordingRemediationSoakSink {
  soakSingleton ??= createRemediationSoakSink();
  return soakSingleton;
}

/** Test helper — drops the cached singleton so a fresh NEXUS_DATA_DIR is picked up. */
export function _resetRemediationSoakSinkForTests(): void {
  soakSingleton = undefined;
}

/**
 * Aggregate summary over persisted soak records — the read surface the #3764
 * readiness collector (and a human) consume. Reports counts by verdict, the
 * approval rate over signals that reached a vote, and per-category/per-priority
 * breakdowns. Pure over its input; does no I/O.
 */
export interface RemediationSoakSummary {
  /** Total soak records. */
  readonly total: number;
  /** How many reached a consensus vote. */
  readonly voted: number;
  /** Approved votes. */
  readonly approved: number;
  /** Rejected votes (voted − approved). */
  readonly rejected: number;
  /** approved / voted, or 0 when nothing was voted. */
  readonly approvalRate: number;
  /** How many p0 dry-runs were captured. */
  readonly dryRunsCaptured: number;
  readonly byCategory: Readonly<Record<string, number>>;
  readonly byPriority: Readonly<Record<string, number>>;
  /** ISO timestamp of the first / last record, if any. */
  readonly firstTimestamp?: string;
  readonly lastTimestamp?: string;
}

/** Mutable accumulator for the soak summary tallies. */
interface SoakTally {
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  voted: number;
  approved: number;
  dryRunsCaptured: number;
}

/** Fold one record into the running tally. */
function tallySoakRecord(t: SoakTally, r: RemediationSoakRecord): void {
  t.byCategory[r.category] = (t.byCategory[r.category] ?? 0) + 1;
  t.byPriority[r.priority] = (t.byPriority[r.priority] ?? 0) + 1;
  if (r.voteOutcome !== undefined) {
    t.voted++;
    if (r.voteOutcome.approved) t.approved++;
  }
  if (r.dryRunResult !== undefined) t.dryRunsCaptured++;
}

/** Summarize soak records for the readiness gate (#3764). */
export function summarizeRemediationSoak(
  records: readonly RemediationSoakRecord[]
): RemediationSoakSummary {
  const t: SoakTally = {
    byCategory: {},
    byPriority: {},
    voted: 0,
    approved: 0,
    dryRunsCaptured: 0,
  };
  for (const r of records) tallySoakRecord(t, r);
  const first = records[0]?.timestamp;
  const last = records[records.length - 1]?.timestamp;
  return {
    total: records.length,
    voted: t.voted,
    approved: t.approved,
    rejected: t.voted - t.approved,
    approvalRate: t.voted === 0 ? 0 : t.approved / t.voted,
    dryRunsCaptured: t.dryRunsCaptured,
    byCategory: t.byCategory,
    byPriority: t.byPriority,
    ...(first !== undefined ? { firstTimestamp: first } : {}),
    ...(last !== undefined ? { lastTimestamp: last } : {}),
  };
}

/**
 * Conservative sanity check on a soak record's `signalKey` (#3932). Real keys
 * are emitted by `improvement_review` and always carry the `category:detail`
 * shape (e.g. `routing:cli-floor:codex:docs`, `bug:failure-concentration:auth`,
 * `tech-debt:fitness-below-floor`): at least one `:` with a non-empty segment on
 * each side. Synthetic test fixtures that leaked into the durable file used bare
 * single tokens (`a`, `b`, `x`) with no colon. Rejecting those keeps obviously-
 * junk records from inflating the readiness `volume` criterion.
 *
 * Intentionally permissive: it requires only the colon-delimited shape, NOT a
 * known category enum — a legitimate future category must never be dropped. Any
 * real key passes; only structureless tokens fail.
 */
export function isPlausibleSoakSignalKey(signalKey: string): boolean {
  const colon = signalKey.indexOf(':');
  if (colon <= 0) return false; // no colon, or empty category before it
  return colon < signalKey.length - 1; // a non-empty detail follows the colon
}

/**
 * Drop obviously-synthetic soak records before they reach the readiness gate
 * (#3932 defense-in-depth). Conservative: only records whose `signalKey` lacks
 * the real `category:detail` shape are discarded — see {@link isPlausibleSoakSignalKey}.
 */
export function filterPlausibleSoakRecords(
  records: readonly RemediationSoakRecord[]
): readonly RemediationSoakRecord[] {
  return records.filter((r) => isPlausibleSoakSignalKey(r.signalKey));
}

/**
 * Read + summarize the durable soak evidence from disk (convenience for #3764).
 * Filters out structurally-implausible records first (#3932) so junk fixtures
 * that may have leaked into the file can't inflate the readiness volume count.
 */
export function readRemediationSoakSummary(
  sink: IRecordingRemediationSoakSink = getRemediationSoakSink()
): RemediationSoakSummary {
  return summarizeRemediationSoak(filterPlausibleSoakRecords(sink.getRecords()));
}

// ============================================================================
// Audit-branch wiring (#3762) — turn per-step audit events into soak records.
// ============================================================================

/** The per-step audit event shape emitted by runAutoRemediation. */
export interface SoakAuditEvent {
  readonly step: string;
  readonly signalKey?: string;
  readonly detail: string;
}

/** Look up a signal's category/priority/severity for the soak record. */
export interface SoakSignalMeta {
  readonly category: string;
  readonly priority: string;
  readonly severity: string;
}

/**
 * An audit collector that turns the discrete per-step audit events
 * (`plan` / `vote` / `dry-run` / `skip` / …) emitted by `runAutoRemediation`
 * into one durable {@link RemediationSoakRecord} per signal, then persists them
 * via the durable sink on {@link flush}. This is the bridge that makes AUDIT
 * mode produce queryable, cross-run evidence instead of only `logger.info`.
 *
 * It accumulates by `signalKey` so a signal's plan-step count, vote tally, and
 * dry-run result land in the SAME record. Records are flushed (persisted) at the
 * end of the run. Never throws — observability must not break remediation.
 */
export interface RemediationSoakCollector {
  /** Feed one audit event (call from the wrapped `audit` callback). */
  observe(event: SoakAuditEvent): void;
  /** Persist all accumulated per-signal records to the durable sink. */
  flush(): readonly RemediationSoakRecord[];
}

/** Mutable per-signal accumulator. */
interface SoakDraft {
  signalKey: string;
  planStepCount: number;
  voteOutcome?: SoakVoteOutcome;
  dryRunResult?: string;
  reason: string;
}

/** Parse `"unanimous: approved (100%)"` → vote outcome. Returns undefined if unparseable. */
function parseVoteDetail(detail: string): SoakVoteOutcome | undefined {
  const approved = /\bapproved\b/.test(detail);
  const rejected = /\brejected\b/.test(detail);
  if (!approved && !rejected) return undefined;
  const pct = /(\d+(?:\.\d+)?)%/.exec(detail);
  return {
    approved,
    approvalPercentage: pct?.[1] !== undefined ? Number(pct[1]) : approved ? 100 : 0,
  };
}

/** Steps whose detail is a terminal verdict reason for the signal. */
const SOAK_TERMINAL_REASON_STEPS: ReadonlySet<string> = new Set([
  'skip',
  'research-failed',
  'protected-path',
]);

/** Fold one audit event into the per-signal draft (mutates `d`). */
function applySoakEvent(d: SoakDraft, event: SoakAuditEvent): void {
  if (event.step === 'plan') {
    const n = /(\d+)\s*steps?/.exec(event.detail);
    d.planStepCount = n?.[1] !== undefined ? Number(n[1]) : 0;
    if (d.reason === '') d.reason = 'plan produced';
    return;
  }
  if (event.step === 'vote') {
    const outcome = parseVoteDetail(event.detail);
    if (outcome !== undefined) d.voteOutcome = outcome;
    d.reason = event.detail;
    return;
  }
  if (event.step === 'dry-run') {
    d.dryRunResult = event.detail;
    return;
  }
  // start / abort / pr-opened are not soak verdict inputs and are ignored.
  if (SOAK_TERMINAL_REASON_STEPS.has(event.step)) d.reason = event.detail;
}

/** Project a finished draft + its signal meta into a durable soak record. */
function draftToSoakRecord(
  d: SoakDraft,
  meta: SoakSignalMeta | undefined,
  timestamp: string
): RemediationSoakRecord {
  return {
    timestamp,
    signalKey: d.signalKey,
    category: meta?.category ?? 'unknown',
    priority: meta?.priority ?? 'unknown',
    severity: meta?.severity ?? 'unknown',
    ...(d.voteOutcome !== undefined ? { voteOutcome: d.voteOutcome } : {}),
    planStepCount: d.planStepCount,
    ...(d.dryRunResult !== undefined ? { dryRunResult: d.dryRunResult } : {}),
    reason: d.reason === '' ? 'no verdict recorded' : d.reason,
  };
}

/**
 * Build a soak collector. `metaFor` resolves a signal's category/priority/severity
 * (the audit events only carry the signalKey + detail). `sink` defaults to the
 * durable singleton; tests inject an isolated one.
 */
export function createRemediationSoakCollector(
  metaFor: (signalKey: string) => SoakSignalMeta | undefined,
  sink: IRecordingRemediationSoakSink = getRemediationSoakSink()
): RemediationSoakCollector {
  const drafts = new Map<string, SoakDraft>();
  const draftFor = (signalKey: string): SoakDraft => {
    let d = drafts.get(signalKey);
    if (d === undefined) {
      d = { signalKey, planStepCount: 0, reason: '' };
      drafts.set(signalKey, d);
    }
    return d;
  };
  return {
    observe(event: SoakAuditEvent): void {
      if (event.signalKey === undefined) return; // run-level (start/abort) — not per-signal.
      applySoakEvent(draftFor(event.signalKey), event);
    },
    flush(): readonly RemediationSoakRecord[] {
      const ts = new Date(getTimeProvider().now()).toISOString();
      const out: RemediationSoakRecord[] = [];
      for (const d of drafts.values()) {
        const record = draftToSoakRecord(d, metaFor(d.signalKey), ts);
        sink.record(record);
        out.push(record);
      }
      drafts.clear();
      return out;
    },
  };
}

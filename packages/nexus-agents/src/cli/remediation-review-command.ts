/**
 * Remediation soundness reviews: human marks, live panel batches, sampled owner
 * checks and final owner sign-off. Readiness reports each source separately.
 * @module cli/remediation-review-command
 */

import { runPanelJudge, runSample } from './remediation-review-panel.js';
import type { CliExitResult, ParsedCliArgs } from '../cli-types.js';
import { cliExit, EXIT_CODES } from '../cli-types.js';
import { getTimeProvider } from '../core/index.js';
import {
  getRemediationSoakSink,
  readRemediationSoakSummary,
  type RemediationSoakRecord,
} from '../mcp/tools/improvement-remediation-shadow.js';
import {
  getRemediationReviewStore,
  currentRemediationJudgments,
  getRemediationReviewSampleStore,
  pendingSampleRefs,
  isOwnerSampleMark,
  pendingSoakSelections,
  readRemediationReviewSummary,
  soakRefOf,
  readRemediationReviewRecords,
  type ReviewRecord,
  type ReviewSample,
} from '../mcp/tools/remediation-review.js';
import {
  assessSoakStaleness,
  buildEnforceReadinessEvidence,
  type SoakStalenessSignal,
} from '../mcp/tools/remediation-readiness-collector.js';
import {
  DEFAULT_ENFORCE_READINESS_CONFIG,
  evaluateEnforceReadiness,
  type EnforceReadinessEvidence,
} from '../mcp/tools/improvement-enforce-readiness.js';

/** Soak records, projected to the minimal ref-able shape. */
function soakSelections(): readonly Pick<RemediationSoakRecord, 'signalKey' | 'timestamp'>[] {
  return getRemediationSoakSink().getRecords();
}

/** `remediation-review list` — print the pending (un-reviewed) selections. */
function runList(format: string): void {
  const reviews = readRemediationReviewRecords();
  const pending = pendingSoakSelections(soakSelections(), reviews);
  if (format === 'json') {
    process.stdout.write(`${JSON.stringify({ pending }, null, 2)}\n`);
    return;
  }
  const lines = [`${String(pending.length)} pending soak selection(s) to review:`];
  for (const p of pending) lines.push(`  ${p.soakRef}  (${p.signalKey})`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

/** Fraction of JUDGED selections assessed unsound (= 1 − soundnessRate); 0 when nothing judged. */
export function harmfulRate(ev: EnforceReadinessEvidence): number {
  return ev.judgedSelections === 0
    ? 0
    : (ev.judgedSelections - ev.judgedSound) / ev.judgedSelections;
}

/**
 * One line naming how the soak store reads (#4279): `UNMEASURED` for an empty
 * store, `ALARM` with every cause for a flatlined/stale one, `fresh` otherwise.
 * Printed in the readiness verdict so a store that stopped accruing is visible.
 */
function formatSoakStore(s: SoakStalenessSignal): string {
  const n = `${String(s.recordCount)} record${s.recordCount === 1 ? '' : 's'}`;
  if (s.status === 'unmeasured') return `Soak store: UNMEASURED — ${n}; ${s.reasons.join('; ')}`;
  const last =
    s.lastTimestamp === undefined
      ? ''
      : `, last ${s.lastTimestamp}${s.idleDays === undefined ? '' : ` (${String(s.idleDays)} day${s.idleDays === 1 ? '' : 's'} ago)`}`;
  if (s.status === 'alarm') return `Soak store: ALARM — ${n}${last}; ${s.reasons.join('; ')}`;
  return `Soak store: fresh — ${n}${last}`;
}

/** Separate counts expose who judged the selections and who checked the panel. */
function formatJudgments(evidence: EnforceReadinessEvidence): string {
  const human = evidence.human ?? { n: 0, disagreements: 0 };
  const panel = evidence.panel ?? { n: 0, disagreements: 0 };
  const sample = evidence.sample ?? { n: 0, disagreements: 0 };
  return `Judgments: human ${String(human.n)} (${String(human.disagreements)} unsound), panel ${String(panel.n)} (${String(panel.disagreements)} unsound), sample ${String(sample.n)} (${String(sample.disagreements)} disagreements)`;
}

/** Render the text-mode readiness report (kept separate to hold `runReadiness` under the line cap). */
function formatReadiness(
  verdict: ReturnType<typeof evaluateEnforceReadiness>,
  evidence: EnforceReadinessEvidence,
  harmful: number,
  soakStore: SoakStalenessSignal
): string {
  const maxPct = Math.round((1 - DEFAULT_ENFORCE_READINESS_CONFIG.minSoundnessRate) * 100);
  const lines = [
    `Enforcement readiness: ${verdict.ready ? 'READY' : 'NOT READY'}`,
    formatSoakStore(soakStore),
    `harmful-rate: ${String(Math.round(harmful * 100))}% of ${String(evidence.judgedSelections)} judged sound-reviews (threshold ≤ ${String(maxPct)}%)`,
    formatJudgments(evidence),
    `Excluded reviews: ${String(evidence.unverifiablePanelRows ?? 0)} unverifiable panel rows; ${String(evidence.supersededPanelRows ?? 0)} SUPERSEDED panel rows; ${String(evidence.evictedReviewRows ?? 0)} rows with evicted soak refs`,
    `${String(evidence.overriddenPanelRejections ?? 0)} panel rejections overridden by human; ${String(evidence.mootOwnerDisagreements ?? 0)} moot owner disagreements on superseded panel refs`,
    'Criteria:',
  ];
  for (const c of verdict.criteria) {
    lines.push(`  [${c.met ? 'PASS' : 'FAIL'}] ${c.name}  —  ${c.detail}`);
  }
  if (verdict.blockers.length > 0) lines.push(`Blockers: ${verdict.blockers.join(', ')}`);
  return lines.join('\n');
}

/**
 * `remediation-review readiness` — read-only enforce-readiness verdict + harmful-rate
 * (#4098) + the soak-store staleness signal (#4279). The signal is informational:
 * it never changes `ready`, but an empty or flatlined store is named in both
 * output modes so a stalled evidence path cannot pass unremarked.
 */
function runReadiness(format: string): void {
  const soak = readRemediationSoakSummary();
  const evidence = buildEnforceReadinessEvidence(soak, readRemediationReviewSummary());
  const verdict = evaluateEnforceReadiness(evidence);
  const harmful = harmfulRate(evidence);
  const soakStore = assessSoakStaleness(soak, getTimeProvider().now());
  if (format === 'json') {
    process.stdout.write(
      `${JSON.stringify({ ready: verdict.ready, harmfulRate: harmful, soakStore, evidence, criteria: verdict.criteria, blockers: verdict.blockers }, null, 2)}\n`
    );
    return;
  }
  process.stdout.write(`${formatReadiness(verdict, evidence, harmful, soakStore)}\n`);
}

/** Resolve the sound verdict from the mutually-exclusive flags. Throws on bad input. */
function resolveSound(options: ParsedCliArgs['options']): boolean {
  const sound = options.sound === true;
  const unsound = options.unsound === true;
  if (sound && unsound) {
    throw new Error('remediation-review mark: pass exactly one of --sound or --unsound, not both');
  }
  if (!sound && !unsound) {
    throw new Error('remediation-review mark: pass one of --sound or --unsound');
  }
  return sound;
}

/** Validate the mark inputs, returning the resolved {soakRef, evaluator, sound}. Throws on bad input. */
function validateMark(args: ParsedCliArgs): {
  soakRef: string;
  evaluator: string;
  sound: boolean;
} {
  const soakRef = args.positionals[2];
  if (soakRef === undefined || soakRef === '') {
    throw new Error('remediation-review mark: a <soakRef> argument is required (see `list`)');
  }
  const evaluator = args.options.evaluator?.trim();
  if (evaluator === undefined || evaluator === '') {
    throw new Error('remediation-review mark: a named --evaluator is required');
  }
  const sound = resolveSound(args.options);
  if (!new Set(soakSelections().map(soakRefOf)).has(soakRef)) {
    throw new Error(`remediation-review mark: unknown soakRef '${soakRef}' (not in the soak)`);
  }
  return { soakRef, evaluator, sound };
}

function validateSampleMark(sampleId: string | undefined, ref: string): ReviewSample | undefined {
  if (sampleId === undefined) return undefined;
  const sample = getRemediationReviewSampleStore()
    .getRecords()
    .find((s) => s.id === sampleId);
  if (sample?.refs.includes(ref) !== true) {
    throw new Error('remediation-review mark: ref is not in the named sample');
  }
  return sample;
}

function markAnnotations(
  owner: string | undefined,
  note: string | undefined
): Pick<ReviewRecord, 'owner' | 'note'> {
  return {
    ...(owner !== undefined && owner !== '' ? { owner } : {}),
    ...(note !== undefined && note !== '' ? { note } : {}),
  };
}

/** `remediation-review mark <soakRef> --evaluator <name> (--sound|--unsound)`. */
function runMark(args: ParsedCliArgs): void {
  const { soakRef, evaluator, sound } = validateMark(args);
  const owner = args.options.owner?.trim();
  const sampleId = args.options.sample;
  const sample = validateSampleMark(sampleId, soakRef);
  const record: ReviewRecord = {
    judgeKind: sample !== undefined ? 'owner-sample' : 'human',
    ...(sampleId !== undefined ? { sampleId } : {}),
    soakRef,
    reviewedAt: new Date(getTimeProvider().now()).toISOString(),
    reviewed: true,
    sound,
    evaluator,
    ...markAnnotations(owner, args.options.note),
    ownerSignedOff: false,
  };
  if (!getRemediationReviewStore().record(record)) throw new Error('Review persistence failed');
  if (args.options.format === 'json') {
    process.stdout.write(`${JSON.stringify({ marked: record }, null, 2)}\n`);
    return;
  }
  process.stdout.write(`marked ${soakRef} as ${sound ? 'SOUND' : 'UNSOUND'} by ${evaluator}\n`);
}

/** Require the recorded owner and complete judgments before attesting an active draw. */
function validateSampleSignOff(
  sample: ReviewSample | undefined,
  records: readonly ReviewRecord[],
  owner: string
): void {
  if (sample === undefined) return;
  if (sample.owner !== owner)
    throw new Error('remediation-review sign-off: --owner must match the recorded sample owner');
  const pending = pendingSampleRefs(sample, records);
  if (pending.length > 0) {
    throw new Error(
      `remediation-review sign-off: sample ${sample.id} has ${String(pending.length)} unjudged refs`
    );
  }
}

/** Only the latest draw is active; previous draws remain as historical evidence. */
function signOffJudgments(
  existing: readonly ReviewRecord[],
  owner: string
): Map<string, ReviewRecord> {
  // Empty panel set uses human sign-off; historical draws are no longer active.
  const hasPanelJudgments = [...currentRemediationJudgments(existing).values()].some(
    (record) => record.judgeKind === 'panel'
  );
  const sample = hasPanelJudgments
    ? getRemediationReviewSampleStore().getRecords().at(-1)
    : undefined;
  validateSampleSignOff(sample, existing, owner);
  const latest = new Map<string, ReviewRecord>();
  for (const r of existing) {
    if (r.judgeKind === 'panel') continue;
    if (r.judgeKind === 'owner-sample' && (sample === undefined || !isOwnerSampleMark(sample, r)))
      continue;
    latest.set(r.soakRef, r);
  }
  if (latest.size === 0) throw new Error('No human judgments to sign off; draw and mark a sample');
  return latest;
}

/**
 * Record owner sign-off after every sampled ref is judged. Only human and
 * owner-sample rows carry owners; panel provenance is preserved unchanged.
 * Copies retain reviewedAt: signing an existing judgment is not re-judgment.
 */
function runSignOff(args: ParsedCliArgs): void {
  const owner = args.options.owner?.trim();
  if (owner === undefined || owner === '') {
    throw new Error('remediation-review sign-off: a named --owner is required');
  }
  const store = getRemediationReviewStore();
  const existing = readRemediationReviewRecords(store);
  if (existing.length === 0) {
    throw new Error('remediation-review sign-off: no reviews to sign off (mark selections first)');
  }
  const latest = signOffJudgments(existing, owner);
  let count = 0;
  for (const r of latest.values()) {
    if (!store.record({ ...r, owner, ownerSignedOff: true }))
      throw new Error('Sign-off persistence failed');
    count++;
  }
  const summary = readRemediationReviewSummary(store);
  if (args.options.format === 'json') {
    process.stdout.write(`${JSON.stringify({ owner, signedOff: count, summary }, null, 2)}\n`);
    return;
  }
  process.stdout.write(
    `owner sign-off recorded by ${owner} across ${String(count)} selection(s)\n`
  );
}

/**
 * Handle `nexus-agents remediation-review <subcommand>`.
 *
 * #3942: RETURNS a {@link CliExitResult}; the dispatcher owns `process.exit`.
 * On the happy path this command never forced an exit (natural exit 0) —
 * SUCCESS (0) is byte-identical. Bad input still throws (an unknown subcommand,
 * or the argument validation in `runMark`/`runSignOff`), propagating to the
 * top-level CLI error handler exactly as before.
 */
export async function handleRemediationReviewCommand(args: ParsedCliArgs): Promise<CliExitResult> {
  const sub = args.subcommand ?? 'list';
  switch (sub) {
    case 'list':
      runList(args.options.format);
      break;
    case 'mark':
      runMark(args);
      break;
    case 'panel-judge':
      await runPanelJudge(args);
      break;
    case 'sample':
      runSample(args);
      break;
    case 'sign-off':
      runSignOff(args);
      break;
    case 'readiness':
      runReadiness(args.options.format);
      break;
    default:
      throw new Error(
        `remediation-review: unknown subcommand '${sub}' (expected list | mark | panel-judge | sample | sign-off | readiness)`
      );
  }
  await Promise.resolve();
  return cliExit(EXIT_CODES.SUCCESS);
}

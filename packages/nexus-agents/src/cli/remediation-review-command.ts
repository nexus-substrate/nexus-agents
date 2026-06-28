/**
 * `nexus-agents remediation-review` — the human soundness-review surface (#3765).
 *
 * The 2nd link in the autonomy enforce-decision-gate evidence chain (#3540 /
 * #3653). The durable soak (#3762) is the set of audit-mode selections to
 * review; a NAMED evaluator marks each reviewed + sound|unsound, and a named
 * owner signs off — producing the `judgedSelections`/`judgedSound`/`evaluator`/
 * `owner` the readiness collector (#3764) feeds to the enforce gate. Named
 * evaluator + owner are inherently human acts, so this is a CLI surface.
 *
 * Subcommands:
 *   list                              List pending (un-reviewed) soak selections.
 *   mark <soakRef> --evaluator <name> (--sound | --unsound) [--note <text>]
 *                                     Record one reviewed verdict by a named evaluator.
 *   sign-off --owner <name>           Record an owner sign-off across reviewed selections.
 *   readiness                         Show the enforce-readiness verdict + per-criterion rates + harmful-rate (read-only).
 *
 * `--format json` emits structured output. Never flips enforcement on itself.
 * An optional LLM-judge pre-pass is deferred to #3773 (advisory only — the
 * named-evaluator criterion needs human confirmation regardless).
 *
 * @module cli/remediation-review-command
 */

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
  pendingSoakSelections,
  readRemediationReviewSummary,
  soakRefOf,
  summarizeRemediationReviews,
  type ReviewRecord,
} from '../mcp/tools/remediation-review.js';
import { buildEnforceReadinessEvidence } from '../mcp/tools/remediation-readiness-collector.js';
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
  const reviews = getRemediationReviewStore().getRecords();
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

/** Render the text-mode readiness report (kept separate to hold `runReadiness` under the line cap). */
function formatReadiness(
  verdict: ReturnType<typeof evaluateEnforceReadiness>,
  evidence: EnforceReadinessEvidence,
  harmful: number
): string {
  const maxPct = Math.round((1 - DEFAULT_ENFORCE_READINESS_CONFIG.minSoundnessRate) * 100);
  const lines = [
    `Enforcement readiness: ${verdict.ready ? 'READY' : 'NOT READY'}`,
    `harmful-rate: ${String(Math.round(harmful * 100))}% of ${String(evidence.judgedSelections)} judged sound-reviews (threshold ≤ ${String(maxPct)}%)`,
    'Criteria:',
  ];
  for (const c of verdict.criteria) {
    lines.push(`  [${c.met ? 'PASS' : 'FAIL'}] ${c.name}  —  ${c.detail}`);
  }
  if (verdict.blockers.length > 0) lines.push(`Blockers: ${verdict.blockers.join(', ')}`);
  return lines.join('\n');
}

/** `remediation-review readiness` — read-only enforce-readiness verdict + harmful-rate (#4098). */
function runReadiness(format: string): void {
  const evidence = buildEnforceReadinessEvidence(
    readRemediationSoakSummary(),
    readRemediationReviewSummary()
  );
  const verdict = evaluateEnforceReadiness(evidence);
  const harmful = harmfulRate(evidence);
  if (format === 'json') {
    process.stdout.write(
      `${JSON.stringify({ ready: verdict.ready, harmfulRate: harmful, evidence, criteria: verdict.criteria, blockers: verdict.blockers }, null, 2)}\n`
    );
    return;
  }
  process.stdout.write(`${formatReadiness(verdict, evidence, harmful)}\n`);
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

/** `remediation-review mark <soakRef> --evaluator <name> (--sound|--unsound)`. */
function runMark(args: ParsedCliArgs): void {
  const { soakRef, evaluator, sound } = validateMark(args);
  const owner = args.options.owner?.trim();
  const record: ReviewRecord = {
    soakRef,
    reviewedAt: new Date(getTimeProvider().now()).toISOString(),
    reviewed: true,
    sound,
    evaluator,
    ...(owner !== undefined && owner !== '' ? { owner } : {}),
    ...(args.options.note !== undefined && args.options.note !== ''
      ? { note: args.options.note }
      : {}),
  };
  getRemediationReviewStore().record(record);
  if (args.options.format === 'json') {
    process.stdout.write(`${JSON.stringify({ marked: record }, null, 2)}\n`);
    return;
  }
  process.stdout.write(`marked ${soakRef} as ${sound ? 'SOUND' : 'UNSOUND'} by ${evaluator}\n`);
}

/**
 * `remediation-review sign-off --owner <name>` — record an owner sign-off. Re-affirms
 * each already-reviewed selection's latest verdict with the owner attached, so the
 * review summary's `owner` reflects the named sign-off (summary is last-wins per ref).
 */
function runSignOff(args: ParsedCliArgs): void {
  const owner = args.options.owner?.trim();
  if (owner === undefined || owner === '') {
    throw new Error('remediation-review sign-off: a named --owner is required');
  }
  const store = getRemediationReviewStore();
  const existing = store.getRecords();
  if (existing.length === 0) {
    throw new Error('remediation-review sign-off: no reviews to sign off (mark selections first)');
  }
  // Latest verdict per selection — re-affirm with the owner attached.
  const latest = new Map<string, ReviewRecord>();
  for (const r of existing) latest.set(r.soakRef, r);
  const reviewedAt = new Date(getTimeProvider().now()).toISOString();
  let count = 0;
  for (const r of latest.values()) {
    store.record({ ...r, reviewedAt, owner });
    count++;
  }
  const summary = summarizeRemediationReviews(store.getRecords());
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
    case 'sign-off':
      runSignOff(args);
      break;
    case 'readiness':
      runReadiness(args.options.format);
      break;
    default:
      throw new Error(
        `remediation-review: unknown subcommand '${sub}' (expected list | mark | sign-off | readiness)`
      );
  }
  await Promise.resolve();
  return cliExit(EXIT_CODES.SUCCESS);
}

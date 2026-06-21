/**
 * Authentic vote-record ratification resolution (#3927 item 1).
 *
 * Extracted from `check-authority-tier-drift.ts` so the gate file stays within
 * its size/complexity budget and the "resolve a ratificationVoteRef against the
 * authentic ledger" concern is testable in isolation.
 *
 * RESOLUTION SOURCE. The committed, tamper-evident vote-record set
 * (`governance/vote-records.jsonl`) is the resolution source — REPLACING the
 * former hand-committable `governance/ratification-votes.yaml`. Each record is
 * self-hashed at vote time (`audit/vote-record-store.ts`); the whole set is
 * verified with {@link verifyVoteRecordSet} before any ref resolves, so a
 * tampered, forged, or omitted record fails the gate rather than passing.
 *
 * RESIDUAL TRUST (tamper-EVIDENT, not tamper-PROOF — #3927 item 4 deferred). The
 * self-hash detects POST-HOC edits, but a record is authored in the SAME PR that
 * performs the promotion, so nothing here cryptographically proves the recorded
 * decision reflects a real agent panel rather than one the author typed. The
 * remaining trust anchor is CODEOWNERS review + branch protection on
 * `governance/`. Binding each record to a signing key (CI/OIDC, cosign/gitsign,
 * in-toto/SLSA) is tracked as #3927 item 4.
 *
 * @module scripts/vote-record-ratification
 * (Source: ADR-0017, Issue #3897, #3926, #3927)
 */

import { parseVoteRecordsText } from '../packages/nexus-agents/src/audit/vote-record-store.js';
import {
  verifyVoteRecordSet,
  type VoteRecord,
} from '../packages/nexus-agents/src/audit/vote-record.js';
import type { TierTransitionPayload } from '../packages/nexus-agents/src/audit/audit-types.js';

import type { TierDriftFinding } from './check-authority-tier-drift.js';

/**
 * A resolver: ref → the authentic {@link VoteRecord} it names (or undefined when
 * the ref resolves to nothing). The gate reads `decision`, `strategy`, and the
 * subject-binding `ratifies` field off the resolved record.
 */
export type RatificationResolver = (ref: string) => VoteRecord | undefined;

/** The product of {@link buildVoteRecordRatificationResolver}. */
export interface VoteRecordResolution {
  readonly resolver: RatificationResolver;
  /** Subjects with conflicting-decision records (an ambiguous promotion basis). */
  readonly conflictSubjects: ReadonlySet<string>;
  /** Fail-closed findings (a malformed/tampered/duplicate ledger). */
  readonly findings: TierDriftFinding[];
}

/** A fail-closed resolution: resolve nothing, with one ledger-invalid finding. */
function ledgerInvalid(message: string): VoteRecordResolution {
  return {
    resolver: () => undefined,
    conflictSubjects: new Set<string>(),
    findings: [{ code: 'vote-records-ledger-invalid', message }],
  };
}

/**
 * Build a {@link RatificationResolver} from the committed vote-record JSONL text
 * (or undefined when the file is absent). Fail-closed at every step: a parse
 * error, a failed {@link verifyVoteRecordSet} (hash_mismatch / missing_hash /
 * sequence_gap), or a duplicate record id all yield a `vote-records-ledger-invalid`
 * finding AND a resolver that resolves NOTHING — so every promotion ref then fails
 * unresolved rather than silently passing.
 *
 * AMBIGUITY (#3927, Contrarian condition). A union-merge of concurrent branches
 * can legitimately leave MORE THAN ONE record ratifying the same subject. If two
 * such records disagree on `decision`, a promoter must not be able to cherry-pick
 * the approving one by ref. Such subjects are returned in `conflictSubjects`; the
 * gate fails any promotion of a conflicted subject closed.
 */
export function buildVoteRecordRatificationResolver(
  jsonlText: string | undefined
): VoteRecordResolution {
  if (jsonlText === undefined) {
    return { resolver: () => undefined, conflictSubjects: new Set<string>(), findings: [] };
  }

  const { records, invalidLines } = parseVoteRecordsText(jsonlText);
  if (invalidLines.length > 0) {
    return ledgerInvalid(
      `governance/vote-records.jsonl has ${String(invalidLines.length)} unparseable/invalid line(s) at ${invalidLines.join(', ')}. A malformed ledger fails closed — every promotion is rejected until it is repaired.`
    );
  }

  const verification = verifyVoteRecordSet(records);
  if (!verification.ok) {
    return ledgerInvalid(
      `governance/vote-records.jsonl failed tamper-evidence verification (${verification.reason}) at record '${verification.recordId}': ${verification.detail}. The ledger fails closed until repaired.`
    );
  }

  // Duplicate ids make ref-resolution ambiguous — fail closed (a forged record
  // could shadow a legitimate one under the same ref).
  const byId = new Map<string, VoteRecord>();
  const duplicateIds = new Set<string>();
  for (const record of records) {
    if (byId.has(record.id)) duplicateIds.add(record.id);
    byId.set(record.id, record);
  }
  if (duplicateIds.size > 0) {
    return ledgerInvalid(
      `governance/vote-records.jsonl has duplicate record id(s) ${[...duplicateIds].map((id) => `'${id}'`).join(', ')}, which makes ratificationVoteRef resolution ambiguous. The ledger fails closed until ids are unique.`
    );
  }

  return {
    resolver: (ref) => byId.get(ref),
    conflictSubjects: conflictingRatifiedSubjects(records),
    findings: [],
  };
}

/**
 * The set of `ratifies` subjects carried by records that DISAGREE on `decision`
 * (e.g. an `approved` and a `rejected` record both ratifying the same subject — a
 * benign union-merge fork at the set level, but an ambiguous promotion basis). A
 * subject with multiple records that AGREE on decision is not a conflict (the ref
 * disambiguates which record backs the transition). Records without `ratifies`
 * are ordinary votes and ignored here.
 */
function conflictingRatifiedSubjects(records: readonly VoteRecord[]): Set<string> {
  const decisionsBySubject = new Map<string, Set<string>>();
  for (const record of records) {
    if (record.ratifies === undefined) continue;
    const decisions = decisionsBySubject.get(record.ratifies) ?? new Set<string>();
    decisions.add(record.decision);
    decisionsBySubject.set(record.ratifies, decisions);
  }
  const conflicts = new Set<string>();
  for (const [subject, decisions] of decisionsBySubject) {
    if (decisions.size > 1) conflicts.add(subject);
  }
  return conflicts;
}

/**
 * The ratification verdict for a SINGLE promotion transition (or null when it
 * ratifies cleanly). Fail-closed precedence: ambiguous subject → missing ref →
 * unresolved ref → not-approved (wrong decision/strategy/subject). Demotions are
 * the caller's concern (they need no vote); this is only called for promotions.
 */
export function ratificationFindingFor(
  t: TierTransitionPayload,
  resolve: RatificationResolver,
  conflictSubjects: ReadonlySet<string>
): TierDriftFinding | null {
  const where = `'${t.subject}' (${t.fromTier} → ${t.toTier}, evidenceRef='${t.evidenceRef}')`;

  // Fail closed on an ambiguous ledger state BEFORE looking at the ref: if the
  // subject carries conflicting decisions, no ref may select the approving fork.
  if (conflictSubjects.has(t.subject)) {
    return {
      code: 'promotion-ratification-ambiguous',
      message: `tier-transition promotion of ${where} cannot be ratified: governance/vote-records.jsonl has records with CONFLICTING decisions for subject '${t.subject}'. A promoter must not cherry-pick the approving fork — resolve the conflicting ratification records before promoting.`,
    };
  }

  const ref = t.ratificationVoteRef;
  if (ref === undefined || ref.trim() === '') {
    return {
      code: 'promotion-without-ratification',
      message: `tier-transition promotion of ${where} has NO linked ratificationVoteRef. Promotions MUST be ratification-linked (ADR-0017 §"Promotions are ratification-linked") — record the consensus_vote ref on the transition audit event.`,
    };
  }

  const record = resolve(ref.trim());
  if (record === undefined) {
    return {
      code: 'promotion-ratification-unresolved',
      message: `tier-transition promotion of ${where} carries ratificationVoteRef='${ref}' that does NOT resolve to any authentic record in governance/vote-records.jsonl. A non-empty ref is not enough — the vote must be a recorded, approved higher_order consensus_vote whose 'ratifies' matches this subject.`,
    };
  }

  const reasons: string[] = [];
  if (record.decision !== 'approved')
    reasons.push(`decision is '${record.decision}', not 'approved'`);
  if (record.strategy !== 'higher_order') {
    reasons.push(
      `strategy is '${record.strategy}', not 'higher_order' (a promotion is governance-of-the-governor)`
    );
  }
  if (record.ratifies !== t.subject) {
    reasons.push(
      `record ratifies '${record.ratifies ?? '(no ratifies field)'}', not the transition subject '${t.subject}'`
    );
  }
  if (reasons.length > 0) {
    return {
      code: 'promotion-ratification-not-approved',
      message: `tier-transition promotion of ${where} resolves ratificationVoteRef='${ref}' but that record does not ratify the promotion: ${reasons.join('; ')}.`,
    };
  }
  return null;
}

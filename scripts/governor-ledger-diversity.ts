/**
 * Governor ratification model-family floor (#6601, option E).
 * Diversity is evaluated from hash-covered voters, never stored on records.
 * A separate qualifying vote record, appended with --as-owner and verified
 * as an owner signature, overrides one family only at the exact same PR/head.
 * All ordinary bound-record checks still apply to both records. A solitary
 * owner-signed panel cannot override itself; zero known families is unmeasured.
 */
import type { VoteRecord } from '../packages/nexus-agents/src/audit/vote-record.js';
import { vendorFamilyOf } from '../packages/nexus-agents/src/cli/voter-family-dealing.js';
import type { RecordSignatureReport } from './governor-ledger-signature.js';

/** Already-landed single-family panels at activation; closed hashes, never sequences/dates. */
const GRANDFATHERED_DIVERSITY_HASHES: ReadonlySet<string> = new Set([
  // PRs #6559, #6621, #6698 respectively; changing their content voids this exemption.
  'f36a9022c3b0bbe3eff7a865657ef0305a0efa5871de4102d131fd489adec86f',
  'ae3203848ce0a5cd96d563afc403771b380b7cd4183debd50ad5212eeb8bebd7',
  '059c6f741303595f45d4e7e2afa586408f66444130d3db328b74b35339c6a72c',
]);

export interface ModelDiversityFailure {
  readonly kind: 'unmeasured-model-diversity' | 'insufficient-model-diversity';
  readonly record: VoteRecord;
  readonly families: readonly string[];
}

/** Only verifiable approve/reject seats count; no known families means unmeasured. */
function familiesOf(record: VoteRecord): string[] {
  const families = new Set<string>();
  for (const voter of record.voters) {
    // Errored seats are omitted by the record builder; abstentions attest to no verdict.
    if (voter.decision !== 'approve' && voter.decision !== 'reject') continue;
    if (voter.unverifiable === true || voter.model === undefined) continue;
    const family = vendorFamilyOf(voter.model);
    if (family !== 'unknown') families.add(family);
  }
  return [...families].sort();
}

function sameBinding(a: VoteRecord, b: VoteRecord): boolean {
  return (
    a.ratifiesPr !== undefined &&
    a.ratifiesPr.pr === b.ratifiesPr?.pr &&
    a.ratifiesPr.headSha === b.ratifiesPr.headSha
  );
}

/** A verified owner peer; the owner auxiliary itself needs a distinct measured panel. */
function ownerOverride(
  record: VoteRecord,
  bound: readonly VoteRecord[],
  signatures: readonly RecordSignatureReport[] | undefined
): VoteRecord | undefined {
  return bound.find((candidate) => {
    if (!sameBinding(candidate, record)) return false;
    const verdict = signatures?.find((s) => s.recordId === candidate.id)?.verdict;
    if (verdict?.code !== 'signed' || verdict.signerKind !== 'owner') return false;
    if (candidate.id !== record.id) return true;
    return bound.some(
      (peer) => peer.id !== record.id && sameBinding(peer, record) && familiesOf(peer).length > 0
    );
  });
}

/** Evaluation notices travel on the verdict, not the ledger. Empty bound sets authorize nothing. */
export function modelDiversityEvidence(
  bound: readonly VoteRecord[],
  signatures: readonly RecordSignatureReport[] | undefined
): { failures: ModelDiversityFailure[]; diversityNotices: string[] } {
  const failures: ModelDiversityFailure[] = [];
  const notices = new Set<string>();
  for (const record of bound) {
    if (GRANDFATHERED_DIVERSITY_HASHES.has(record.hash)) {
      notices.add(
        `model diversity: single-family record '${record.id}' grandfathered by exact pre-rule hash`
      );
      continue;
    }
    // No committed ratification predates per-voter models (1.8). Missing
    // models on any schema are unmeasured: an author-typed version cannot
    // exempt a newly signed record by claiming it is old.
    const families = familiesOf(record);
    // Load-bearing family mapping: src/config/model-identity.ts VENDOR_PATTERNS
    // via cli/voter-family-dealing.ts, both outside the governor set.
    // voters[].model is the adapter's configured model; gateway substitution
    // is tracked in #6951. Unknown vendors add no family (fail closed).
    // Owner override escapes a measured single-family panel, never zero families.
    if (families.length >= 2) continue;
    if (families.length === 0) {
      failures.push({ kind: 'unmeasured-model-diversity', record, families });
      continue;
    }
    const override = ownerOverride(record, bound, signatures);
    if (override === undefined) {
      failures.push({ kind: 'insufficient-model-diversity', record, families });
    } else {
      notices.add(
        `ratified single-family (${families.join(', ')}) under owner override ${override.id} ` +
          `bound to PR #${String(override.ratifiesPr?.pr)} headSha ${String(override.ratifiesPr?.headSha)} ` +
          '(exact binding; head does not cover head^ or a different rebased record sha)'
      );
    }
  }
  return { failures, diversityNotices: [...notices] };
}

/** Refusal text names the measured families and both recovery paths. */
export function formatModelDiversityFailure(evidence: ModelDiversityFailure): string {
  const status = evidence.kind === 'unmeasured-model-diversity' ? 'unmeasured' : 'insufficient';
  const families = evidence.families.length === 0 ? 'none' : evidence.families.join(', ');
  return (
    `record '${evidence.record.id}' has ${status} model diversity (families found: ${families}) ` +
    '— governor ratification requires at least 2 model families from verifiable approve/reject votes; ' +
    'abstentions and missing/unknown models do not count. ' +
    'Recover: push a new head and re-run the panel, or add an owner-signed override bound to this head ' +
    `(PR #${String(evidence.record.ratifiesPr?.pr)} headSha ${String(evidence.record.ratifiesPr?.headSha)}) ` +
    'by appending a separate qualifying record with --as-owner and the owner signing key. ' +
    'The owner override requires exact PR/headSha binding; head does not cover head^ or a different rebased record sha ' +
    '(single-family only; unmeasured diversity cannot be overridden)'
  );
}

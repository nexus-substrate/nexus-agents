#!/usr/bin/env npx tsx
/**
 * Authority-tier declaration gate (#3841, Epic D / ADR-0017).
 *
 * The CI half of the authority-ladder enforcement layer. Where the router refusal
 * (authority-tier-guard.ts) is the RUNTIME machine consumer the ratification panel
 * required, THIS is the DECLARATION-TIME one: it validates the `authorityTier`
 * field on every registered strategy manifest against ADR-0017's rules, so a tier
 * cannot be declared dishonestly.
 *
 * The gate fails when ANY of:
 *   (a) a registered manifest has NO declared `authorityTier` (the TOOL_CLASS-or-
 *       CI-fails pattern — an undeclared loop cannot ship). ADR-0017 makes the
 *       field required at enforcement time; this is that enforcement.
 *   (b) a manifest is declared `enforce` WITHOUT a matching promotion-evidence
 *       record in the evidence ledger that meets the ADR-0017 advisory→enforce
 *       floor (evalN ≥ 100, soak ≥ P30D, precision ≥ 0.90, recall ≥ 0.80) AND
 *       carries a ratification vote. `enforce` is "never a default" (ADR-0017) —
 *       it is earned against evidence + ratification, so an `enforce` declaration
 *       with no evidence is a default flip and is rejected.
 *   (c) the evidence ledger (if present) no longer validates against the
 *       PromotionEvidenceLedgerSchema (#3834/#3841 Zod schema).
 *
 * Wired into `inject-governance.ts check` (the `governance:check` gate) as a
 * sibling to the #3837 manifest drift-gate, and exposed standalone as
 * `pnpm authority-tier:check`.
 *
 * Tier-transition ratification gate (#3842, hardened by #3894): in addition to the
 * declaration + evidence-floor checks, this gate also reads the hash-chained
 * tier-transition AUDIT EVENTS (Epic D / ADR-0017 §"Transition Rules") and FAILS a
 * PROMOTION transition event whose `ratificationVoteRef` does not RESOLVE to a
 * recorded, approved `higher_order` ratification vote. #3842 only checked the ref
 * was non-empty (cosmetic — a bogus `ratificationVoteRef:'x'` passed); #3894 makes
 * the link genuine by resolving the ref against a committed ratification ledger
 * (`governance/ratification-votes.yaml`, see {@link RatificationVoteSchema}) and
 * failing `promotion-ratification-unresolved` / `promotion-ratification-not-approved`.
 * Promotions must be ratification-linked (ADR-0017); demotions are automatic and
 * need no vote. The transition log lives at
 * `governance/authority-tier-transitions.jsonl` (optional — empty when no
 * transition has occurred); each line is a persisted `AuditEvent`. The pure
 * analysis ({@link analyzeTierTransitionEvents}) is unit-tested in isolation.
 *
 * @module scripts/check-authority-tier-drift
 * (Source: ADR-0017, Issue #3839, #3841, #3842, #3894)
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ROOT } from './script-paths.js';
import {
  PromotionEvidenceLedgerSchema,
  type AuthorityTier,
  type PromotionEvidence,
} from '../packages/nexus-agents/src/orchestration/strategy-manifest.js';
import { STRATEGY_MANIFEST_REGISTRY } from '../packages/nexus-agents/src/orchestration/strategy-manifest-registry.js';
import { extractTierTransition } from '../packages/nexus-agents/src/audit/audit-logger.js';
import {
  AuditEventSchema,
  RatificationVoteLedgerSchema,
  type RatificationVote,
  type TierTransitionPayload,
} from '../packages/nexus-agents/src/audit/audit-types.js';

const EVIDENCE_LEDGER = join(ROOT, 'governance/authority-tier-evidence.yaml');
const TRANSITION_LOG = join(ROOT, 'governance/authority-tier-transitions.jsonl');
const RATIFICATION_LEDGER = join(ROOT, 'governance/ratification-votes.yaml');

/**
 * The ADR-0017 advisory→enforce promotion floor. The minimum a gate enforces; a
 * loop's own promotion-criteria doc (#3844) may set stricter thresholds, never
 * looser. Mirrors ADR-0017 §"Per-tier promotion floors".
 */
export const ENFORCE_FLOOR = Object.freeze({
  evalN: 100,
  /** ISO-8601 soak duration; compared by parsed day-count. */
  soakDays: 30,
  precision: 0.9,
  recall: 0.8,
});

/** A single tier-declaration finding (one line of CI output). */
export interface TierDriftFinding {
  readonly code:
    | 'tier-undeclared'
    | 'enforce-without-evidence'
    | 'enforce-evidence-below-floor'
    | 'evidence-ledger-invalid'
    | 'promotion-without-ratification'
    | 'promotion-ratification-unresolved'
    | 'promotion-ratification-not-approved'
    | 'ratification-ledger-invalid'
    | 'transition-log-invalid';
  readonly message: string;
}

// ============================================================================
// Ratification-vote ledger (#3894) — the resolution source of truth
// ============================================================================

/**
 * A resolver: ref → recorded ratification vote (or undefined when unresolved).
 *
 * The committed ratification-vote ledger (`governance/ratification-votes.yaml`,
 * schema {@link RatificationVoteLedgerSchema} in `src/audit/audit-types.ts`) is the
 * resolution source. #3894 item 1: the promotion gate previously failed a
 * `promotion` only when its `ratificationVoteRef` was *empty* — a bogus
 * `ratificationVoteRef:'x'` passed, so the "ratification-LINKED" guarantee was
 * only as strong as a non-empty string. Resolving the ref against this ledger
 * makes the link genuine.
 *
 * RESOLUTION SOURCE & RESIDUAL GAP. Live `consensus_vote` results are persisted
 * only to per-developer home-dir stores (`~/.nexus-agents/voting/correlations.jsonl`,
 * `~/.nexus-agents/learning/outcomes.jsonl`) that a CI gate — running with no live
 * server and no developer home dir — cannot read. There is no other committed,
 * queryable source of truth for "did ratification vote X happen and pass". So the
 * honest mechanism is this committed ledger: a ratification vote must be recorded
 * HERE (a higher_order consensus_vote whose decision is `approved`) for a
 * promotion's ref to resolve. The gate verifies STRUCTURAL PRESENCE of an
 * approved, higher_order vote in a committed record — it does not (and cannot
 * from CI) re-execute the vote. Tampering with the ledger is itself a reviewable
 * governance change.
 */
export type RatificationResolver = (ref: string) => RatificationVote | undefined;

/** Re-exported for tests/callers that build resolvers. */
export type { RatificationVote };

/**
 * Build a {@link RatificationResolver} from the ledger YAML text (or undefined
 * when the file is absent). Returns the resolver plus a single
 * `ratification-ledger-invalid` finding when the ledger fails schema validation —
 * in which case the resolver resolves NOTHING (fail-closed: every promotion ref
 * is then unresolved and FAILS, rather than silently passing).
 */
export function buildRatificationResolver(ledgerYaml: string | undefined): {
  readonly resolver: RatificationResolver;
  readonly findings: TierDriftFinding[];
} {
  if (ledgerYaml === undefined) {
    return { resolver: () => undefined, findings: [] };
  }
  const parsed = RatificationVoteLedgerSchema.safeParse(parseYaml(ledgerYaml));
  if (!parsed.success) {
    return {
      resolver: () => undefined,
      findings: [
        {
          code: 'ratification-ledger-invalid',
          message: `governance/ratification-votes.yaml failed schema validation: ${parsed.error.issues
            .map((i) => i.message)
            .join('; ')}`,
        },
      ],
    };
  }
  const byId = new Map(parsed.data.votes.map((v) => [v.id, v]));
  return { resolver: (ref) => byId.get(ref), findings: [] };
}

/**
 * Parse the day-count of a simple ISO-8601 duration for the soak floor compare.
 * Supports the day/week forms the floors use (`P30D`, `P4W`); returns 0 for a
 * form it cannot read so an unparseable soak fails the floor fail-closed.
 */
export function soakDays(iso: string): number {
  const weeks = /P(\d+)W/.exec(iso);
  if (weeks?.[1] !== undefined) return Number(weeks[1]) * 7;
  const days = /P(?:\d+Y)?(?:\d+M)?(\d+)D/.exec(iso);
  if (days?.[1] !== undefined) return Number(days[1]);
  return 0;
}

interface DriftInputs {
  /** The declared tier of each registered manifest, keyed by manifest id. */
  readonly declaredTiers: ReadonlyMap<string, AuthorityTier | undefined>;
  /** Raw text of the evidence ledger, or undefined when the file is absent. */
  readonly evidenceYaml: string | undefined;
}

/**
 * Pure tier-declaration analysis (no disk/process I/O) so it is unit-testable
 * with injected — possibly mutated — inputs. Returns the findings for (a) an
 * undeclared tier, (b) an `enforce` declaration without a floor-meeting evidence
 * record, and (c) an invalid evidence ledger.
 */
export function analyzeTierDeclarations(inputs: DriftInputs): TierDriftFinding[] {
  const findings: TierDriftFinding[] = [];

  // (c) The evidence ledger, if present, must validate. A parse failure is a
  // single finding (we cannot trust any record), and the enforce checks below
  // then see an empty ledger ⇒ any `enforce` declaration fails (b), fail-closed.
  let evidenceById = new Map<string, PromotionEvidence>();
  if (inputs.evidenceYaml !== undefined) {
    const parsed = PromotionEvidenceLedgerSchema.safeParse(parseYaml(inputs.evidenceYaml));
    if (!parsed.success) {
      findings.push({
        code: 'evidence-ledger-invalid',
        message: `governance/authority-tier-evidence.yaml failed schema validation: ${parsed.error.issues
          .map((i) => i.message)
          .join('; ')}`,
      });
    } else {
      evidenceById = new Map(parsed.data.evidence.map((e) => [e.loopId, e]));
    }
  }

  for (const [id, tier] of inputs.declaredTiers) {
    // (a) Every registered manifest MUST declare a tier.
    if (tier === undefined) {
      findings.push({
        code: 'tier-undeclared',
        message: `manifest '${id}' has no authorityTier — declare one (ADR-0017 makes it required at enforcement time).`,
      });
      continue;
    }

    // (b) `enforce` is never a default: it requires a floor-meeting evidence
    // record + ratification (ADR-0017 §"enforce", §"Per-tier promotion floors").
    if (tier === 'enforce') {
      const evidence = evidenceById.get(id);
      if (evidence === undefined) {
        findings.push({
          code: 'enforce-without-evidence',
          message: `manifest '${id}' is declared authorityTier='enforce' but has NO promotion-evidence record in governance/authority-tier-evidence.yaml. 'enforce' is never a default (ADR-0017) — record evidence + ratification or demote.`,
        });
        continue;
      }
      const shortfalls = enforceFloorShortfalls(evidence);
      if (shortfalls.length > 0) {
        findings.push({
          code: 'enforce-evidence-below-floor',
          message: `manifest '${id}' is declared 'enforce' but its evidence is below the ADR-0017 advisory→enforce floor: ${shortfalls.join('; ')}.`,
        });
      }
    }
  }

  return findings;
}

/**
 * The ratification gate (#3842, hardened by #3894). Pure analysis (no disk/process
 * I/O) over the recovered tier-transition payloads so it is unit-testable with
 * fixtures both ways. ADR-0017 §"Promotions are ratification-linked": a `promotion`
 * transition is valid only if it carries a linked ratification vote that genuinely
 * happened and PASSED; a `demotion` is automatic and needs none.
 *
 * #3894 hardens the link from non-emptiness to RESOLVABILITY. A promotion FAILS when:
 *   - `promotion-without-ratification` — `ratificationVoteRef` is absent/empty
 *     (the #3842 cosmetic check; kept as the first gate).
 *   - `promotion-ratification-unresolved` — the ref does NOT resolve to any
 *     recorded vote in the committed ratification ledger (a bogus
 *     `ratificationVoteRef:'x'` no longer passes).
 *   - `promotion-ratification-not-approved` — the ref resolves, but the recorded
 *     vote's decision is not `approved`, it was not a `higher_order` vote (a
 *     promotion is governance-of-the-governor), or its `subject` does not match
 *     the transition subject.
 *
 * @param transitions - tier-transition payloads recovered from the chained audit log
 * @param resolve - resolves a `ratificationVoteRef` to its recorded vote (see
 *   {@link buildRatificationResolver}); a resolver that resolves nothing makes
 *   every non-empty ref `promotion-ratification-unresolved` (fail-closed).
 * @returns one finding per offending promotion
 */
export function analyzeTierTransitionEvents(
  transitions: readonly TierTransitionPayload[],
  resolve: RatificationResolver
): TierDriftFinding[] {
  const findings: TierDriftFinding[] = [];
  for (const t of transitions) {
    if (t.kind !== 'promotion') continue; // demotions are automatic — no vote required
    const ref = t.ratificationVoteRef;
    const where = `'${t.subject}' (${t.fromTier} → ${t.toTier}, evidenceRef='${t.evidenceRef}')`;

    if (ref === undefined || ref.trim() === '') {
      findings.push({
        code: 'promotion-without-ratification',
        message: `tier-transition promotion of ${where} has NO linked ratificationVoteRef. Promotions MUST be ratification-linked (ADR-0017 §"Promotions are ratification-linked") — record the consensus_vote ref on the transition audit event.`,
      });
      continue;
    }

    const vote = resolve(ref.trim());
    if (vote === undefined) {
      findings.push({
        code: 'promotion-ratification-unresolved',
        message: `tier-transition promotion of ${where} carries ratificationVoteRef='${ref}' that does NOT resolve to any recorded vote in governance/ratification-votes.yaml. A non-empty ref is not enough (#3894) — the vote must be a recorded, approved higher_order consensus_vote.`,
      });
      continue;
    }

    const reasons: string[] = [];
    if (vote.decision !== 'approved')
      reasons.push(`decision is '${vote.decision}', not 'approved'`);
    if (vote.strategy !== 'higher_order') {
      reasons.push(
        `strategy is '${vote.strategy}', not 'higher_order' (a promotion is governance-of-the-governor)`
      );
    }
    if (vote.subject !== t.subject) {
      reasons.push(
        `vote subject '${vote.subject}' does not match the transition subject '${t.subject}'`
      );
    }
    if (reasons.length > 0) {
      findings.push({
        code: 'promotion-ratification-not-approved',
        message: `tier-transition promotion of ${where} resolves ratificationVoteRef='${ref}' but that vote does not ratify the promotion: ${reasons.join('; ')}.`,
      });
    }
  }
  return findings;
}

/**
 * Read the optional tier-transition log (JSONL of persisted AuditEvents) and
 * recover the tier-transition payloads. Returns the findings: a single
 * `transition-log-invalid` if a line is not a valid AuditEvent (fail-closed — we
 * cannot trust the log), plus the recovered payloads for the ratification check.
 * A non-tier-transition event (any other audit event sharing the file) is simply
 * skipped, not an error.
 */
export function recoverTransitions(jsonl: string): {
  readonly transitions: TierTransitionPayload[];
  readonly findings: TierDriftFinding[];
} {
  const transitions: TierTransitionPayload[] = [];
  const findings: TierDriftFinding[] = [];
  const lines = jsonl.split('\n').filter((l) => l.trim() !== '');
  for (const [i, line] of lines.entries()) {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      findings.push({
        code: 'transition-log-invalid',
        message: `governance/authority-tier-transitions.jsonl line ${String(i + 1)} is not valid JSON.`,
      });
      continue;
    }
    const parsed = AuditEventSchema.safeParse(raw);
    if (!parsed.success) {
      findings.push({
        code: 'transition-log-invalid',
        message: `governance/authority-tier-transitions.jsonl line ${String(i + 1)} is not a valid AuditEvent: ${parsed.error.issues.map((x) => x.message).join('; ')}.`,
      });
      continue;
    }
    const payload = extractTierTransition(parsed.data);
    if (payload !== null) transitions.push(payload);
  }
  return { transitions, findings };
}

/** The ways an evidence record falls short of the advisory→enforce floor. */
function enforceFloorShortfalls(e: PromotionEvidence): string[] {
  const out: string[] = [];
  if (e.toTier !== 'enforce') out.push(`toTier is '${e.toTier}', expected 'enforce'`);
  if (e.evalN < ENFORCE_FLOOR.evalN) {
    out.push(`evalN ${String(e.evalN)} < ${String(ENFORCE_FLOOR.evalN)}`);
  }
  if (soakDays(e.soakDuration) < ENFORCE_FLOOR.soakDays) {
    out.push(`soakDuration ${e.soakDuration} < P${String(ENFORCE_FLOOR.soakDays)}D`);
  }
  if (e.precision === undefined || e.precision < ENFORCE_FLOOR.precision) {
    out.push(`precision ${String(e.precision)} < ${String(ENFORCE_FLOOR.precision)}`);
  }
  if (e.recall === undefined || e.recall < ENFORCE_FLOOR.recall) {
    out.push(`recall ${String(e.recall)} < ${String(ENFORCE_FLOOR.recall)}`);
  }
  // Ratification is required for ANY promotion (schema makes the field
  // mandatory, but defend against an empty string slipping past min(1)).
  if (e.ratificationVote.trim() === '') out.push('ratificationVote is empty');
  return out;
}

/**
 * The CI gate entry point. Reads the manifest registry (embedded constant) and
 * the optional evidence ledger from disk, runs the analysis, and prints
 * structured errors. Returns true when every declaration is honest. Fails closed.
 */
export function checkAuthorityTierDeclarations(): boolean {
  const declaredTiers = new Map<string, AuthorityTier | undefined>(
    STRATEGY_MANIFEST_REGISTRY.manifests.map((m) => [m.id, m.authorityTier])
  );
  const evidenceYaml = existsSync(EVIDENCE_LEDGER)
    ? readFileSync(EVIDENCE_LEDGER, 'utf-8')
    : undefined;

  const findings = analyzeTierDeclarations({ declaredTiers, evidenceYaml });

  // #3842/#3894 ratification gate: read the hash-chained tier-transition log (if
  // any) and fail any PROMOTION event whose ratificationVoteRef does not RESOLVE
  // to an approved higher_order vote in the committed ratification ledger.
  if (existsSync(TRANSITION_LOG)) {
    const ratificationYaml = existsSync(RATIFICATION_LEDGER)
      ? readFileSync(RATIFICATION_LEDGER, 'utf-8')
      : undefined;
    const { resolver, findings: ledgerFindings } = buildRatificationResolver(ratificationYaml);
    const { transitions, findings: logFindings } = recoverTransitions(
      readFileSync(TRANSITION_LOG, 'utf-8')
    );
    findings.push(
      ...ledgerFindings,
      ...logFindings,
      ...analyzeTierTransitionEvents(transitions, resolver)
    );
  }

  if (findings.length === 0) return true;

  console.error('Authority-tier drift (#3841/#3842, ADR-0017):');
  for (const f of findings) console.error(`  - [${f.code}] ${f.message}`);
  console.error('  Declare a tier on every manifest in governance/strategy-manifests.yaml,');
  console.error('  back any `enforce` with a floor-meeting record in');
  console.error('  governance/authority-tier-evidence.yaml, and link every promotion transition');
  console.error(
    '  to an approved higher_order vote recorded in governance/ratification-votes.yaml.'
  );
  console.error('  Re-run: pnpm authority-tier:check');
  return false;
}

const invokedPath = process.argv[1] ?? '';
if (import.meta.url === `file://${invokedPath}`) {
  process.exit(checkAuthorityTierDeclarations() ? 0 : 1);
}

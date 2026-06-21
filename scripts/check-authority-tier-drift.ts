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
 * Loop-tier declaration gate (#3843): the ladder also governs loops that are NOT
 * routable strategies (MCP tools / internal stages — `suggest_research_tasks`,
 * `improvement_review`, `pr_review`, the tune loop). Those declare their tier in
 * `governance/loop-tiers.yaml` (schema {@link LoopTierRegistrySchema}, mirrored as
 * the embedded `LOOP_TIER_REGISTRY` constant). {@link analyzeLoopTierDeclarations}
 * fails on an undeclared/mis-shaped loop (`loop-registry-invalid`), a YAML↔constant
 * drift (`loop-registry-drift`), or an `enforce` loop with neither a bounded safety
 * envelope nor a floor-meeting evidence record
 * (`loop-enforce-without-envelope-or-evidence`).
 *
 * Tier-transition ratification gate (#3842, hardened #3894, re-anchored #3927):
 * in addition to the declaration + evidence-floor checks, this gate also reads the
 * hash-chained tier-transition AUDIT EVENTS (Epic D / ADR-0017 §"Transition Rules")
 * and FAILS a PROMOTION transition event whose `ratificationVoteRef` does not
 * RESOLVE to a recorded, approved `higher_order` vote. #3842 only checked the ref
 * was non-empty (cosmetic); #3894 resolved it against a committed ledger; #3927
 * item 1 re-anchors that resolution to the AUTHENTIC, tamper-evident
 * `governance/vote-records.jsonl` (self-hashed at vote time, verified as a set by
 * {@link verifyVoteRecordSet}) — REPLACING the former hand-committable
 * `governance/ratification-votes.yaml`. The gate now fails closed on a tampered or
 * malformed ledger (`vote-records-ledger-invalid`), on an ambiguous
 * conflicting-decision subject (`promotion-ratification-ambiguous`), and on the
 * pre-existing `promotion-ratification-unresolved` / `-not-approved` reasons (the
 * subject is matched via the record's `ratifies` field). It remains tamper-EVIDENT,
 * not tamper-PROOF — cryptographic signing is tracked as #3927 item 4. Promotions
 * must be ratification-linked (ADR-0017); demotions are automatic and need no vote.
 * The transition log lives at `governance/authority-tier-transitions.jsonl`
 * (optional — empty when no transition has occurred); each line is a persisted
 * `AuditEvent`. The pure analysis ({@link analyzeTierTransitionEvents}) is
 * unit-tested in isolation.
 *
 * @module scripts/check-authority-tier-drift
 * (Source: ADR-0017, Issue #3839, #3841, #3842, #3894, #3927)
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
import {
  LoopTierRegistrySchema,
  type LoopTierManifest,
} from '../packages/nexus-agents/src/orchestration/loop-tier-manifest.js';
import { LOOP_TIER_REGISTRY } from '../packages/nexus-agents/src/orchestration/loop-tier-registry.js';
import {
  extractTierTransition,
  verifyChain,
} from '../packages/nexus-agents/src/audit/audit-logger.js';
import {
  AuditEventSchema,
  type AuditEvent,
  type TierTransitionPayload,
} from '../packages/nexus-agents/src/audit/audit-types.js';
import {
  buildVoteRecordRatificationResolver,
  ratificationFindingFor,
  type RatificationResolver,
} from './vote-record-ratification.js';

const EVIDENCE_LEDGER = join(ROOT, 'governance/authority-tier-evidence.yaml');
const TRANSITION_LOG = join(ROOT, 'governance/authority-tier-transitions.jsonl');
/**
 * The AUTHENTIC resolution source (#3927 item 1). The promotion gate resolves a
 * transition's `ratificationVoteRef` against this committed, tamper-evident
 * vote-record set — NOT the former hand-committable `governance/ratification-votes.yaml`,
 * whose YAML resolution path was removed here (that file is deprecated; its
 * removal is tracked separately). A record is produced at vote time
 * (`audit/vote-record-store.ts`) and committed alongside the transition; the
 * gate fails closed on any tamper/omission/ambiguity (see
 * {@link buildVoteRecordRatificationResolver}).
 */
const VOTE_RECORDS_LEDGER = join(ROOT, 'governance/vote-records.jsonl');
const LOOP_TIER_REGISTRY_FILE = join(ROOT, 'governance/loop-tiers.yaml');

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
    | 'loop-enforce-without-envelope-or-evidence'
    | 'loop-registry-invalid'
    | 'loop-registry-drift'
    | 'evidence-ledger-invalid'
    | 'promotion-without-ratification'
    | 'promotion-ratification-unresolved'
    | 'promotion-ratification-not-approved'
    | 'promotion-ratification-ambiguous'
    | 'vote-records-ledger-invalid'
    | 'transition-log-invalid'
    | 'transition-log-chain-broken';
  readonly message: string;
}

// The authentic vote-record resolver + per-transition verdict live in
// ./vote-record-ratification.ts (imported above); re-exported here so existing
// callers/tests keep importing them from the gate module.
export { buildVoteRecordRatificationResolver };
export type { RatificationResolver };

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

interface LoopDriftInputs {
  /** Raw text of the loop-tier YAML registry, or undefined when the file is absent. */
  readonly loopYaml: string | undefined;
  /** The embedded loop-tier constant (the runtime source of truth). */
  readonly embeddedLoops: readonly LoopTierManifest[];
  /** loopId → floor-meeting promotion-evidence (built once for the enforce check). */
  readonly enforceEvidenceById: ReadonlyMap<string, PromotionEvidence>;
}

/**
 * Pure loop-tier declaration analysis (#3843, ADR-0017). The loops governed by the
 * ladder that are NOT routable strategies declare their tier in
 * `governance/loop-tiers.yaml` (mirrored as the embedded constant); this validates
 * that surface the same way the strategy-manifest checks validate the manifests.
 *
 * Fails when ANY of:
 *   (1) `loop-registry-invalid` — the YAML registry does not validate against the
 *       LoopTierRegistrySchema (a malformed/undeclared/mis-shaped loop). The schema
 *       itself makes `authorityTier` REQUIRED and an `enforce` loop's
 *       `boundedEnvelope` mandatory, so an undeclared loop or an unbounded `enforce`
 *       loop is a parse failure here (the TOOL_CLASS-or-CI-fails pattern, #3841).
 *   (2) `loop-registry-drift` — the YAML and the embedded constant disagree (the
 *       #3837 lockstep discipline applied to loops: the human source of truth and
 *       the runtime constant cannot diverge).
 *   (3) `loop-enforce-without-envelope-or-evidence` — an `enforce` loop carries
 *       neither a `boundedEnvelope` NOR a floor-meeting promotion-evidence record.
 *       ADR-0017: `enforce` is never a default; a pre-existing bounded loop is
 *       honest via its envelope, a promoted loop via its evidence — one is required.
 *
 * @param inputs - the YAML text, the embedded constant, and the enforce-evidence map
 * @returns one finding per offending loop / registry problem
 */
export function analyzeLoopTierDeclarations(inputs: LoopDriftInputs): TierDriftFinding[] {
  const findings: TierDriftFinding[] = [];

  // (1) The YAML registry, if present, must validate. A parse failure is a single
  // finding (we cannot trust any loop record) — and because the schema makes the
  // tier required and the enforce envelope mandatory, an undeclared/unbounded loop
  // surfaces HERE, fail-closed.
  let yamlLoops: LoopTierManifest[] | undefined;
  if (inputs.loopYaml !== undefined) {
    const parsed = LoopTierRegistrySchema.safeParse(parseYaml(inputs.loopYaml));
    if (!parsed.success) {
      findings.push({
        code: 'loop-registry-invalid',
        message: `governance/loop-tiers.yaml failed schema validation: ${parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
      });
    } else {
      yamlLoops = parsed.data.loops;
    }
  }

  // (2) Lockstep: the YAML and the embedded constant must be byte-equivalent (as
  // structured data). The embedded constant is the runtime source of truth; the
  // YAML is the human/docs/drift-gate surface — they cannot diverge.
  if (yamlLoops !== undefined) {
    const yamlJson = JSON.stringify(yamlLoops);
    const embeddedJson = JSON.stringify(inputs.embeddedLoops);
    if (yamlJson !== embeddedJson) {
      findings.push({
        code: 'loop-registry-drift',
        message:
          'governance/loop-tiers.yaml and the embedded loop-tier-registry.ts constant disagree. Re-sync them (the human source of truth and the runtime constant must be equal).',
      });
    }
  }

  // (3) `enforce` is never a default: an `enforce` loop must carry either a bounded
  // safety envelope (the pre-existing-loop path) OR a floor-meeting evidence record
  // (the ladder-promotion path). The schema already requires the envelope for
  // enforce, but a loop could (in a future PR) drop the envelope and claim a
  // promotion-evidence record instead — both are honest; NEITHER is not.
  for (const loop of inputs.embeddedLoops) {
    if (loop.authorityTier !== 'enforce') continue;
    const hasEnvelope = loop.boundedEnvelope !== undefined;
    const evidence = inputs.enforceEvidenceById.get(loop.id);
    const hasFloorMeetingEvidence =
      evidence !== undefined && enforceFloorShortfalls(evidence).length === 0;
    if (!hasEnvelope && !hasFloorMeetingEvidence) {
      findings.push({
        code: 'loop-enforce-without-envelope-or-evidence',
        message: `loop '${loop.id}' is declared authorityTier='enforce' but carries NEITHER a boundedEnvelope NOR a floor-meeting promotion-evidence record. 'enforce' is never a default (ADR-0017) — declare the safety envelope (pre-existing bounded loop) or record evidence + ratification (ladder promotion).`,
      });
    }
  }

  return findings;
}

/**
 * The ratification gate (#3842, hardened #3894, re-anchored to authentic vote
 * records #3927 item 1). Pure analysis (no disk/process I/O) over the recovered
 * tier-transition payloads so it is unit-testable with fixtures. ADR-0017
 * §"Promotions are ratification-linked": a `promotion` transition is valid only if
 * it carries a linked ratification vote that genuinely happened and PASSED; a
 * `demotion` is automatic and needs none.
 *
 * A promotion FAILS when (each fail-closed):
 *   - `promotion-ratification-ambiguous` — the subject has CONFLICTING records in
 *     the ledger (e.g. an `approved` and a `rejected` record both ratify it). No
 *     ref may cherry-pick the approving fork; the conflict must be resolved in the
 *     ledger first. Checked FIRST, before ref resolution (#3927, Contrarian).
 *   - `promotion-without-ratification` — `ratificationVoteRef` is absent/empty.
 *   - `promotion-ratification-unresolved` — the ref does NOT resolve to any record
 *     in the committed `governance/vote-records.jsonl` (a bogus
 *     `ratificationVoteRef:'x'` does not pass).
 *   - `promotion-ratification-not-approved` — the ref resolves, but the record's
 *     `decision` is not `approved`, its `strategy` is not `higher_order` (a
 *     promotion is governance-of-the-governor), or its `ratifies` subject-binding
 *     does not match the transition subject.
 *
 * @param transitions - tier-transition payloads recovered from the chained audit log
 * @param resolve - resolves a `ratificationVoteRef` to its authentic record (see
 *   {@link buildVoteRecordRatificationResolver}); a resolver that resolves nothing
 *   makes every non-empty ref `promotion-ratification-unresolved` (fail-closed).
 * @param conflictSubjects - subjects with conflicting-decision records; a promotion
 *   of any such subject fails `promotion-ratification-ambiguous`.
 * @returns one finding per offending promotion
 */
export function analyzeTierTransitionEvents(
  transitions: readonly TierTransitionPayload[],
  resolve: RatificationResolver,
  conflictSubjects: ReadonlySet<string> = new Set<string>()
): TierDriftFinding[] {
  const findings: TierDriftFinding[] = [];
  for (const t of transitions) {
    if (t.kind !== 'promotion') continue; // demotions are automatic — no vote required
    const finding = ratificationFindingFor(t, resolve, conflictSubjects);
    if (finding !== null) findings.push(finding);
  }
  return findings;
}

/**
 * Verify the hash chain over the recovered audit events (#3921). The
 * tier-transition payload the gate decides on is now hash-covered
 * (`hashVersion: 2`, see {@link computeEventHash}), so a tampered/forged/reordered
 * transition event breaks `verifyChain` and is caught HERE — not just by the
 * per-line schema parse, which a re-serialized forgery passes. Returns a single
 * `transition-log-chain-broken` finding on a break (fail-closed); an empty or
 * un-chained legacy log verifies clean (the verifier's own backward-compat path).
 */
function verifyTransitionChain(events: readonly AuditEvent[]): TierDriftFinding[] {
  const result = verifyChain(events);
  if (result.ok) return [];
  return [
    {
      code: 'transition-log-chain-broken',
      message: `governance/authority-tier-transitions.jsonl FAILS hash-chain verification (${result.reason}) at event index ${String(result.eventIndex)} (id='${result.eventId}'): ${result.detail}. The transition log has been tampered, reordered, or forged — its payloads cannot be trusted.`,
    },
  ];
}

/**
 * Read the optional tier-transition log (JSONL of persisted AuditEvents) and
 * recover the tier-transition payloads. Returns the findings: a single
 * `transition-log-invalid` if a line is not a valid AuditEvent, a
 * `transition-log-chain-broken` if the recovered events fail hash-chain
 * verification (#3921 — the integrity-critical payload is now hash-covered), plus
 * the recovered payloads for the ratification check. All findings are fail-closed:
 * we do not trust the payloads when the chain or schema does not hold. A
 * non-tier-transition event (any other audit event sharing the file) is skipped.
 */
export function recoverTransitions(jsonl: string): {
  readonly transitions: TierTransitionPayload[];
  readonly findings: TierDriftFinding[];
} {
  const transitions: TierTransitionPayload[] = [];
  const findings: TierDriftFinding[] = [];
  const events: AuditEvent[] = [];
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
    events.push(parsed.data);
    const payload = extractTierTransition(parsed.data);
    if (payload !== null) transitions.push(payload);
  }
  // #3921: verify the chain over the events that DID parse. A chain break means
  // the recovered payloads are untrustworthy — fail closed.
  findings.push(...verifyTransitionChain(events));
  return { transitions, findings };
}

/**
 * Build a `loopId → PromotionEvidence` map from the evidence-ledger YAML (or an
 * empty map when the ledger is absent/invalid — fail-closed: a loop then has NO
 * evidence and must justify any `enforce` via its bounded envelope). Used by the
 * loop-tier enforce check so a promoted loop can be enforce-via-evidence.
 */
export function buildEnforceEvidenceMap(
  evidenceYaml: string | undefined
): Map<string, PromotionEvidence> {
  if (evidenceYaml === undefined) return new Map();
  const parsed = PromotionEvidenceLedgerSchema.safeParse(parseYaml(evidenceYaml));
  if (!parsed.success) return new Map();
  return new Map(parsed.data.evidence.map((e) => [e.loopId, e]));
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
/**
 * #3842/#3894/#3927 ratification gate: read the hash-chained tier-transition log
 * (if any) and fail any PROMOTION event whose ratificationVoteRef does not RESOLVE
 * to an approved higher_order record in the AUTHENTIC, tamper-evident committed
 * ledger `governance/vote-records.jsonl` (#3927 item 1 — replaces the former
 * hand-committable `ratification-votes.yaml`). Fails closed on a tampered/malformed
 * ledger and on ambiguous (conflicting-decision) subjects. Returns no findings when
 * the transition log is absent (the no-promotions-yet happy path).
 */
function ratificationGateFindings(): TierDriftFinding[] {
  if (!existsSync(TRANSITION_LOG)) return [];
  const voteRecordsJsonl = existsSync(VOTE_RECORDS_LEDGER)
    ? readFileSync(VOTE_RECORDS_LEDGER, 'utf-8')
    : undefined;
  const { resolver, conflictSubjects, findings } =
    buildVoteRecordRatificationResolver(voteRecordsJsonl);
  const { transitions, findings: logFindings } = recoverTransitions(
    readFileSync(TRANSITION_LOG, 'utf-8')
  );
  return [
    ...findings,
    ...logFindings,
    ...analyzeTierTransitionEvents(transitions, resolver, conflictSubjects),
  ];
}

export function checkAuthorityTierDeclarations(): boolean {
  const declaredTiers = new Map<string, AuthorityTier | undefined>(
    STRATEGY_MANIFEST_REGISTRY.manifests.map((m) => [m.id, m.authorityTier])
  );
  const evidenceYaml = existsSync(EVIDENCE_LEDGER)
    ? readFileSync(EVIDENCE_LEDGER, 'utf-8')
    : undefined;

  const findings = analyzeTierDeclarations({ declaredTiers, evidenceYaml });

  // #3843 loop-tier gate: validate the non-strategy loops' tier declarations
  // (governance/loop-tiers.yaml ↔ embedded constant) alongside the manifests. An
  // undeclared loop, a YAML/constant drift, or an unbacked `enforce` loop fails.
  const loopYaml = existsSync(LOOP_TIER_REGISTRY_FILE)
    ? readFileSync(LOOP_TIER_REGISTRY_FILE, 'utf-8')
    : undefined;
  findings.push(
    ...analyzeLoopTierDeclarations({
      loopYaml,
      embeddedLoops: LOOP_TIER_REGISTRY.loops,
      enforceEvidenceById: buildEnforceEvidenceMap(evidenceYaml),
    })
  );

  findings.push(...ratificationGateFindings());

  if (findings.length === 0) return true;

  console.error('Authority-tier drift (#3841/#3842/#3843, ADR-0017):');
  for (const f of findings) console.error(`  - [${f.code}] ${f.message}`);
  console.error('  Declare a tier on every manifest in governance/strategy-manifests.yaml');
  console.error('  and every loop in governance/loop-tiers.yaml (kept in lockstep with');
  console.error('  loop-tier-registry.ts),');
  console.error('  back any `enforce` with a floor-meeting record in');
  console.error('  governance/authority-tier-evidence.yaml, and link every promotion transition');
  console.error(
    '  to an approved higher_order record (matching ratifies==subject) in the authentic'
  );
  console.error('  governance/vote-records.jsonl ledger.');
  console.error('  Re-run: pnpm authority-tier:check');
  return false;
}

const invokedPath = process.argv[1] ?? '';
if (import.meta.url === `file://${invokedPath}`) {
  process.exit(checkAuthorityTierDeclarations() ? 0 : 1);
}

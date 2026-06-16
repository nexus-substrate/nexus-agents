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
 * Tier-transition ratification gate (#3842): in addition to the declaration +
 * evidence-floor checks, this gate now also reads the hash-chained
 * tier-transition AUDIT EVENTS (Epic D / ADR-0017 §"Transition Rules") and FAILS
 * a PROMOTION transition event that lacks a linked `ratificationVoteRef`.
 * Promotions must be ratification-linked (ADR-0017); demotions are automatic and
 * need no vote. The transition log lives at
 * `governance/authority-tier-transitions.jsonl` (optional — empty when no
 * transition has occurred); each line is a persisted `AuditEvent`. The pure
 * analysis ({@link analyzeTierTransitionEvents}) is unit-tested in isolation.
 *
 * @module scripts/check-authority-tier-drift
 * (Source: ADR-0017, Issue #3839, #3841, #3842)
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
  type TierTransitionPayload,
} from '../packages/nexus-agents/src/audit/audit-types.js';

const EVIDENCE_LEDGER = join(ROOT, 'governance/authority-tier-evidence.yaml');
const TRANSITION_LOG = join(ROOT, 'governance/authority-tier-transitions.jsonl');

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
    | 'transition-log-invalid';
  readonly message: string;
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
 * The ratification gate (#3842). Pure analysis (no disk/process I/O) over the
 * recovered tier-transition payloads so it is unit-testable with fixtures both
 * ways. ADR-0017 §"Promotions are ratification-linked": a `promotion` transition
 * is valid only if it carries a linked `ratificationVoteRef`; a `demotion` is
 * automatic and needs none. This is the machine-enforced invariant the
 * ratification panel's Contrarian required: a tier-transition audit event of kind
 * `promotion` lacking a linked ratification vote FAILS the gate.
 *
 * @param transitions - tier-transition payloads recovered from the chained audit log
 * @returns one `promotion-without-ratification` finding per offending promotion
 */
export function analyzeTierTransitionEvents(
  transitions: readonly TierTransitionPayload[]
): TierDriftFinding[] {
  const findings: TierDriftFinding[] = [];
  for (const t of transitions) {
    if (t.kind !== 'promotion') continue; // demotions are automatic — no vote required
    const ref = t.ratificationVoteRef;
    if (ref === undefined || ref.trim() === '') {
      findings.push({
        code: 'promotion-without-ratification',
        message: `tier-transition promotion of '${t.subject}' (${t.fromTier} → ${t.toTier}, evidenceRef='${t.evidenceRef}') has NO linked ratificationVoteRef. Promotions MUST be ratification-linked (ADR-0017 §"Promotions are ratification-linked") — record the consensus_vote ref on the transition audit event.`,
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

  // #3842 ratification gate: read the hash-chained tier-transition log (if any)
  // and fail any PROMOTION event lacking a linked ratificationVoteRef.
  if (existsSync(TRANSITION_LOG)) {
    const { transitions, findings: logFindings } = recoverTransitions(
      readFileSync(TRANSITION_LOG, 'utf-8')
    );
    findings.push(...logFindings, ...analyzeTierTransitionEvents(transitions));
  }

  if (findings.length === 0) return true;

  console.error('Authority-tier drift (#3841/#3842, ADR-0017):');
  for (const f of findings) console.error(`  - [${f.code}] ${f.message}`);
  console.error('  Declare a tier on every manifest in governance/strategy-manifests.yaml,');
  console.error('  back any `enforce` with a floor-meeting record in');
  console.error('  governance/authority-tier-evidence.yaml, and link a ratification vote on');
  console.error('  every promotion transition. Re-run: pnpm authority-tier:check');
  return false;
}

const invokedPath = process.argv[1] ?? '';
if (import.meta.url === `file://${invokedPath}`) {
  process.exit(checkAuthorityTierDeclarations() ? 0 : 1);
}

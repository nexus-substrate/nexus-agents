/**
 * Rule-of-Two capability boundary for the auto-remediation path (#3540 inc.2c / #3613).
 *
 * Condition 2 — the load-bearing security hole. When the auto-invoke gate
 * enforces, a naive run would hold all three Rule-of-Two legs at once: it ingests
 * UNTRUSTED external content (research), WRITES a PR, and holds SECRETS (adapter
 * keys). Per .rules/untrusted-input.md that conjunction is disallowed.
 *
 * This module is the FAIL-CLOSED runtime primitive (design ratified 7/7, see
 * #3613): a typed phase machine + a {@link CapabilityLedger} that throws if the
 * active capability set ever contains all three legs, plus the strict typed
 * {@link RemediationPlanSchema} artifact that is the ONLY thing allowed to cross
 * the RESEARCH→IMPLEMENT boundary (so untrusted content can't ride into the
 * write-capable phase as data).
 *
 * Per the vote's conditions, full enforcement also requires (wired in the
 * enforce capstone #3618, where the real RESEARCH/IMPLEMENT execution lives):
 *  - calling {@link CapabilityLedger.assertCapability} at EVERY chokepoint
 *    (each untrusted-read / write / secret-read), not only at phase transitions;
 *  - PHYSICALLY surrendering capabilities at the boundary (per-phase adapter
 *    lifecycle / no write token in RESEARCH, no fetch in IMPLEMENT) so the
 *    ledger is a tripwire over a real split, not the split itself;
 *  - reconciling with the PolicyFirewall rule set (the `secret-paths` and
 *    `safe-paths` rules, #5108) rather than forking a second path denylist.
 * OS-level process isolation is tracked as stronger follow-up hardening.
 *
 * This file ships the pure, unit-testable boundary primitives.
 *
 * @module mcp/tools/improvement-remediation-capability
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';

/** The three Rule-of-Two legs. No single phase may hold all three. */
export type Capability = 'untrusted-input' | 'repo-write' | 'secrets';

/** Phases of a remediation run. */
export type RemediationPhase = 'research' | 'implement';

/**
 * Declared capability set per phase. By construction NEITHER phase holds all
 * three legs: RESEARCH reads untrusted content + uses secrets but cannot write;
 * IMPLEMENT writes + uses secrets but ingests no fresh untrusted input.
 */
export const PHASE_CAPABILITIES: Readonly<Record<RemediationPhase, ReadonlySet<Capability>>> = {
  research: new Set<Capability>(['untrusted-input', 'secrets']),
  implement: new Set<Capability>(['repo-write', 'secrets']),
};

/** The forbidden conjunction — holding all of these at once violates Rule-of-Two. */
export const RULE_OF_TWO_LEGS: readonly Capability[] = ['untrusted-input', 'repo-write', 'secrets'];

/** Thrown when a capability is requested that would violate the boundary. Aborts the run. */
export class RuleOfTwoViolation extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleOfTwoViolation';
  }
}

/**
 * Static invariant: no declared phase may contain all three legs. Guards against
 * config drift in {@link PHASE_CAPABILITIES}. Call once at startup; throws on drift.
 */
export function assertPhaseCapabilitiesSound(): void {
  for (const [phase, caps] of Object.entries(PHASE_CAPABILITIES)) {
    if (RULE_OF_TWO_LEGS.every((leg) => caps.has(leg))) {
      throw new RuleOfTwoViolation(
        `phase '${phase}' declares all three Rule-of-Two legs (config drift)`
      );
    }
  }
}

/**
 * Fail-closed capability ledger. Call {@link assertCapability} at every
 * chokepoint (untrusted-read / write / secret-read) before performing it. With
 * no phase entered, every capability is denied (fail-closed).
 */
export class CapabilityLedger {
  private phase: RemediationPhase | undefined;

  /** Enter a phase, setting its declared capability set as active. */
  enterPhase(phase: RemediationPhase): void {
    this.phase = phase;
  }

  /** The active phase, or undefined if none entered. */
  currentPhase(): RemediationPhase | undefined {
    return this.phase;
  }

  /**
   * Assert that `capability` is permitted right now. Throws {@link RuleOfTwoViolation}
   * (fail-closed) if no phase is active or the active phase doesn't grant it —
   * which structurally prevents the forbidden three-leg conjunction, since no
   * phase grants more than two legs.
   */
  assertCapability(capability: Capability): void {
    if (this.phase === undefined) {
      throw new RuleOfTwoViolation(
        `capability '${capability}' requested before any remediation phase was entered (fail-closed)`
      );
    }
    const allowed = PHASE_CAPABILITIES[this.phase];
    if (!allowed.has(capability)) {
      throw new RuleOfTwoViolation(
        `capability '${capability}' is not permitted in phase '${this.phase}' (allowed: ${[...allowed].join(', ')})`
      );
    }
  }
}

// ============================================================================
// RemediationPlan — the ONLY artifact allowed to cross RESEARCH → IMPLEMENT.
// Strict + typed-action allowlist: no free-form/executable/passthrough fields,
// so untrusted research content cannot ride into the write-capable phase.
// ============================================================================

/** Allowlisted, non-executable remediation action kinds. */
export const RemediationActionKindSchema = z.enum([
  'investigate',
  'adjust-routing',
  'add-test',
  'refactor',
  'update-docs',
  'fix-bug',
]);
export type RemediationActionKind = z.infer<typeof RemediationActionKindSchema>;

/** One planned step — bounded, inert data (treated as data, never as instructions). */
export const RemediationStepSchema = z
  .object({
    kind: RemediationActionKindSchema,
    description: z.string().min(1).max(500),
    /** Optional path hint; bounded inert string, validated for traversal at use. */
    targetPath: z.string().min(1).max(300).optional(),
  })
  .strict();
export type RemediationStep = z.infer<typeof RemediationStepSchema>;

export const RemediationSourceEvidenceSchema = z
  .object({
    samples: z.number().optional(),
    window: z.string().max(200).optional(),
    observedValue: z.number().optional(),
    threshold: z.number().optional(),
  })
  .strict();
export type RemediationSourceEvidence = z.infer<typeof RemediationSourceEvidenceSchema>;

/**
 * Strict schema for source context retained with a remediation plan (#7429).
 * Description is bounded to 1200 UTF-16 units; digest binds provenance.
 */
export const RemediationSourceContextSchema = z
  .object({
    description: z.string().max(1200).optional(),
    evidence: RemediationSourceEvidenceSchema.optional(),
    digest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
export type RemediationSourceContext = z.infer<typeof RemediationSourceContextSchema>;

/**
 * Compute the canonical SHA-256 digest of source context for content linkage (#7429).
 * A digest binds content provenance; it is never authentication.
 */
export function computeSourceContextDigest(
  description?: string,
  evidence?: RemediationSourceEvidence
): string {
  const normDescription = description ?? '';
  const normEvidence = evidence
    ? JSON.stringify({
        observedValue: evidence.observedValue ?? null,
        samples: evidence.samples ?? null,
        threshold: evidence.threshold ?? null,
        window: evidence.window ?? null,
      })
    : '';
  return createHash('sha256')
    .update(`desc:${normDescription}\nevid:${normEvidence}`, 'utf8')
    .digest('hex');
}

/**
 * The typed plan crossing the boundary. `.strict()` rejects unknown keys so no
 * extra free-form field can smuggle untrusted/executable content across.
 */
export const RemediationPlanSchema = z
  .object({
    /** Source signal key (mirrors ImprovementSignal.signalKey). */
    signalKey: z.string().min(1).max(200),
    /** Signal category (mirrors SignalCategory; 'tool-fitness' #3852, 'perf-regression' #3692). */
    category: z.enum([
      'routing',
      'tech-debt',
      'bug',
      'security',
      'consensus',
      'tool-fitness',
      'perf-regression',
    ]),
    summary: z.string().min(1).max(1000),
    steps: z.array(RemediationStepSchema).min(1).max(20),
    /** Retained, bounded signal context and evidence (#7429). Optional for legacy compatibility. */
    sourceContext: RemediationSourceContextSchema.optional(),
  })
  .strict();
export type RemediationPlan = z.infer<typeof RemediationPlanSchema>;

function assertStepsUtf16WellFormed(steps: readonly RemediationStep[]): void {
  for (const step of steps) {
    if (
      !step.description.isWellFormed() ||
      (step.targetPath !== undefined && !step.targetPath.isWellFormed())
    ) {
      throw new RuleOfTwoViolation(
        'RemediationPlan contains malformed UTF-16 in step description or targetPath'
      );
    }
  }
}

function assertSourceContextUtf16WellFormed(sourceContext?: RemediationSourceContext): void {
  if (sourceContext === undefined) return;
  if (sourceContext.description !== undefined && !sourceContext.description.isWellFormed()) {
    throw new RuleOfTwoViolation(
      'RemediationPlan sourceContext.description is not well-formed UTF-16'
    );
  }
  if (
    sourceContext.evidence?.window !== undefined &&
    !sourceContext.evidence.window.isWellFormed()
  ) {
    throw new RuleOfTwoViolation(
      'RemediationPlan sourceContext.evidence.window is not well-formed UTF-16'
    );
  }
}

function assertPlanUtf16WellFormed(plan: RemediationPlan): void {
  if (!plan.signalKey.isWellFormed() || !plan.summary.isWellFormed()) {
    throw new RuleOfTwoViolation('RemediationPlan contains malformed UTF-16 in key or summary');
  }
  assertStepsUtf16WellFormed(plan.steps);
  assertSourceContextUtf16WellFormed(plan.sourceContext);
}

function assertPlanDigestValid(sourceContext?: RemediationSourceContext): void {
  if (sourceContext?.digest === undefined) return;
  const expected = computeSourceContextDigest(sourceContext.description, sourceContext.evidence);
  if (sourceContext.digest !== expected) {
    throw new RuleOfTwoViolation(
      `RemediationPlan sourceContext digest mismatch: expected ${expected}, received ${sourceContext.digest}`
    );
  }
}

/**
 * Parse + validate a plan crossing the boundary. Fail-closed: throws
 * {@link RuleOfTwoViolation} on any schema violation (unknown key, free-form
 * overflow, bad action kind, malformed UTF-16, digest mismatch), so
 * malformed/smuggled plans never reach IMPLEMENT.
 */
export function parseRemediationPlan(raw: unknown): RemediationPlan {
  const result = RemediationPlanSchema.safeParse(raw);
  if (!result.success) {
    throw new RuleOfTwoViolation(
      `RemediationPlan failed strict validation at the RESEARCH→IMPLEMENT boundary: ${result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`
    );
  }
  const plan = result.data;
  assertPlanUtf16WellFormed(plan);
  assertPlanDigestValid(plan.sourceContext);
  return plan;
}

// ============================================================================
// Dev-pipeline boundary glue (#3643) — wires the ledger + plan into the
// dev-pipeline's untrusted-input chokepoint hooks (DevPipelineOptions).
// ============================================================================

/**
 * Build the dev-pipeline `untrustedInputGuard` from a ledger (#3643). When the
 * IMPLEMENT-phase ledger is active (no untrusted-input grant), invoking the
 * returned guard at the research chokepoint throws {@link RuleOfTwoViolation} —
 * fail-closed, so a fresh untrusted read inside IMPLEMENT cannot proceed.
 */
export function untrustedInputGuardFor(ledger: CapabilityLedger): () => void {
  return () => {
    ledger.assertCapability('untrusted-input');
  };
}

/**
 * Render a typed {@link RemediationPlan} as plan-only research text (#3643, #7429), so
 * the IMPLEMENT phase can run the dev-pipeline from the plan with NO fresh
 * untrusted read (passed as `DevPipelineOptions.researchOverride`). All content
 * is inert plan data — never re-fetched. Consumes and verifies any provenance fields.
 */
export function renderPlanAsResearch(plan: RemediationPlan): string {
  if (plan.sourceContext?.digest !== undefined) {
    const expected = computeSourceContextDigest(
      plan.sourceContext.description,
      plan.sourceContext.evidence
    );
    if (plan.sourceContext.digest !== expected) {
      throw new RuleOfTwoViolation(
        `RemediationPlan sourceContext digest mismatch in renderer: expected ${expected}, received ${plan.sourceContext.digest}`
      );
    }
  }

  const steps = plan.steps
    .map((s, i) => {
      const target = s.targetPath !== undefined ? ` (target: ${s.targetPath})` : '';
      return `${String(i + 1)}. [${s.kind}] ${s.description}${target}`;
    })
    .join('\n');

  let contextBlock = '';
  if (plan.sourceContext !== undefined) {
    const sections: string[] = [];
    if (plan.sourceContext.description !== undefined && plan.sourceContext.description.length > 0) {
      sections.push(`Source context:\n${plan.sourceContext.description}`);
    }
    if (plan.sourceContext.evidence !== undefined) {
      sections.push(`Evidence:\n${JSON.stringify(plan.sourceContext.evidence)}`);
    }
    if (plan.sourceContext.digest !== undefined) {
      sections.push(`Context digest: ${plan.sourceContext.digest}`);
    }
    if (sections.length > 0) {
      contextBlock = `\n\n${sections.join('\n\n')}`;
    }
  }

  return `Remediation plan for signal '${plan.signalKey}' (category: ${plan.category}).\n\n${plan.summary}${contextBlock}\n\nSteps:\n${steps}`;
}

/**
 * Tests for Versioned Task, Capability and Evidence Contracts (Task T05, Issue #5129 / Milestone M1)
 *
 * Conformance cases:
 * - C35: Legacy client enforcing downgrade / schema version gateway
 * - C06: Evidence verifier / receipt artifactRef matching & obligation completeness
 *
 * Disciplines: Red/Green TDD, Zero `any` policy, non-vacuous aggregation.
 */
import { describe, it, expect } from 'vitest';
import {
  CapabilityRequirementSchema,
  EvidenceObligationSchema,
  checkContractCompatibility,
  validateObligationCompleteness,
  detectMissingCapabilities,
  type TaskContract,
  type CapabilityRequirement,
  type EvidenceObligation,
  type EvidenceReceipt,
} from './task-contract.js';

function baseValidTask(): TaskContract {
  return {
    id: 'task-test-001',
    description: 'Autonomous execution test',
    status: 'approved',
    analysis: {
      complexity: 'medium',
      taskType: 'feature',
      ambiguityScore: 0.1,
    },
    constraints: { scope: ['src/core'] },
    requiredCapabilities: { tools: ['read_file'], experts: ['architect'] },
    capabilityGaps: {
      available: { tools: ['read_file'], experts: ['architect'] },
      gaps: [],
      allSatisfied: true,
      gapsMeasured: true,
    },
    artifacts: [],
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    contractVersion: '1.0.0',
    capabilityRequirements: [],
    evidenceObligations: [],
  };
}

describe('Task T05: Capability & Evidence Contract Schemas', () => {
  it('validates CapabilityRequirementSchema with enforcing and advisory modes', () => {
    const enforcing: CapabilityRequirement = {
      id: 'cap-read-diff',
      operation: 'artifact.read',
      resourceRef: 'artifact:diff-001',
      scope: 'task-only',
      mode: 'enforcing',
    };
    expect(CapabilityRequirementSchema.safeParse(enforcing).success).toBe(true);

    const advisory: CapabilityRequirement = {
      id: 'cap-lint-hint',
      operation: 'linter.suggest',
      mode: 'advisory',
    };
    expect(CapabilityRequirementSchema.safeParse(advisory).success).toBe(true);

    // Default mode is enforcing
    const defaultMode = CapabilityRequirementSchema.parse({
      id: 'cap-default',
      operation: 'file.read',
    });
    expect(defaultMode.mode).toBe('enforcing');
  });

  it('validates EvidenceObligationSchema with receipt issuers', () => {
    const obligation: EvidenceObligation = {
      id: 'ev-test-pass',
      artifactRef: 'test-summary.json',
      claim: 'Unit tests pass 100%',
      required: true,
      mode: 'enforcing',
      receiptIssuer: 'trusted-executor:vitest',
    };
    expect(EvidenceObligationSchema.safeParse(obligation).success).toBe(true);

    // Advisory obligation
    const advisoryObligation: EvidenceObligation = {
      id: 'ev-perf-benchmark',
      artifactRef: 'bench-result.json',
      required: false,
      mode: 'advisory',
    };
    expect(EvidenceObligationSchema.safeParse(advisoryObligation).success).toBe(true);
  });
});

describe('Task T05: Contract Version Compatibility & Downgrade Prevention (C35)', () => {
  it('accepts contracts within supported version range', () => {
    const task = baseValidTask();
    const result = checkContractCompatibility(task, '1.0.0', '1.9.9');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.contractVersion).toBe('1.0.0');
    }
  });

  it('fails closed when presented with an unsupported future contract version', () => {
    const task = { ...baseValidTask(), contractVersion: '2.5.0' };
    const result = checkContractCompatibility(task, '1.0.0', '1.9.9');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('UnsupportedContractVersion');
      expect(result.error).toContain('2.5.0');
    }
  });

  it('fails closed when contractVersion is malformed semver', () => {
    const malformedVersions = ['1..5', 'not-a-version', '1.0', '1.0.0.0', ''];
    for (const badVer of malformedVersions) {
      const task = { ...baseValidTask(), contractVersion: badVer };
      const result = checkContractCompatibility(task, '1.0.0', '1.9.9');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('InvalidContractVersion');
      }
    }
  });

  it('fails closed when contract is unversioned and strict versioning is required', () => {
    const taskWithoutVersion: Record<string, unknown> = { ...baseValidTask() };
    delete taskWithoutVersion['contractVersion'];

    const result = checkContractCompatibility(taskWithoutVersion, '1.0.0', '1.9.9', {
      requireExplicitVersion: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('UnversionedContractError');
    }
  });

  it('fails closed when contractVersion is explicitly undefined and strict versioning is required', () => {
    const taskWithUndefined: Record<string, unknown> = {
      ...baseValidTask(),
      contractVersion: undefined,
    };

    const result = checkContractCompatibility(taskWithUndefined, '1.0.0', '1.9.9', {
      requireExplicitVersion: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('UnversionedContractError');
    }
  });

  it('applies default version for legacy unversioned contracts when non-strict', () => {
    const taskWithoutVersion: Record<string, unknown> = { ...baseValidTask() };
    delete taskWithoutVersion['contractVersion'];

    const result = checkContractCompatibility(taskWithoutVersion, '1.0.0', '1.9.9', {
      requireExplicitVersion: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.contractVersion).toBe('1.0.0');
    }
  });
});

describe('Task T05: Obligation Completeness & Evidence Verification (C06)', () => {
  it('returns ok when all required enforcing obligations are met with valid receipts', () => {
    const task: TaskContract = {
      ...baseValidTask(),
      evidenceObligations: [
        {
          id: 'ev-diff',
          artifactRef: 'diff-001',
          required: true,
          mode: 'enforcing',
        },
        {
          id: 'ev-test',
          artifactRef: 'test-report-001',
          required: true,
          mode: 'enforcing',
          receiptIssuer: 'trusted-runner',
        },
      ],
    };

    const receipts: readonly EvidenceReceipt[] = [
      {
        obligationId: 'ev-diff',
        artifactRef: 'diff-001',
        digest: 'sha256-abc',
        verified: true,
      },
      {
        obligationId: 'ev-test',
        artifactRef: 'test-report-001',
        digest: 'sha256-def',
        issuer: 'trusted-runner',
        verified: true,
      },
    ];

    const result = validateObligationCompleteness(task, receipts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fulfilled).toEqual(['ev-diff', 'ev-test']);
      expect(result.value.missing).toHaveLength(0);
    }
  });

  it('fails closed when a receipt matches obligationId but has a mismatched artifactRef', () => {
    const task: TaskContract = {
      ...baseValidTask(),
      evidenceObligations: [
        {
          id: 'ev-diff',
          artifactRef: 'diff-001',
          required: true,
          mode: 'enforcing',
        },
      ],
    };

    // Receipt specifies obligationId 'ev-diff', but artifactRef is 'unrelated-diff-999'
    const receipts: readonly EvidenceReceipt[] = [
      {
        obligationId: 'ev-diff',
        artifactRef: 'unrelated-diff-999',
        digest: 'sha256-xyz',
        verified: true,
      },
    ];

    const result = validateObligationCompleteness(task, receipts);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('MissingEnforcingObligationError');
      expect(result.error).toContain('ev-diff (diff-001)');
    }
  });

  it('fails closed when a required enforcing obligation is missing', () => {
    const task: TaskContract = {
      ...baseValidTask(),
      evidenceObligations: [
        {
          id: 'ev-diff',
          artifactRef: 'diff-001',
          required: true,
          mode: 'enforcing',
        },
        {
          id: 'ev-security-scan',
          artifactRef: 'sec-report-001',
          required: true,
          mode: 'enforcing',
        },
      ],
    };

    const receipts: readonly EvidenceReceipt[] = [
      {
        obligationId: 'ev-diff',
        artifactRef: 'diff-001',
        digest: 'sha256-abc',
        verified: true,
      },
    ];

    const result = validateObligationCompleteness(task, receipts);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('MissingEnforcingObligationError');
      expect(result.error).toContain('ev-security-scan');
    }
  });

  it('permits missing advisory obligations without blocking completeness', () => {
    const task: TaskContract = {
      ...baseValidTask(),
      evidenceObligations: [
        {
          id: 'ev-diff',
          artifactRef: 'diff-001',
          required: true,
          mode: 'enforcing',
        },
        {
          id: 'ev-optional-profile',
          artifactRef: 'perf-profile-001',
          required: false,
          mode: 'advisory',
        },
      ],
    };

    const receipts: readonly EvidenceReceipt[] = [
      {
        obligationId: 'ev-diff',
        artifactRef: 'diff-001',
        digest: 'sha256-abc',
        verified: true,
      },
    ];

    const result = validateObligationCompleteness(task, receipts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.fulfilled).toEqual(['ev-diff']);
      expect(result.value.missing).toHaveLength(0);
      expect(result.value.unmetAdvisory).toEqual(['ev-optional-profile']);
    }
  });

  it('legacy clients without obligations cannot satisfy an enforcing boundary requiring obligations', () => {
    const legacyTask: TaskContract = {
      ...baseValidTask(),
      evidenceObligations: [],
    };

    const result = validateObligationCompleteness(legacyTask, [], {
      requireEnforcingObligations: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('ZeroObligationsRejectedInEnforcingMode');
    }
  });
});

describe('Task T05: Missing Capability Detection', () => {
  it('detects when all required enforcing capabilities are satisfied', () => {
    const required: readonly CapabilityRequirement[] = [
      { id: 'cap-read', operation: 'artifact.read', mode: 'enforcing' },
      { id: 'cap-vote', operation: 'consensus.vote', mode: 'enforcing' },
    ];
    const available = ['artifact.read', 'consensus.vote', 'shell.exec'];

    const result = detectMissingCapabilities(required, available);
    expect(result.satisfied).toBe(true);
    expect(result.missingEnforcing).toHaveLength(0);
  });

  it('identifies explicit capability deficiency when an enforcing capability is missing', () => {
    const required: readonly CapabilityRequirement[] = [
      { id: 'cap-read', operation: 'artifact.read', mode: 'enforcing' },
      { id: 'cap-container-mount', operation: 'mount.bind', mode: 'enforcing' },
    ];
    const available = ['artifact.read'];

    const result = detectMissingCapabilities(required, available);
    expect(result.satisfied).toBe(false);
    expect(result.missingEnforcing).toHaveLength(1);
    expect(result.missingEnforcing[0]?.id).toBe('cap-container-mount');
    expect(result.missingEnforcing[0]?.operation).toBe('mount.bind');
  });

  it('does not fail satisfaction when only an advisory capability is missing', () => {
    const required: readonly CapabilityRequirement[] = [
      { id: 'cap-read', operation: 'artifact.read', mode: 'enforcing' },
      { id: 'cap-speed-opt', operation: 'cache.gpu_warm', mode: 'advisory' },
    ];
    const available = ['artifact.read'];

    const result = detectMissingCapabilities(required, available);
    expect(result.satisfied).toBe(true);
    expect(result.missingEnforcing).toHaveLength(0);
    expect(result.missingAdvisory).toHaveLength(1);
    expect(result.missingAdvisory[0]?.id).toBe('cap-speed-opt');
  });
});

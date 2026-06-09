/**
 * Tests for the auto-remediation deps assembly (#3671).
 * Audit-ready (research+vote wired); enforce fail-closed (stub implement,
 * not-ready readiness, null lease when unconfigured).
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, vi } from 'vitest';
import { buildAutoRemediationDeps } from './auto-remediation-deps.js';
import { runAutoRemediation } from './improvement-remediation-enforce.js';
import { RemediationGuard } from './improvement-remediation-guard.js';
import { parseRemediationPlan, CapabilityLedger } from './improvement-remediation-capability.js';
import type { ImprovementSignal } from './improvement-review.js';
import {
  createRemediationSoakSink,
  getRemediationSoakFile,
  _resetRemediationSoakSinkForTests,
  type RemediationSoakRecord,
} from './improvement-remediation-shadow.js';
import {
  createRemediationReviewStore,
  getRemediationReviewFile,
  _resetRemediationReviewStoreForTests,
  soakRefOf,
} from './remediation-review.js';

function signal(over: Partial<ImprovementSignal> = {}): ImprovementSignal {
  return {
    category: 'routing',
    signalKey: 'routing:cli-floor:codex:docs',
    severity: 'warning',
    title: 'routing: codex 30% on docs',
    body: 'floor breach',
    evidence: {},
    ...over,
  };
}

describe('buildAutoRemediationDeps', () => {
  it('research produces a strict, parseable typed plan', async () => {
    const deps = buildAutoRemediationDeps();
    const raw = await deps.research(signal(), new CapabilityLedger());
    expect(() => parseRemediationPlan(raw)).not.toThrow();
  });

  it('implement is fail-closed when repo/repoRoot are not configured (#3669)', async () => {
    const deps = buildAutoRemediationDeps(); // no repoRoot
    await expect(
      deps.implement(
        parseRemediationPlan(await deps.research(signal(), new CapabilityLedger())),
        new CapabilityLedger()
      )
    ).rejects.toThrow(/not wired/);
  });

  it('wires the Option B proposal-PR adapter when repo + repoRoot are configured', async () => {
    const deps = buildAutoRemediationDeps({ repo: 'o/n', repoRoot: '/repo', sha: 'abc' });
    // It's no longer the rejecting stub — calling would attempt real git, so just
    // assert the fail-closed stub message is gone (a real adapter is wired).
    const ledger = new CapabilityLedger();
    ledger.enterPhase('research'); // wrong phase → the real adapter fail-closes on capability
    await expect(
      deps.implement(parseRemediationPlan(await deps.research(signal(), ledger)), ledger)
    ).rejects.toThrow(/capability|not permitted/);
  });

  it('lease is null (fail-closed) without a configured repo/sha', async () => {
    const deps = buildAutoRemediationDeps();
    expect(await deps.acquireLease('auto-remediation')).toBeNull();
  });

  it('readiness is fail-closed (not-ready) when no soak/review data exists', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'deps-empty-'));
    const prev = process.env['NEXUS_DATA_DIR'];
    process.env['NEXUS_DATA_DIR'] = dir;
    _resetRemediationSoakSinkForTests();
    _resetRemediationReviewStoreForTests();
    try {
      const deps = buildAutoRemediationDeps();
      const ev = await deps.readinessEvidence();
      expect(ev.shadowSelections).toBe(0);
      expect(ev.judgedSelections).toBe(0);
      expect(ev.evaluator).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env['NEXUS_DATA_DIR'];
      else process.env['NEXUS_DATA_DIR'] = prev;
      _resetRemediationSoakSinkForTests();
      _resetRemediationReviewStoreForTests();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('readiness provider returns REAL evidence built from the durable soak + review stores (#3764)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'deps-real-'));
    const prev = process.env['NEXUS_DATA_DIR'];
    process.env['NEXUS_DATA_DIR'] = dir;
    _resetRemediationSoakSinkForTests();
    _resetRemediationReviewStoreForTests();
    try {
      const soakSink = createRemediationSoakSink(getRemediationSoakFile());
      const soakRecord: RemediationSoakRecord = {
        timestamp: '2026-06-08T00:00:00.000Z',
        signalKey: 'routing:floor:codex',
        category: 'routing',
        priority: 'p2',
        severity: 'warning',
        planStepCount: 3,
        reason: 'plan produced',
      };
      soakSink.record(soakRecord);
      const reviewStore = createRemediationReviewStore(getRemediationReviewFile());
      reviewStore.record({
        soakRef: soakRefOf(soakRecord),
        reviewedAt: '2026-06-08T01:00:00.000Z',
        reviewed: true,
        sound: true,
        evaluator: 'alice',
        owner: 'carol',
      });
      // Fresh singletons hydrate from the files the provider reads.
      _resetRemediationSoakSinkForTests();
      _resetRemediationReviewStoreForTests();

      const deps = buildAutoRemediationDeps();
      const ev = await deps.readinessEvidence();
      expect(ev.shadowSelections).toBe(1);
      expect(ev.judgedSelections).toBe(1);
      expect(ev.judgedSound).toBe(1);
      expect(ev.evaluator).toBe('alice');
      expect(ev.owner).toBe('carol');
    } finally {
      if (prev === undefined) delete process.env['NEXUS_DATA_DIR'];
      else process.env['NEXUS_DATA_DIR'] = prev;
      _resetRemediationSoakSinkForTests();
      _resetRemediationReviewStoreForTests();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('audit run does not consult readiness (audit path untouched by the readiness wiring)', async () => {
    const deps = buildAutoRemediationDeps({
      voteRunner: async () => Promise.resolve({ approved: true, approvalPercentage: 100 }),
    });
    const readinessSpy = vi.spyOn(deps, 'readinessEvidence');
    await runAutoRemediation([signal()], deps, {
      mode: 'audit',
      now: 0,
      guard: new RemediationGuard(),
    });
    expect(readinessSpy).not.toHaveBeenCalled();
  });

  it('drives a full AUDIT run end-to-end on built pieces (soak data, zero writes)', async () => {
    // audit: research + vote, stop before implement. Inject an approving vote runner.
    const deps = buildAutoRemediationDeps({
      voteRunner: async () => Promise.resolve({ approved: true, approvalPercentage: 100 }),
    });
    const implementSpy = vi.spyOn(deps, 'implement');
    const r = await runAutoRemediation([signal()], deps, {
      mode: 'audit',
      now: 0,
      guard: new RemediationGuard(),
    });
    expect(r.mode).toBe('audit');
    expect(r.plans).toHaveLength(1); // research+vote ran
    expect(r.remediated).toEqual([]); // no writes in audit
    expect(implementSpy).not.toHaveBeenCalled();
  });
});

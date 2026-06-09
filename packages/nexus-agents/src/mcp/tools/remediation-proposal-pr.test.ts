/**
 * Tests for the Option B proposal-PR adapter (#3669).
 * Secret-scan before any side effect (fail-closed); isolated worktree; cleanup in finally.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  makeProposalPrImplementAdapter,
  buildProposalDoc,
  type WorktreeOps,
  type PrCreator,
} from './remediation-proposal-pr.js';
import { CapabilityLedger } from './improvement-remediation-capability.js';
import type { RemediationPlan } from './improvement-remediation-capability.js';

function plan(over: Partial<RemediationPlan> = {}): RemediationPlan {
  return {
    signalKey: 'routing:cli-floor:codex:docs',
    category: 'routing',
    summary: 'Route docs away from the underperformer.',
    steps: [{ kind: 'adjust-routing', description: 'lower codex docs weight' }],
    ...over,
  };
}

function implementLedger(): CapabilityLedger {
  const l = new CapabilityLedger();
  l.enterPhase('implement');
  return l;
}

function fakeOps(): { ops: WorktreeOps; calls: string[] } {
  const calls: string[] = [];
  const ops: WorktreeOps = {
    addWorktree: vi.fn(async (b: string) => {
      calls.push(`add:${b}`);
      return Promise.resolve(`/wt/${b.replace(/\//g, '_')}`);
    }),
    writeFileIn: vi.fn(async (_wt: string, rel: string) => {
      calls.push(`write:${rel}`);
      return Promise.resolve();
    }),
    commitAll: vi.fn(async () => {
      calls.push('commit');
      return Promise.resolve();
    }),
    pushBranch: vi.fn(async (_wt: string, b: string) => {
      calls.push(`push:${b}`);
      return Promise.resolve();
    }),
    removeWorktree: vi.fn(async () => {
      calls.push('remove');
      return Promise.resolve();
    }),
  };
  return { ops, calls };
}

const okPr: PrCreator = { createDraftPr: vi.fn(async () => Promise.resolve('https://pr/9')) };

describe('buildProposalDoc', () => {
  it('renders an inert markdown proposal containing the plan', () => {
    const doc = buildProposalDoc(plan());
    expect(doc).toContain(plan().signalKey);
    expect(doc).toContain('proposal');
    expect(doc).toContain('[adjust-routing]');
  });
});

describe('makeProposalPrImplementAdapter', () => {
  it('worktree → write → commit → push → PR → cleanup, in order', async () => {
    const { ops, calls } = fakeOps();
    const implement = makeProposalPrImplementAdapter({ ops, pr: okPr });
    const r = await implement(plan(), implementLedger());
    expect(r.prUrl).toBe('https://pr/9');
    expect(r.branch).toBe('auto-remediation/routing-cli-floor-codex-docs');
    expect(calls).toEqual([
      'add:auto-remediation/routing-cli-floor-codex-docs',
      'write:remediation-plans/routing-cli-floor-codex-docs.md',
      'commit',
      'push:auto-remediation/routing-cli-floor-codex-docs',
      'remove',
    ]);
  });

  it('aborts BEFORE any side effect when the plan doc trips the secret scan', async () => {
    const { ops, calls } = fakeOps();
    const implement = makeProposalPrImplementAdapter({
      ops,
      pr: okPr,
      scan: () => ({ clean: false, findings: [{ pattern: 'github-token', line: 3 }] }),
    });
    await expect(implement(plan(), implementLedger())).rejects.toThrow(/secrets in plan doc/);
    expect(calls).toEqual([]); // no worktree, no push
  });

  it('removes the worktree even if push fails', async () => {
    const { ops, calls } = fakeOps();
    (ops.pushBranch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('push boom'));
    const implement = makeProposalPrImplementAdapter({ ops, pr: okPr });
    await expect(implement(plan(), implementLedger())).rejects.toThrow('push boom');
    expect(calls).toContain('remove'); // finally cleanup ran
  });

  it('does NOT clean up a worktree that was never created when addWorktree fails', async () => {
    const { ops, calls } = fakeOps();
    (ops.addWorktree as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('add boom'));
    const implement = makeProposalPrImplementAdapter({ ops, pr: okPr });
    await expect(implement(plan(), implementLedger())).rejects.toThrow('add boom');
    // The `finally` lives inside the `try` that opens AFTER addWorktree resolves,
    // so removeWorktree must never run on a worktree that was never created.
    expect(ops.removeWorktree).not.toHaveBeenCalled();
    // Nothing downstream ran either — no write/commit/push, no cleanup.
    expect(calls).toEqual([]);
    expect(ops.writeFileIn).not.toHaveBeenCalled();
  });

  it('cleans up the worktree (once, by path) when commitAll fails after add succeeds', async () => {
    const { ops, calls } = fakeOps();
    (ops.commitAll as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('commit boom'));
    const implement = makeProposalPrImplementAdapter({ ops, pr: okPr });
    await expect(implement(plan(), implementLedger())).rejects.toThrow('commit boom');
    // addWorktree resolved, so the `finally` MUST remove the worktree it created —
    // exactly once, with the path addWorktree returned.
    expect(ops.removeWorktree).toHaveBeenCalledTimes(1);
    expect(ops.removeWorktree).toHaveBeenCalledWith(
      '/wt/auto-remediation_routing-cli-floor-codex-docs'
    );
    expect(calls).toEqual([
      'add:auto-remediation/routing-cli-floor-codex-docs',
      'write:remediation-plans/routing-cli-floor-codex-docs.md',
      'remove',
    ]);
    expect(ops.pushBranch).not.toHaveBeenCalled(); // never reached push
  });

  it('fail-closes if invoked outside the IMPLEMENT phase (no repo-write capability)', async () => {
    const { ops } = fakeOps();
    const researchLedger = new CapabilityLedger();
    researchLedger.enterPhase('research'); // no repo-write
    const implement = makeProposalPrImplementAdapter({ ops, pr: okPr });
    await expect(implement(plan(), researchLedger)).rejects.toThrow();
  });
});

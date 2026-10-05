/** Independent review consumes the persisted signal and plan, without the prior verdict. */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as voteStore from '../../audit/vote-record-store.js';
import { FAKE_GITHUB_PAT } from '../../testing/test-secrets.js';
import { buildAutoRemediationDeps } from './auto-remediation-deps.js';
import { runAutoRemediationCycle } from './auto-remediation-cycle.js';
import { createRemediationSoakSink, scrubSoakRecord } from './improvement-remediation-shadow.js';
import { buildRemediationPlanFromSignal } from './remediation-research.js';
import { buildRemediationPanelProposal } from './remediation-review-proposal.js';
import type { ImprovementSignal } from './improvement-review.js';

const signal: ImprovementSignal = {
  signalKey: 'routing:cli-floor:codex:docs',
  category: 'routing',
  severity: 'warning',
  title: 'Codex docs success rate fell below the routing floor',
  body: 'Only 12 of 40 documentation tasks succeeded in the last week.',
  evidence: { samples: 40, window: '7d', observedValue: 0.3, threshold: 0.6 },
};
const plan = buildRemediationPlanFromSignal(signal);
const artifact = {
  timestamp: '2026-09-30T12:00:00.000Z',
  signalKey: signal.signalKey,
  category: signal.category,
  priority: 'p2',
  severity: signal.severity,
  signalTitle: signal.title,
  signalDescription: signal.body,
  signalEvidence: signal.evidence,
  planSteps: plan.steps,
  planStepCount: plan.steps.length,
  voteOutcome: { approved: false, approvalPercentage: 33 },
  reason: 'higher_order: rejected (33%)',
  dryRunResult: 'earlier panel rejected the plan',
};
let dir: string;
let previousDataDir: string | undefined;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'remediation-proposal-'));
  previousDataDir = process.env['NEXUS_DATA_DIR'];
  process.env['NEXUS_DATA_DIR'] = dir;
});
afterEach(() => {
  if (previousDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
  else process.env['NEXUS_DATA_DIR'] = previousDataDir;
  rmSync(dir, { recursive: true, force: true });
});

describe('independent remediation proposal', () => {
  it('persists the actual cycle signal and selected plan for an independent panel', async () => {
    const file = join(dir, 'soak.jsonl');
    const soakSink = createRemediationSoakSink(file);
    const deps = buildAutoRemediationDeps({
      voteRunner: () => Promise.resolve({ approved: false, approvalPercentage: 33 }),
    });
    await runAutoRemediationCycle(
      { mode: 'audit' },
      {
        collectSignals: () => Promise.resolve([signal]),
        deps,
        soakSink,
        runCodePrSoak: () => undefined,
      }
    );
    const raw = readFileSync(file, 'utf-8').trim();
    const stored: unknown = JSON.parse(raw);
    expect(stored).toMatchObject({
      signalTitle: signal.title,
      signalDescription: signal.body,
      signalEvidence: signal.evidence,
      planSteps: plan.steps,
    });
    const proposal = buildRemediationPanelProposal(raw);
    expect(proposal).toContain(signal.title);
    expect(proposal).toContain(signal.body);
    expect(proposal).toContain('"observedValue": 0.3');
    for (const step of plan.steps) expect(proposal).toContain(JSON.stringify(step.description));
    expect(proposal).not.toContain('rejected');
    expect(proposal).not.toContain('33%');
  });

  it('allowlists artifact content while excluding prior vote fields and text', () => {
    const proposal = buildRemediationPanelProposal(
      JSON.stringify({ ...artifact, approvalPercentage: 33, futureVerdict: 'approved previously' })
    );
    expect(proposal).toContain(signal.body);
    expect(proposal).toContain('"samples": 40');
    expect(proposal).toContain(JSON.stringify(plan.steps[2]?.description));
    for (const excluded of [
      'voteOutcome',
      'reason',
      'approvalPercentage',
      'higher_order',
      '33%',
      'dryRunResult',
      'rejected',
      'futureVerdict',
      'approved previously',
    ])
      expect(proposal).not.toContain(excluded);
  });

  it('scrubs newly persisted artifact text including plan path hints and evidence windows', () => {
    const scrubbed = scrubSoakRecord({
      ...artifact,
      signalTitle: FAKE_GITHUB_PAT,
      signalDescription: FAKE_GITHUB_PAT,
      signalEvidence: { ...signal.evidence, window: FAKE_GITHUB_PAT },
      planSteps: [{ kind: 'add-test', description: FAKE_GITHUB_PAT, targetPath: FAKE_GITHUB_PAT }],
    });
    expect(JSON.stringify(scrubbed)).not.toContain(FAKE_GITHUB_PAT);
    expect(JSON.stringify(scrubbed)).toContain('[redacted:');
  });

  it('exports the proposal retention bound for writer and verifier consumers', () => {
    expect(voteStore).toHaveProperty('MAX_PROPOSAL_RECORD_CHARS', 500);
  });
});

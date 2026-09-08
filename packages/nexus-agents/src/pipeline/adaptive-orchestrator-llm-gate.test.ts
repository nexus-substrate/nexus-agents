/**
 * The `NEXUS_LLM_CLASSIFICATION` gate, exercised through the public entry
 * point (#5464).
 *
 * `llmClassificationEnabled` is module-private, so this drives
 * `runAdaptiveOrchestrator` with a task that scores zero keyword confidence
 * and asserts on the seam the gate actually guards: whether `executeExpert`
 * is called. Wave 2 of #5155 widens the read from the literal `1` to the one
 * accept-set shared by every `NEXUS_*` boolean, so `=true` — the spelling
 * documented for its neighbours in the same table — has to open the gate too.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const executeExpertMock = vi.fn();

vi.mock('./expert-bridge.js', () => ({
  executeExpert: executeExpertMock,
}));

vi.mock('./pipeline-observability.js', () => ({
  emitPipelineStageEvent: vi.fn(),
}));

vi.mock('../orchestration/outcomes/outcome-store.js', () => ({
  getOutcomeStore: vi.fn().mockReturnValue({
    append: vi.fn(),
    query: vi.fn().mockReturnValue([]),
  }),
}));

import { classifyTask, runAdaptiveOrchestrator } from './adaptive-orchestrator.js';
import { createDevStageRegistry } from './stage-wrappers.js';
import type { DevPipelineStages } from './dev-pipeline.js';

/** Scores zero keyword matches, which is what puts it under the refinement floor. */
const AMBIGUOUS_TASK = 'qqq zzz wob';

function stages(): ReturnType<typeof createDevStageRegistry> {
  const mock = {
    research: vi.fn().mockResolvedValue({ text: '', insights: [], sources: [] }),
    plan: vi.fn().mockResolvedValue('Plan'),
    vote: vi.fn().mockResolvedValue({ kind: 'approved', approvalPercentage: 83 }),
    decompose: vi.fn().mockResolvedValue([]),
    implement: vi.fn().mockResolvedValue('Done'),
    qaReview: vi.fn().mockResolvedValue({ verdict: 'pass', feedback: '', issues: [] }),
    securityScan: vi.fn().mockResolvedValue({ passed: true, verdict: 'pass', feedback: '' }),
  } as unknown as DevPipelineStages;
  return createDevStageRegistry(mock);
}

async function run(): Promise<void> {
  await runAdaptiveOrchestrator(AMBIGUOUS_TASK, { stages: stages(), dryRun: true });
}

describe('NEXUS_LLM_CLASSIFICATION gate (#5464)', () => {
  beforeEach(() => {
    executeExpertMock.mockReset();
    executeExpertMock.mockResolvedValue({ success: false, output: '' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('the fixture task really is below the refinement floor', () => {
    // Otherwise every case below would pass for the wrong reason: an
    // above-floor task never reaches the gate at all.
    expect(classifyTask(AMBIGUOUS_TASK).confidence).toBe(0);
  });

  it('does not call the classifier when the flag is unset', async () => {
    vi.stubEnv('NEXUS_LLM_CLASSIFICATION', undefined);
    await run();
    expect(executeExpertMock).not.toHaveBeenCalled();
  });

  it.each(['1', 'true', 'TRUE'])('calls the classifier when the flag is %s', async (value) => {
    vi.stubEnv('NEXUS_LLM_CLASSIFICATION', value);
    await run();
    expect(executeExpertMock).toHaveBeenCalled();
  });

  it.each(['0', 'false', 'yes'])('does not call the classifier when the flag is %s', async (value) => {
    vi.stubEnv('NEXUS_LLM_CLASSIFICATION', value);
    await run();
    expect(executeExpertMock).not.toHaveBeenCalled();
  });
});

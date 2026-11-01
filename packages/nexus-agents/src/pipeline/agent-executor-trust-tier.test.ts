/**
 * Trust-tier recording on the shared executor path (#4694).
 *
 * RECORD-ONLY by design. The consensus vote (7-0, option D, 6/7 selections)
 * established that enforcement cannot land yet: the tier was unreachable at
 * every candidate guard site, so a fail-closed guard would have blocked every
 * `pipeline` and `research` run rather than only untrusted ones.
 *
 * The property these tests protect is that the record is HONEST — an
 * unmeasured tier must be recorded as unmeasured, never as a trusted default.
 * Four voters made that an explicit condition of approving the record-first
 * approach.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IAuditLogger } from '../audit/audit-types.js';
import { PolicyBlockedError } from './policy-evaluator.js';
import { getPipelineEventBus } from './event-bus.js';

const { executeExpertMock } = vi.hoisted(() => ({
  executeExpertMock: vi.fn((expertType: string) =>
    Promise.resolve({ success: true, text: 'ok', expertType, durationMs: 1, tokensUsed: 1 })
  ),
}));

vi.mock('./expert-bridge.js', () => ({
  executeExpert: executeExpertMock,
}));

// Keep external research, voters and shell checks outside this event-contract test.
vi.mock('../mcp/tools/research-discover.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mcp/tools/research-discover.js')>()),
  executeDiscovery: vi.fn().mockRejectedValue(new Error('research unavailable')),
}));
vi.mock('../mcp/tools/consensus-vote.js', () => ({
  executeVoting: vi.fn().mockRejectedValue(new Error('voters unavailable')),
}));
vi.mock('../security/quality-gate.js', () => ({
  runQualityGate: vi.fn().mockResolvedValue({ verdict: 'pass', feedback: '' }),
  checkTypeCheck: vi.fn(),
  checkLint: vi.fn(),
  checkTests: vi.fn(),
}));
vi.mock('./security-gate.js', () => ({
  checkSecurityScan: () => vi.fn().mockResolvedValue({ verdict: 'pass', feedback: '' }),
}));

const { emitMock } = vi.hoisted(() => ({
  emitMock: vi.fn<typeof import('./pipeline-observability.js').emitPipelineStageEvent>(),
}));
vi.mock('./pipeline-observability.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./pipeline-observability.js')>();
  return { ...actual, emitPipelineStageEvent: emitMock };
});

import { createAgentStages, UNMEASURED_TRUST_TIER } from './agent-executor.js';

beforeEach(() => {
  emitMock.mockClear();
  executeExpertMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Trust tiers recorded on every `started` event emitted so far. */
function recordedTiers(): unknown[] {
  return emitMock.mock.calls.filter((c) => c[2] === 'started').map((c) => c[3]?.['trustTier']);
}

describe('trust tier is recorded at stage entry (#4694)', () => {
  it('records the tier the caller supplied', async () => {
    const stages = createAgentStages({ trustTier: '3' });
    await stages.implement({
      id: 't1',
      title: 'x',
      description: 'y',
      writeTargets: { kind: 'workspace-relative', paths: ['src/x.ts'] },
    } as never);
    expect(recordedTiers()).toContain('3');
  });

  it('records an ABSENT tier as unmeasured, never as a trusted default', async () => {
    // The named empty case. Omitting the field, or defaulting it to '1', would
    // make an unmeasured run indistinguishable from a trusted one in the
    // record — and the record is the artifact a later human spot-check trusts.
    const stages = createAgentStages({});
    await stages.implement({
      id: 't2',
      title: 'x',
      description: 'y',
      writeTargets: { kind: 'workspace-relative', paths: ['src/x.ts'] },
    } as never);

    const tiers = recordedTiers();
    expect(tiers).toContain(UNMEASURED_TRUST_TIER);
    expect(tiers).not.toContain('1');
    expect(tiers).not.toContain(undefined);
  });

  it('the unmeasured sentinel is not a valid trust tier', () => {
    // Guards against someone "tidying" this into '1'..'4'. If the sentinel ever
    // becomes a real tier value, absence starts reading as a measurement.
    expect(['1', '2', '3', '4']).not.toContain(UNMEASURED_TRUST_TIER);
  });

  it('stamps EVERY stage entry, including the consensus path', async () => {
    // runExpert and executeVoting are parallel model paths — a guard on
    // runExpert alone would have missed the whole consensus voter fan-out.
    // Stage entry is the point both pass through, which is why the tier is
    // recorded here rather than at the expert call.
    const stages = createAgentStages({ trustTier: '2' });
    await stages.qaReview({ id: 't3', title: 'x', description: 'y' } as never, 'impl');

    const started = emitMock.mock.calls.filter((c) => c[2] === 'started');
    expect(started.length).toBeGreaterThan(0);
    for (const call of started) {
      const details = call[3];
      expect(details?.['trustTier'], `stage '${call[1]}' recorded no tier`).toBe('2');
    }
  });
});

describe('caller authentication and sanitizer observations (#4733)', () => {
  it.each([
    [{}, 'unmeasured', 'unmeasured'],
    [{ trustTier: '2' }, '2', 'unmeasured'],
    [{ callerTrustTier: '1', trustTier: '3', inputSanitization: 'unmodified' }, '1', 'unmodified'],
    [
      {
        callerTrustTier: '3',
        inputSanitization: 'modified',
        inputSanitizationCounts: { tagsRemoved: 2, commentsRemoved: 1, fieldsModified: 1 },
      },
      '3',
      'modified',
    ],
  ] as const)('stamps all eight entries for config %j', async (config, tier, sanitization) => {
    executeExpertMock.mockImplementation((expertType: string) =>
      Promise.resolve({
        success: true,
        text:
          expertType === 'pm'
            ? JSON.stringify([
                {
                  id: 'task-4733',
                  title: 'feature',
                  description: 'implement feature',
                  writeTargets: { kind: 'workspace-relative', paths: ['src/feature.ts'] },
                },
              ])
            : 'ok',
        expertType,
        durationMs: 1,
        tokensUsed: 1,
      })
    );
    const stages = createAgentStages(config);
    const task = {
      id: 'task-4733',
      title: 'feature',
      description: 'implement feature',
      writeTargets: { kind: 'workspace-relative', paths: ['src/feature.ts'] },
    } as never;
    await stages.research('research feature');
    await stages.plan('feature', 'research');
    await stages.vote('plan', 'research');
    await stages.decompose('plan');
    await stages.implement(task);
    await stages.qaReview(task, 'implementation');
    if (stages.qualityGate === undefined) throw new Error('quality gate stage missing');
    await stages.qualityGate();
    await stages.securityScan();
    const started = emitMock.mock.calls.filter((call) => call[2] === 'started');
    expect(started.map((call) => call[1])).toEqual([
      'research',
      'plan',
      'vote',
      'decompose',
      'impl-task-4733',
      'qa-task-4733',
      'quality-gate',
      'security',
    ]);
    for (const call of started) {
      expect(call[3]).toMatchObject({
        callerTrustTier: tier,
        trustTier: tier,
        inputSanitization: sanitization,
      });
      const details = call[3] as Record<string, unknown>;
      expect(details['inputSanitizationCounts']).toEqual(
        sanitization === 'modified'
          ? { tagsRemoved: 2, commentsRemoved: 1, fieldsModified: 1 }
          : undefined
      );
    }
  });
});

function capturePolicyEvents(): { readonly events: string[]; readonly off: () => void } {
  const events: string[] = [];
  const off = getPipelineEventBus().subscribe({ type: 'policy.evaluated' }, (event) => {
    if (event.type === 'policy.evaluated') {
      events.push(event.gateId);
    }
  });
  return { events, off };
}

describe('trust tier enforcement at stage boundary (#4694)', () => {
  it('blocks untrusted caller (tier 3) on implement stage in block mode and does not call expert', async () => {
    vi.stubEnv('NEXUS_POLICY_GATE_MODE', 'block');
    const stages = createAgentStages({ callerTrustTier: '3' });
    const task = {
      id: 't-untrusted',
      title: 'feature',
      description: 'desc',
      writeTargets: { kind: 'workspace-relative', paths: ['src/task.ts'] },
    } as never;

    await expect(stages.implement(task)).rejects.toBeInstanceOf(PolicyBlockedError);
    expect(executeExpertMock).not.toHaveBeenCalled();
  });

  it('fails closed: blocks unmeasured/absent caller on implement stage in block mode', async () => {
    vi.stubEnv('NEXUS_POLICY_GATE_MODE', 'block');
    const stages = createAgentStages({});
    const task = {
      id: 't-unmeasured',
      title: 'feature',
      description: 'desc',
      writeTargets: { kind: 'workspace-relative', paths: ['src/task.ts'] },
    } as never;

    await expect(stages.implement(task)).rejects.toBeInstanceOf(PolicyBlockedError);
    expect(executeExpertMock).not.toHaveBeenCalled();
  });

  it('allows benign population (tier 1 and tier 2) on implement stage in block mode', async () => {
    vi.stubEnv('NEXUS_POLICY_GATE_MODE', 'block');
    const stages1 = createAgentStages({ callerTrustTier: '1' });
    const task1 = {
      id: 't-tier1',
      title: 'feature',
      description: 'desc',
      writeTargets: { kind: 'workspace-relative', paths: ['src/task.ts'] },
    } as never;
    await expect(stages1.implement(task1)).resolves.toBeDefined();
    expect(executeExpertMock).toHaveBeenCalledTimes(1);

    executeExpertMock.mockClear();
    const stages2 = createAgentStages({ callerTrustTier: '2' });
    const task2 = {
      id: 't-tier2',
      title: 'feature',
      description: 'desc',
      writeTargets: { kind: 'workspace-relative', paths: ['src/task.ts'] },
    } as never;
    await expect(stages2.implement(task2)).resolves.toBeDefined();
    expect(executeExpertMock).toHaveBeenCalledTimes(1);
  });

  it('does not block planning/analysis stages even for untrusted or unmeasured callers', async () => {
    vi.stubEnv('NEXUS_POLICY_GATE_MODE', 'block');
    const stages = createAgentStages({ callerTrustTier: '3' });
    const task = { id: 't-analysis', title: 'feature', description: 'desc' } as never;

    // Research, plan, decompose, qaReview, qualityGate, securityScan are non-execute stages
    await expect(stages.plan('feature', 'research')).resolves.toBeDefined();
    await expect(stages.decompose('plan')).resolves.toBeDefined();
    await expect(stages.qaReview(task, 'impl')).resolves.toBeDefined();
    if (stages.qualityGate !== undefined) {
      await expect(stages.qualityGate()).resolves.toBeDefined();
    }
    await expect(stages.securityScan()).resolves.toBeDefined();
  });

  it('warn mode (default) emits policy.evaluated event with allowed:false and continues execution', async () => {
    vi.stubEnv('NEXUS_POLICY_GATE_MODE', 'warn');
    const cap = capturePolicyEvents();
    try {
      const stages = createAgentStages({ callerTrustTier: '3' });
      const task = {
        id: 't-warn',
        title: 'feature',
        description: 'desc',
        writeTargets: { kind: 'workspace-relative', paths: ['src/task.ts'] },
      } as never;

      await expect(stages.implement(task)).resolves.toBeDefined();
      expect(executeExpertMock).toHaveBeenCalledTimes(1);
      expect(cap.events).toContain('impl-t-warn:trust-tier');
    } finally {
      cap.off();
    }
  });

  it('block mode emits policy.evaluated before throwing PolicyBlockedError', async () => {
    vi.stubEnv('NEXUS_POLICY_GATE_MODE', 'block');
    let emittedBeforeThrow = false;
    const off = getPipelineEventBus().subscribe({ type: 'policy.evaluated' }, () => {
      emittedBeforeThrow = true;
    });
    try {
      const stages = createAgentStages({ callerTrustTier: '3' });
      const task = {
        id: 't-order',
        title: 'feature',
        description: 'desc',
        writeTargets: { kind: 'workspace-relative', paths: ['src/task.ts'] },
      } as never;
      await stages.implement(task);
      throw new Error('expected PolicyBlockedError');
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(PolicyBlockedError);
      expect(emittedBeforeThrow).toBe(true);
    } finally {
      off();
    }
  });

  it('off mode skips evaluation entirely — no policy.evaluated event emitted', async () => {
    vi.stubEnv('NEXUS_POLICY_GATE_MODE', 'off');
    const cap = capturePolicyEvents();
    try {
      const stages = createAgentStages({ callerTrustTier: '3' });
      const task = {
        id: 't-off',
        title: 'feature',
        description: 'desc',
        writeTargets: { kind: 'workspace-relative', paths: ['src/task.ts'] },
      } as never;

      await expect(stages.implement(task)).resolves.toBeDefined();
      expect(executeExpertMock).toHaveBeenCalledTimes(1);
      expect(cap.events).toHaveLength(0);
    } finally {
      cap.off();
    }
  });

  it('appends policy_gate violation record to durable auditLogger when configured (dual-emit)', async () => {
    vi.stubEnv('NEXUS_POLICY_GATE_MODE', 'warn');
    const loggedEntries: Array<{ action: string; details: unknown }> = [];
    const auditLogger = {
      log: vi.fn((entry: { action: string; metadata?: unknown }) => {
        loggedEntries.push({ action: entry.action, details: entry.metadata });
      }),
    } as unknown as IAuditLogger;

    const stages = createAgentStages({ callerTrustTier: '3', auditLogger });
    const task = {
      id: 't-audit',
      title: 'feature',
      description: 'desc',
      writeTargets: { kind: 'workspace-relative', paths: ['src/task.ts'] },
    } as never;
    await stages.implement(task);

    expect(auditLogger.log).toHaveBeenCalled();
    expect(loggedEntries.some((e) => e.action === 'security.policy_gate')).toBe(true);
  });
});

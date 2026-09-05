/**
 * Tests for Correlation Persistence module.
 * Verifies disk persistence for CorrelationTracker voting history.
 * (Source: Issue #514)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Use vi.hoisted for ESM-compatible mocking of node:os
const mocks = vi.hoisted(() => {
  let testHomedir = '/tmp/nexus-test-default';
  return {
    homedir: vi.fn(() => testHomedir),
    tmpdir: vi.fn(() => '/tmp'),
    setTestHomedir: (dir: string) => {
      testHomedir = dir;
    },
  };
});

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return {
    ...original,
    homedir: mocks.homedir,
    default: {
      ...original,
      homedir: mocks.homedir,
    },
  };
});

import {
  getCorrelationDataPath,
  saveCorrelationData,
  loadCorrelationData,
  createPersistentCorrelationTracker,
  createPersistedProposal,
  PersistedCorrelationDataSchema,
} from './correlation-persistence.js';
import type { Vote } from './types-core.js';

// ============================================================================
// Test Helpers
// ============================================================================

/** Creates a test Vote with minimal required fields. */
function makeVote(decision: 'approve' | 'reject' | 'abstain', confidence = 0.8): Vote {
  return { decision, reasoning: `test-${decision}`, confidence };
}

/** Creates a votes map from agent-decision pairs. */
function makeVotesMap(
  entries: Array<[string, 'approve' | 'reject' | 'abstain']>
): Map<string, Vote> {
  const map = new Map<string, Vote>();
  for (const [agentId, decision] of entries) {
    map.set(agentId, makeVote(decision));
  }
  return map;
}

// ============================================================================
// Path Tests
// ============================================================================

describe('getCorrelationDataPath', () => {
  it('should return a path containing .nexus-agents/voting/correlations.json', () => {
    const result = getCorrelationDataPath();

    expect(result).toContain('.nexus-agents');
    expect(result).toContain('voting');
    expect(result).toContain('correlations.json');
    expect(path.isAbsolute(result)).toBe(true);
  });
});

// ============================================================================
// createPersistedProposal Tests
// ============================================================================

describe('createPersistedProposal', () => {
  it('should create correct structure from vote data', () => {
    const votes = makeVotesMap([
      ['architect', 'approve'],
      ['security', 'reject'],
      ['pm', 'approve'],
    ]);

    const proposal = createPersistedProposal('prop-1', votes, 'approved');

    expect(proposal.proposalId).toBe('prop-1');
    expect(proposal.outcome).toBe('approved');
    expect(proposal.votes).toHaveLength(3);
    expect(proposal.timestamp).toBeDefined();
    // Verify ISO datetime format
    expect(() => new Date(proposal.timestamp)).not.toThrow();
  });

  it('should map agent IDs correctly', () => {
    const votes = makeVotesMap([
      ['agent-a', 'approve'],
      ['agent-b', 'reject'],
    ]);

    const proposal = createPersistedProposal('prop-2', votes, 'rejected');

    const agentIds = proposal.votes.map((v) => v.agentId);
    expect(agentIds).toContain('agent-a');
    expect(agentIds).toContain('agent-b');
  });

  it('should preserve vote decisions and confidence', () => {
    const votes = new Map<string, Vote>();
    votes.set('agent-x', { decision: 'approve', reasoning: 'good', confidence: 0.95 });

    const proposal = createPersistedProposal('prop-3', votes, 'approved');

    expect(proposal.votes[0]?.decision).toBe('approve');
    expect(proposal.votes[0]?.confidence).toBe(0.95);
  });

  it('should preserve pinned and observed model provenance', () => {
    const votes = makeVotesMap([['architect', 'approve']]);

    const proposal = createPersistedProposal('prop-model', votes, 'approved', {
      modelPins: new Map([['architect', 'primary-model']]),
      observedModels: new Map([['architect', 'fallback-model']]),
    });

    expect(proposal.votes[0]).toMatchObject({
      modelKey: 'primary-model',
      observedModel: 'fallback-model',
    });
  });

  it('should handle empty votes map', () => {
    const votes = new Map<string, Vote>();
    const proposal = createPersistedProposal('prop-empty', votes, 'rejected');

    expect(proposal.proposalId).toBe('prop-empty');
    expect(proposal.votes).toHaveLength(0);
    expect(proposal.outcome).toBe('rejected');
  });

  it('should produce data that passes schema validation', () => {
    const votes = makeVotesMap([['agent-1', 'approve']]);
    const proposal = createPersistedProposal('schema-test', votes, 'approved');

    const data = {
      version: 1,
      proposals: [proposal],
      savedAt: new Date().toISOString(),
    };

    const result = PersistedCorrelationDataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Persistence Round-Trip Tests (using temp directory)
// ============================================================================

describe('saveCorrelationData and loadCorrelationData', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join('/tmp', 'nexus-corr-test-'));
    mocks.setTestHomedir(testDir);
    // Isolation cannot rest on the homedir mock alone: `NEXUS_DATA_DIR`
    // outranks the homedir branch, so with it set every test in this file
    // shared one directory and state accumulated across them (#4722).
    vi.stubEnv('NEXUS_DATA_DIR', path.join(testDir, '.nexus-agents'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should round-trip save and load correctly', () => {
    const votes = makeVotesMap([
      ['architect', 'approve'],
      ['security', 'approve'],
    ]);
    const proposal = createPersistedProposal('rt-1', votes, 'approved');

    const saveResult = saveCorrelationData([proposal]);
    expect(saveResult.ok).toBe(true);

    const loadResult = loadCorrelationData();
    expect(loadResult.ok).toBe(true);
    if (loadResult.ok) {
      // Schema version 3 adds model provenance — the wrapper
      // shape is the load-result envelope, not what's actually on disk.
      expect(loadResult.value.version).toBe(3);
      expect(loadResult.value.proposals).toHaveLength(1);
      expect(loadResult.value.proposals[0]?.proposalId).toBe('rt-1');
      expect(loadResult.value.proposals[0]?.votes).toHaveLength(2);
    }
  });

  it('should round-trip model keys while retaining legacy votes without them', () => {
    const legacy = createPersistedProposal(
      'legacy-shape',
      makeVotesMap([['architect', 'approve']]),
      'approved'
    );
    const partitioned = createPersistedProposal(
      'partitioned-shape',
      makeVotesMap([['architect', 'reject']]),
      'rejected',
      {
        modelPins: new Map([['architect', 'primary-model']]),
        observedModels: new Map([['architect', 'fallback-model']]),
      }
    );

    expect(saveCorrelationData([legacy, partitioned]).ok).toBe(true);
    const loaded = loadCorrelationData();

    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.value.proposals[0]?.votes[0]).not.toHaveProperty('modelKey');
      expect(loaded.value.proposals[1]?.votes[0]).toMatchObject({
        modelKey: 'primary-model',
        observedModel: 'fallback-model',
      });
    }
  });

  it('should handle missing file gracefully on load', () => {
    const result = loadCorrelationData();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('not found');
    }
  });

  it('should tolerate corrupt legacy correlations.json (skip + warn, return empty)', () => {
    // Pre-#2973 this returned `err('Corrupt')`. Post-#2973 we tolerate
    // legacy-file corruption because it's only one of two stores — corrupt
    // legacy plus missing JSONL surfaces as an empty success envelope so
    // a single bad file doesn't poison the whole load.
    const votingDir = path.join(testDir, '.nexus-agents', 'voting');
    fs.mkdirSync(votingDir, { recursive: true });
    fs.writeFileSync(path.join(votingDir, 'correlations.json'), '{ invalid json !!', 'utf-8');

    const result = loadCorrelationData();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.proposals).toHaveLength(0);
    }
  });

  it('should tolerate invalid legacy correlations.json schema', () => {
    // Same rationale as the corrupt-JSON test above.
    const votingDir = path.join(testDir, '.nexus-agents', 'voting');
    fs.mkdirSync(votingDir, { recursive: true });
    fs.writeFileSync(
      path.join(votingDir, 'correlations.json'),
      JSON.stringify({ version: 1, wrongField: true }),
      'utf-8'
    );

    const result = loadCorrelationData();
    // The legacy file is invalid → skipped. JSONL doesn't exist → no data.
    // The presence of the legacy file means we don't return "not found"
    // anymore; we return an empty success envelope.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.proposals).toHaveLength(0);
    }
  });

  it('should merge proposals across separate saves', () => {
    const votes1 = makeVotesMap([['agent-a', 'approve']]);
    const votes2 = makeVotesMap([['agent-b', 'reject']]);

    const proposal1 = createPersistedProposal('merge-1', votes1, 'approved');
    const proposal2 = createPersistedProposal('merge-2', votes2, 'rejected');

    // Save first proposal
    saveCorrelationData([proposal1]);
    // Save second proposal (should merge with first)
    saveCorrelationData([proposal2]);

    const loadResult = loadCorrelationData();
    expect(loadResult.ok).toBe(true);
    if (loadResult.ok) {
      expect(loadResult.value.proposals).toHaveLength(2);
      const ids = loadResult.value.proposals.map((p) => p.proposalId);
      expect(ids).toContain('merge-1');
      expect(ids).toContain('merge-2');
    }
  });

  it('should deduplicate proposals with same ID, preferring new entry', () => {
    const votesOld = makeVotesMap([['agent-a', 'reject']]);
    const votesNew = makeVotesMap([
      ['agent-a', 'approve'],
      ['agent-b', 'approve'],
    ]);

    const proposalOld = createPersistedProposal('dedup-1', votesOld, 'rejected');
    saveCorrelationData([proposalOld]);

    // Save same proposalId with different data
    const proposalNew = createPersistedProposal('dedup-1', votesNew, 'approved');
    saveCorrelationData([proposalNew]);

    const loadResult = loadCorrelationData();
    expect(loadResult.ok).toBe(true);
    if (loadResult.ok) {
      expect(loadResult.value.proposals).toHaveLength(1);
      // Should have the newer version with 2 votes
      expect(loadResult.value.proposals[0]?.votes).toHaveLength(2);
      expect(loadResult.value.proposals[0]?.outcome).toBe('approved');
    }
  });

  it('should apply FIFO eviction when exceeding maxProposals', () => {
    const proposals = [];
    for (let i = 0; i < 5; i++) {
      const votes = makeVotesMap([['agent-a', 'approve']]);
      const proposal = createPersistedProposal(`evict-${String(i)}`, votes, 'approved');
      proposals.push(proposal);
    }

    // Save unconfigured (#2973: writer is fully append-only). FIFO eviction
    // now applies on load — pass maxProposals there.
    saveCorrelationData(proposals);

    const loadResult = loadCorrelationData({
      minObservationsForCorrelation: 10,
      correlationThreshold: 0.3,
      correlationMaxAgeMs: 86400000,
      independenceThreshold: 0.2,
      fallbackToSimpleVoting: true,
      observationDecayFactor: 0.95,
      maxObservationsPerAgent: 1000,
      maxProposals: 3,
      maxTrackedPairs: 100,
    });
    expect(loadResult.ok).toBe(true);
    if (loadResult.ok) {
      // Should keep only the 3 most recent
      expect(loadResult.value.proposals).toHaveLength(3);
    }
  });

  it('should preserve all proposals when many saves run concurrently (#2973)', async () => {
    // Closes the race the JSONL switch is for: pre-#2973, two
    // saveCorrelationData callers each read-merged-renamed the same
    // correlations.json, so the second writer's snapshot overwrote the
    // first's. With JSONL append-only, every saved proposal lands.
    const proposals = Array.from({ length: 10 }, (_, i) =>
      createPersistedProposal(
        `concurrent-${String(i)}`,
        makeVotesMap([['agent-a', 'approve']]),
        'approved'
      )
    );

    await Promise.all(proposals.map((p) => Promise.resolve(saveCorrelationData([p]))));

    const loadResult = loadCorrelationData();
    expect(loadResult.ok).toBe(true);
    if (loadResult.ok) {
      expect(loadResult.value.proposals).toHaveLength(10);
      const ids = new Set(loadResult.value.proposals.map((p) => p.proposalId));
      for (let i = 0; i < 10; i++) {
        expect(ids.has(`concurrent-${String(i)}`)).toBe(true);
      }
    }
  });

  it('should create directory structure on save', () => {
    const votes = makeVotesMap([['agent-a', 'approve']]);
    const proposal = createPersistedProposal('dir-test', votes, 'approved');

    const result = saveCorrelationData([proposal]);
    expect(result.ok).toBe(true);

    const votingDir = path.join(testDir, '.nexus-agents', 'voting');
    expect(fs.existsSync(votingDir)).toBe(true);
  });
});

// ============================================================================
// Persistent Tracker Factory Tests
// ============================================================================

describe('createPersistentCorrelationTracker', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join('/tmp', 'nexus-tracker-test-'));
    vi.stubEnv('NEXUS_DATA_DIR', path.join(testDir, '.nexus-agents'));
    mocks.setTestHomedir(testDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should return a functional tracker when no persisted data exists', () => {
    const tracker = createPersistentCorrelationTracker();

    expect(tracker).toBeDefined();
    expect(tracker.getStats).toBeDefined();

    const stats = tracker.getStats();
    expect(stats.totalAgents).toBe(0);
    expect(stats.totalObservations).toBe(0);
  });

  it('should record and retrieve stats after recording votes', () => {
    const tracker = createPersistentCorrelationTracker();

    const votes = makeVotesMap([
      ['architect', 'approve'],
      ['security', 'reject'],
    ]);

    tracker.recordProposalVotes('prop-1', votes, 'approved');

    const stats = tracker.getStats();
    expect(stats.totalAgents).toBe(2);
    expect(stats.totalObservations).toBeGreaterThan(0);
  });

  it('should replay persisted proposals into a new tracker', () => {
    // Save some proposals to disk first
    const votes = makeVotesMap([
      ['agent-a', 'approve'],
      ['agent-b', 'reject'],
    ]);
    const proposal = createPersistedProposal('replay-1', votes, 'approved');
    saveCorrelationData([proposal]);

    // Create a new tracker that should replay from disk
    const tracker = createPersistentCorrelationTracker();

    const stats = tracker.getStats();
    expect(stats.totalAgents).toBe(2);
    expect(stats.totalObservations).toBeGreaterThan(0);
  });

  it('loads legacy records into the first pinned model partition', () => {
    const votes = makeVotesMap([
      ['architect', 'approve'],
      ['security', 'approve'],
    ]);
    saveCorrelationData([
      createPersistedProposal('legacy-1', votes, 'approved'),
      createPersistedProposal('legacy-2', votes, 'approved'),
    ]);
    const tracker = createPersistentCorrelationTracker({ minObservationsForCorrelation: 2 });

    tracker.recordProposalVotes(
      'first-pinned',
      new Map([['architect', makeVote('approve')]]),
      'approved',
      {
        modelPins: new Map([
          ['architect', 'architect-model'],
          ['security', 'security-model'],
        ]),
      }
    );

    expect(tracker.hasSufficientData(['architect', 'security'])).toBe(true);
    expect(tracker.getCorrelation('architect', 'security')).toBe(1);
  });

  it('assigns later legacy records to the first model seen for each role', () => {
    const votes = makeVotesMap([
      ['architect', 'approve'],
      ['security', 'approve'],
    ]);
    const keyed = (
      proposalId: string,
      architectModel: string
    ): ReturnType<typeof createPersistedProposal> =>
      createPersistedProposal(proposalId, votes, 'approved', {
        modelPins: new Map([
          ['architect', architectModel],
          ['security', 'security-model'],
        ]),
      });
    saveCorrelationData([
      keyed('model-a', 'architect-a'),
      keyed('model-b', 'architect-b'),
      createPersistedProposal('later-legacy', votes, 'approved'),
    ]);

    const tracker = createPersistentCorrelationTracker({ minObservationsForCorrelation: 2 });

    expect(tracker.hasSufficientData(['architect', 'security'])).toBe(false);
    expect(tracker.setCurrentModelPins).toBeDefined();
    tracker.setCurrentModelPins?.(
      new Map([
        ['architect', 'architect-a'],
        ['security', 'security-model'],
      ])
    );
    expect(tracker.hasSufficientData(['architect', 'security'])).toBe(true);
  });
});

// ============================================================================
// Schema Validation Tests
// ============================================================================

describe('PersistedCorrelationDataSchema', () => {
  it('should accept valid data', () => {
    const data = {
      version: 1,
      proposals: [
        {
          proposalId: 'test-1',
          votes: [{ agentId: 'agent-1', decision: 'approve', confidence: 0.9 }],
          outcome: 'approved',
          timestamp: new Date().toISOString(),
        },
      ],
      savedAt: new Date().toISOString(),
    };

    const result = PersistedCorrelationDataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should reject data with invalid version', () => {
    const data = {
      version: -1,
      proposals: [],
      savedAt: new Date().toISOString(),
    };

    const result = PersistedCorrelationDataSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should reject data with invalid vote decision', () => {
    const data = {
      version: 1,
      proposals: [
        {
          proposalId: 'test-1',
          votes: [{ agentId: 'agent-1', decision: 'maybe', confidence: 0.9 }],
          outcome: 'approved',
          timestamp: new Date().toISOString(),
        },
      ],
      savedAt: new Date().toISOString(),
    };

    const result = PersistedCorrelationDataSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should reject data with confidence out of range', () => {
    const data = {
      version: 1,
      proposals: [
        {
          proposalId: 'test-1',
          votes: [{ agentId: 'agent-1', decision: 'approve', confidence: 1.5 }],
          outcome: 'approved',
          timestamp: new Date().toISOString(),
        },
      ],
      savedAt: new Date().toISOString(),
    };

    const result = PersistedCorrelationDataSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('should reject missing required fields', () => {
    const data = { version: 1 };
    const result = PersistedCorrelationDataSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});

/** CLI detector telemetry through the real vote executor and cost store (#5422). */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentVoteResult, VoterRole } from './vote-types.js';
import { VOTE_RECORDS_PATH_ENV, parseVoteRecordsText } from '../audit/vote-record-store.js';
import { DecisionCostStore } from '../observability/decision-cost-store.js';
import { getDecisionCostFile } from '../config/learning-persistence.js';
import { resetNexusDataDirCache } from '../config/nexus-data-dir.js';
import {
  getDroppedCostRecordCount,
  resetDroppedCostRecordCount,
} from '../mcp/tools/decision-cost-recording.js';

const collectRealVotesMock =
  vi.fn<(opts: { roles: readonly VoterRole[] }) => Promise<readonly AgentVoteResult[]>>();
vi.mock('./voter-agents.js', () => ({
  DEFAULT_VOTE_TIMEOUT_MS: 90_000,
  collectRealVotes: (opts: { roles: readonly VoterRole[] }): Promise<readonly AgentVoteResult[]> =>
    collectRealVotesMock(opts),
}));

import { voteCommand } from './vote-command.js';

function approvingPanel(roles: readonly VoterRole[]): AgentVoteResult[] {
  return roles.map((role) => ({
    role,
    vote: { decision: 'approve', confidence: 0.9, reasoning: 'ok', selectedOption: 'A' },
    source: 'llm',
    cli: 'claude',
    processingTimeMs: 1,
  }));
}

describe('CLI votes persist detector verdicts (#5422)', () => {
  let dataDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];
  const originalLedger = process.env[VOTE_RECORDS_PATH_ENV];

  beforeEach(() => {
    const scratch = join(process.cwd(), '.nexus-agents', 'task-5422', 'tmp');
    mkdirSync(scratch, { recursive: true });
    dataDir = mkdtempSync(join(scratch, 'cli-detector-'));
    process.env['NEXUS_DATA_DIR'] = dataDir;
    process.env[VOTE_RECORDS_PATH_ENV] = join(dataDir, 'vote-records.jsonl');
    resetNexusDataDirCache();
    resetDroppedCostRecordCount();
    collectRealVotesMock.mockReset();
    collectRealVotesMock.mockImplementation(({ roles }) => Promise.resolve(approvingPanel(roles)));
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalDataDir === undefined) Reflect.deleteProperty(process.env, 'NEXUS_DATA_DIR');
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    if (originalLedger === undefined) Reflect.deleteProperty(process.env, VOTE_RECORDS_PATH_ENV);
    else process.env[VOTE_RECORDS_PATH_ENV] = originalLedger;
    resetNexusDataDirCache();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function readCosts(): ReturnType<DecisionCostStore['all']> {
    return new DecisionCostStore({ filePath: getDecisionCostFile(), dataDir }).all();
  }

  it('records fired with pattern and a full-proposal excerpt, correlated to the audit record', async () => {
    const proposal = `${'context. '.repeat(70)}\nOption A — keep it. Option B — migrate.`;
    expect(await voteCommand({ proposal, strategy: 'simple_majority' })).toBe(0);
    const costs = readCosts();
    expect(costs).toHaveLength(1);
    expect(costs[0]?.gate).toBe('consensus_vote');
    expect(costs[0]?.undeclaredOptionsDetector).toMatchObject({
      fired: true,
      source: 'cli',
      pattern: String(/\b(?:Option|OPTION) [A-Z0-9]\b/),
      declaredOptionCount: 0,
    });
    expect(costs[0]?.undeclaredOptionsDetector?.excerpt).toContain('Option A');
    const ledger = parseVoteRecordsText(readFileSync(join(dataDir, 'vote-records.jsonl'), 'utf8'));
    expect(ledger.invalidLines).toEqual([]);
    expect(ledger.records).toHaveLength(1);
    expect(ledger.records[0]?.correlationId).toBe(costs[0]?.decisionId);
  });

  it('records fired false on a proposal without alternatives', async () => {
    expect(await voteCommand({ proposal: 'Ship the rate-limit fix?' })).toBe(0);
    expect(readCosts()).toHaveLength(1);
    expect(readCosts()[0]?.undeclaredOptionsDetector).toEqual({
      fired: false,
      source: 'cli',
      declaredOptionCount: 0,
    });
  });

  it('records declared options as not applicable, with no fired verdict', async () => {
    await voteCommand({ proposal: 'Option A or Option B?', options: ['A', 'B'] });
    expect(readCosts()).toHaveLength(1);
    expect(readCosts()[0]?.undeclaredOptionsDetector).toEqual({
      applicable: false,
      source: 'cli',
      declaredOptionCount: 2,
    });
  });

  it('does not record detector measurements for dry runs', async () => {
    await voteCommand({ proposal: 'Option A or Option B?', dryRun: true });
    expect(readCosts()).toHaveLength(0);
  });

  it('keeps the vote successful and counts a telemetry drop when the cost store is unwritable', async () => {
    mkdirSync(getDecisionCostFile(), { recursive: true });
    expect(await voteCommand({ proposal: 'Ship the fix?' })).toBe(0);
    expect(getDroppedCostRecordCount()).toBe(1);
  });
});

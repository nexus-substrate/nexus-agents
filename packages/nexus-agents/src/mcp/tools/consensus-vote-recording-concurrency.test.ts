/**
 * Cross-process regression for #6531: concurrent `recordAuthenticVote`
 * callers in SEPARATE processes against one ledger.
 *
 * The store reads the ledger tip and then appends, so two processes that read
 * the same tip assigned the same `sequence` (measured: eight writers on a
 * fresh file all wrote sequence 0). O_APPEND kept every line, so the defect was
 * duplicate sequences, not lost lines — both are asserted. The recorder now
 * holds a cross-process lock around the store call.
 *
 * Real child processes, not interleaved promises: the store is synchronous,
 * so in-process calls can never interleave inside it and would pass against
 * an unlocked recorder.
 *
 * @module mcp/tools/consensus-vote-recording-concurrency.test
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { VOTE_RECORDS_PATH_ENV, readVoteRecords } from '../../audit/vote-record-store.js';

const here = dirname(fileURLToPath(import.meta.url));
const recorderModule = pathToFileURL(resolve(here, 'consensus-vote-recording.ts')).href;
const tsxCli = createRequire(import.meta.url).resolve('tsx/cli');

/** Writers per run. Enough that an unlocked tip read collides reliably. */
const WRITERS = 6;
/** Head start for every child to finish loading before the shared start instant. */
const START_DELAY_MS = 5_000;

/**
 * The child: spin until the shared start instant, then record one vote with a
 * large reasoning so each append is a multi-kilobyte write.
 */
const WORKER_SOURCE = `
import { recordAuthenticVote } from ${JSON.stringify(recorderModule)};
const [startAt] = process.argv.slice(2);
while (Date.now() < Number(startAt)) { /* align the start */ }
const now = '2026-09-23T00:00:00.000Z';
const outcome = await recordAuthenticVote({
  declaredOptions: undefined,
  resolvedDecision: undefined,
  errorPolicy: undefined,
  proposal: 'concurrency',
  strategy: 'higher_order',
  result: {
    proposalId: 'p', proposal: { title: 'T', description: 'D', algorithm: 'higher_order' },
    outcome: 'approved', votes: new Map(),
    voteCounts: { approve: 1, reject: 0, abstain: 0, total: 1 },
    approvalPercentage: 100, quorumReached: true, startedAt: now, closedAt: now, durationMs: 1,
  },
  votes: [{ role: 'architect', vote: { decision: 'approve', confidence: 0.8, reasoning: 'x'.repeat(4000) }, processingTimeMs: 1, source: 'llm' }],
});
process.stdout.write(outcome.persisted ? outcome.record.id + ' ' + String(outcome.record.sequence) : 'NOT-WRITTEN ' + outcome.reason);
`;

function runWriter(
  workerPath: string,
  ledger: string,
  startAt: number
): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [tsxCli, workerPath, String(startAt)], {
      env: { ...process.env, NEXUS_LOG_LEVEL: 'error', [VOTE_RECORDS_PATH_ENV]: ledger },
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolvePromise({ code, stdout });
    });
  });
}

describe('recordAuthenticVote across concurrent processes (#6531)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vote-concurrency-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('keeps every record and assigns unique, gap-free sequences', async () => {
    const workerPath = join(dir, 'writer.mts');
    writeFileSync(workerPath, WORKER_SOURCE);
    const ledger = join(dir, 'governance', 'vote-records.jsonl');
    const startAt = Date.now() + START_DELAY_MS;

    const results = await Promise.all(
      Array.from({ length: WRITERS }, () => runWriter(workerPath, ledger, startAt))
    );

    // Every child reported a persisted record — none fell into a failure path.
    expect(results.map((r) => r.code)).toEqual(results.map(() => 0));
    expect(results.filter((r) => r.stdout.startsWith('NOT-WRITTEN'))).toEqual([]);

    const { records, invalidLines } = readVoteRecords(ledger);
    expect(invalidLines).toEqual([]);
    const printed = results.map((r) => r.stdout.split(' '));
    expect(records.map((r) => r.id).sort()).toEqual(printed.map(([id]) => id).sort());
    const sequences = records.map((r) => r.sequence).sort((a, b) => a - b);
    expect(sequences).toEqual(Array.from({ length: WRITERS }, (_, i) => i));
    // What each process reported is what it persisted.
    expect(printed.map(([, seq]) => Number(seq)).sort((a, b) => a - b)).toEqual(sequences);
  }, 120_000);
});

/**
 * Cross-process regression for #6531: concurrent `persistVoteRecord` callers
 * in SEPARATE processes against one ledger.
 *
 * Before the lock, each process read the ledger tip and then appended, so two
 * processes that read the same tip assigned the same `sequence` (measured:
 * eight writers on a fresh file all wrote sequence 0). O_APPEND kept every line,
 * so the defect was duplicate sequences, not lost lines — both are asserted.
 *
 * Real child processes, not interleaved promises: `persistVoteRecord` is
 * synchronous, so in-process calls can never interleave and would pass
 * against the unlocked code.
 *
 * @module audit/vote-record-store-concurrency.test
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readVoteRecords } from './vote-record-store.js';

const here = dirname(fileURLToPath(import.meta.url));
const storeModule = pathToFileURL(resolve(here, 'vote-record-store.ts')).href;
const tsxCli = createRequire(import.meta.url).resolve('tsx/cli');

/** Writers per run. Enough that an unlocked tip read collides reliably. */
const WRITERS = 6;
/** Head start for every child to finish loading before the shared start instant. */
const START_DELAY_MS = 4_000;

/**
 * The child: spin until the shared start instant, then persist one record with
 * a large reasoning so each append is a multi-kilobyte write.
 */
const WORKER_SOURCE = `
import { persistVoteRecord } from ${JSON.stringify(storeModule)};
const [filePath, id, startAt] = process.argv.slice(2);
while (Date.now() < Number(startAt)) { /* align the start */ }
const now = '2026-09-23T00:00:00.000Z';
const record = persistVoteRecord({
  declaredOptions: undefined,
  resolvedDecision: undefined,
  id,
  proposal: 'concurrency',
  strategy: 'higher_order',
  result: {
    proposalId: 'p', proposal: { title: 'T', description: 'D', algorithm: 'higher_order' },
    outcome: 'approved', votes: new Map(),
    voteCounts: { approve: 1, reject: 0, abstain: 0, total: 1 },
    approvalPercentage: 100, quorumReached: true, startedAt: now, closedAt: now, durationMs: 1,
  },
  votes: [{ role: 'architect', vote: { decision: 'approve', confidence: 0.8, reasoning: 'x'.repeat(4000) }, processingTimeMs: 1, source: 'llm' }],
  filePath,
});
process.stdout.write(record === undefined ? 'NOT-WRITTEN' : String(record.sequence));
`;

function runWriter(
  workerPath: string,
  ledger: string,
  id: string,
  startAt: number
): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [tsxCli, workerPath, ledger, id, String(startAt)], {
      env: { ...process.env, NEXUS_LOG_LEVEL: 'error' },
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

describe('persistVoteRecord across concurrent processes (#6531)', () => {
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
    const ids = Array.from({ length: WRITERS }, (_, i) => `vote-concurrent-${String(i)}`);

    const results = await Promise.all(ids.map((id) => runWriter(workerPath, ledger, id, startAt)));

    // Every child reported a written record — none fell into the write-failed path.
    expect(results.map((r) => r.code)).toEqual(ids.map(() => 0));
    expect(results.filter((r) => r.stdout === 'NOT-WRITTEN')).toEqual([]);

    const { records, invalidLines } = readVoteRecords(ledger);
    expect(invalidLines).toEqual([]);
    expect(records.map((r) => r.id).sort()).toEqual([...ids].sort());
    const sequences = records.map((r) => r.sequence).sort((a, b) => a - b);
    expect(sequences).toEqual(ids.map((_, i) => i));
    // What each process printed is what it persisted.
    expect(results.map((r) => Number(r.stdout)).sort((a, b) => a - b)).toEqual(sequences);
  }, 120_000);
});

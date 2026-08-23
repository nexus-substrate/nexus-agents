/**
 * The gap loop across every seam: producer → durable file → new process → consumer.
 *
 * ## Why this file exists
 *
 * #4651's producer shipped with a bug no unit test could see. The persistence
 * guard hardcoded `'tool' | 'expert'`, so every persisted `tool_refusal` loaded
 * as a malformed line: the producer wrote three entries and the next process
 * read zero. Both suites were green — the persistence tests used type `'tool'`,
 * and the producer tests used an in-memory ledger. Nothing crossed the seam
 * between them, so nothing failed.
 *
 * Unit tests prove the parts. This proves the joins, which is where that class
 * of bug lives.
 *
 * @module core/task-analysis/gap-loop.e2e-seam.test
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { checkForCapabilityGapTriggers } from '../../pipeline/research-trigger.js';
import { createPersistentCapabilityGapLedger } from './capability-gap-ledger-persistence.js';
import { recordToolRefusal } from './tool-refusal-gap.js';

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

function ledgerFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gap-loop-'));
  created.push(dir);
  return join(dir, 'capability-gaps.jsonl');
}

describe('the capability-gap loop, end to end', () => {
  it('carries a refusal from producer to research task across a process boundary', () => {
    const filePath = ledgerFile();

    // SESSION 1 — three agent asks that the tool declined.
    const session1 = createPersistentCapabilityGapLedger({ filePath });
    for (const p of ['/svc/a.py', '/svc/b.py', '/svc/c.py']) {
      recordToolRefusal(
        { tool: 'extract_symbols', capability: '.py', suggestion: 'needs a Python parser' },
        { goal: `extract_symbols ${p}` },
        session1
      );
    }
    expect(readFileSync(filePath, 'utf-8').trim().split('\n')).toHaveLength(3);

    // SESSION 2 — a different ledger over the same file, i.e. a later process.
    const session2 = createPersistentCapabilityGapLedger({ filePath });
    expect(session2.loadReport().malformedLines).toBe(0);
    const [gap] = session2.summarize();
    expect(gap?.type).toBe('tool_refusal');
    expect(gap?.name).toBe('extract_symbols:.py');
    expect(gap?.count).toBe(3);

    // CONSUMER — the frequency must reach research-trigger as a task.
    const [task] = checkForCapabilityGapTriggers({ ledger: session2 });
    expect(task?.title).toBe('Extend capability: extract_symbols:.py');
    expect(task?.description).toContain('declined work it cannot do');
    expect(task?.description).toContain('across sessions');
    expect(task?.description).not.toContain('in routing decisions');
  });

  it('a refusal below the threshold reaches the ledger but not the consumer', () => {
    // The two halves must disagree here, and for the right reason: the signal
    // is recorded (so it can accumulate) but not yet acted on. A loop that
    // triggered on one occurrence would turn every unsupported file into a
    // research task.
    const filePath = ledgerFile();
    const ledger = createPersistentCapabilityGapLedger({ filePath });
    recordToolRefusal(
      { tool: 'extract_symbols', capability: '.rs', suggestion: 's' },
      { goal: 'read main.rs' },
      ledger
    );

    expect(ledger.summarize()[0]?.count).toBe(1);
    expect(checkForCapabilityGapTriggers({ ledger })).toHaveLength(0);
  });

  it('an empty ledger produces no tasks and says so as a measured zero', () => {
    const ledger = createPersistentCapabilityGapLedger({ filePath: ledgerFile() });
    expect(ledger.loadReport().fileExisted).toBe(false);
    expect(ledger.summarize()).toEqual([]);
    expect(checkForCapabilityGapTriggers({ ledger })).toEqual([]);
  });
});

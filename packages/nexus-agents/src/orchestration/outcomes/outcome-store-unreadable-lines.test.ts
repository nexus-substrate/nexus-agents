/** Regression tests for unreadable outcome preservation (#7146). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '../../core/index.js';
import { PersistentOutcomeStore } from './outcome-store-persistence.js';
import type { TaskOutcome } from './outcome-types.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    writeFileSync: vi.fn(actual.writeFileSync),
    renameSync: vi.fn(actual.renameSync),
  };
});

function outcome(overrides: Partial<TaskOutcome> = {}): TaskOutcome {
  return {
    id: 'normal',
    cli: 'claude',
    category: 'code_generation',
    model: 'claude-sonnet-4-6',
    success: true,
    durationMs: 1200,
    timestamp: '2026-02-07T10:00:00Z',
    source: 'delegate',
    ...overrides,
  };
}

// Deliberately non-canonical spacing, Unicode and CRLF: reserialization loses bytes.
const FUTURE_LINE =
  ' \t' +
  JSON.stringify({ ...outcome({ id: 'future' }), cli: 'future:arm', note: '未来' }) +
  ' \r\n';
const GARBAGE_LINE = ' \tthis is not JSON: 未来 \r\n';
const FINAL_UNREADABLE_LINE = '{"future":"unterminated line"}  ';

describe('PersistentOutcomeStore unreadable lines (#7146)', () => {
  let dataDir: string;
  let filePath: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'outcome-unreadable-'));
    filePath = join(dataDir, 'outcomes.jsonl');
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it.each(['purge', 'reclassify', 'both'] as const)(
    'preserves unreadable lines verbatim and in relative order after %s rewrite',
    (rewrite) => {
      const trigger = outcome({
        id: 'trigger',
        success: false,
        durationMs: rewrite === 'reclassify' ? 1200 : 0,
        // A known category isolates purge; stale unknown triggers reclassification.
        failureCategory: rewrite === 'purge' ? 'timeout' : 'unknown',
      });
      writeFileSync(
        filePath,
        FUTURE_LINE +
          JSON.stringify(outcome()) +
          '\n' +
          GARBAGE_LINE +
          JSON.stringify(trigger) +
          '\n' +
          FINAL_UNREADABLE_LINE
      );

      const store = new PersistentOutcomeStore({ filePath, dataDir });

      expect(store.size).toBe(rewrite === 'reclassify' ? 2 : 1);
      const disk = readFileSync(filePath);
      const preserved = Buffer.from(FUTURE_LINE + GARBAGE_LINE + FINAL_UNREADABLE_LINE);
      // Chosen ordering: readable records first, then unreadable lines in source order.
      expect(disk.subarray(-preserved.length)).toEqual(preserved);
      const readable = disk.subarray(0, -preserved.length).toString('utf-8').trim().split('\n');
      expect(readable).toHaveLength(store.size);
      expect(JSON.parse(readable[0] ?? '{}')).toMatchObject({ id: 'normal' });
      if (rewrite === 'reclassify') {
        expect(JSON.parse(readable[1] ?? '{}')).toMatchObject({
          id: 'trigger',
          failureCategory: 'execution',
        });
      }

      // A second load must not reinterpret or lose the preserved suffix.
      const reloaded = new PersistentOutcomeStore({ filePath, dataDir });
      expect(reloaded.size).toBe(store.size);
      expect(readFileSync(filePath)).toEqual(disk);
    }
  );

  it('warns once per load with the skipped count and never logs line contents', () => {
    writeFileSync(
      filePath,
      FUTURE_LINE + GARBAGE_LINE + JSON.stringify(outcome({ success: false, durationMs: 0 })) + '\n'
    );
    const logger = createLogger({ component: 'UnreadableOutcomeTest' });
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const debug = vi.spyOn(logger, 'debug').mockImplementation(() => undefined);
    const info = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);

    new PersistentOutcomeStore({ filePath, dataDir }, logger);

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'Skipped unreadable outcome lines during hydration; preserving them on rewrite',
      { skipped: 2, path: filePath }
    );
    const logs = JSON.stringify([
      warn.mock.calls,
      debug.mock.calls,
      info.mock.calls,
      error.mock.calls,
    ]);
    expect(logs).not.toContain('future:arm');
    expect(logs).not.toContain('this is not JSON');
    expect(logs).not.toContain('未来');

    new PersistentOutcomeStore({ filePath, dataDir }, logger);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('does not warn for a load with no skipped lines', () => {
    writeFileSync(filePath, JSON.stringify(outcome()) + '\n');
    const logger = createLogger({ component: 'ReadableOutcomeTest' });
    const warn = vi.spyOn(logger, 'warn');

    new PersistentOutcomeStore({ filePath, dataDir }, logger);

    expect(warn).not.toHaveBeenCalled();
  });

  it('leaves an entirely unreadable store untouched', () => {
    const content = FUTURE_LINE + GARBAGE_LINE + FINAL_UNREADABLE_LINE;
    writeFileSync(filePath, content);

    const store = new PersistentOutcomeStore({ filePath, dataDir });

    expect(store.size).toBe(0);
    expect(readFileSync(filePath)).toEqual(Buffer.from(content));
  });

  it.each(['write', 'rename'] as const)(
    'keeps the original file intact and cleans up the temporary file on %s failure',
    async (failure) => {
      const content =
        FUTURE_LINE + JSON.stringify(outcome({ success: false, durationMs: 0 })) + '\n';
      writeFileSync(filePath, content);
      const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
      if (failure === 'write') {
        vi.mocked(writeFileSync).mockImplementationOnce((path) => {
          actual.writeFileSync(path, 'partial write');
          throw new Error('test disk write failure');
        });
      } else {
        vi.mocked(renameSync).mockImplementationOnce(() => {
          throw new Error('test rename failure');
        });
      }
      const logger = createLogger({ component: 'AtomicOutcomeTest' });
      const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

      const store = new PersistentOutcomeStore({ filePath, dataDir }, logger);

      expect(store.size).toBe(0);
      expect(readFileSync(filePath)).toEqual(Buffer.from(content));
      expect(readdirSync(dataDir)).toEqual(['outcomes.jsonl']);
      expect(warn).toHaveBeenCalledWith(
        'Failed to rewrite outcomes file after reclassification',
        expect.objectContaining({
          path: filePath,
          error: `test ${failure === 'write' ? 'disk write' : 'rename'} failure`,
        })
      );
    }
  );
});

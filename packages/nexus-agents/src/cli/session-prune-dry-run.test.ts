/**
 * `session prune <days> --dry-run` through the REAL parser (#6677).
 *
 * The global parser consumes `--dry-run` into `options.dryRun`, so it never
 * reaches the positionals the session handler is given. `handlePrune` used to
 * look for it in those positionals only, never found it, and deleted sessions.
 * Here the argv goes through `parseCliArgs` → `handleSessionCommand`; only the
 * storage is replaced, and its `prune` is the deletion boundary.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

const storage = vi.hoisted(() => ({
  initialize: vi.fn(),
  listSessions: vi.fn(),
  prune: vi.fn(),
  close: vi.fn(),
}));

vi.mock('./session-storage.js', () => ({
  createSessionStorage: () => storage,
  SQLiteSessionStorage: vi.fn(),
}));

import { parseCliArgs } from '../cli.js';
import { handleSessionCommand } from '../cli-commands-handlers.js';

const OLD = new Date(Date.UTC(2020, 0, 1)).toISOString();

describe('session prune --dry-run through parseCliArgs (#6677)', () => {
  let dataDir: string;
  let savedDataDir: string | undefined;
  let stdout: string[];
  let writeSpy: MockInstance | undefined;

  beforeEach(() => {
    savedDataDir = process.env['NEXUS_DATA_DIR'];
    dataDir = mkdtempSync(join(tmpdir(), 'session-prune-'));
    process.env['NEXUS_DATA_DIR'] = dataDir;
    storage.initialize.mockReset().mockResolvedValue({ ok: true, value: undefined });
    storage.listSessions.mockReset().mockResolvedValue({
      ok: true,
      value: [
        { id: 'a', updatedAt: OLD },
        { id: 'b', updatedAt: OLD },
      ],
    });
    storage.prune.mockReset().mockResolvedValue({ ok: true, value: 2 });
    storage.close.mockReset();
    stdout = [];
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    writeSpy?.mockRestore();
    if (savedDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = savedDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('positive control: without --dry-run the handler deletes', async () => {
    await handleSessionCommand(parseCliArgs(['session', 'prune', '30']));
    expect(storage.prune).toHaveBeenCalledOnce();
    expect(stdout.join('')).toContain('Deleted 2 sessions.');
  });

  it('--dry-run deletes nothing and reports what it would delete', async () => {
    const parsed = parseCliArgs(['session', 'prune', '30', '--dry-run']);
    expect(parsed.options.dryRun).toBe(true);

    await handleSessionCommand(parsed);

    expect(storage.prune).not.toHaveBeenCalled();
    expect(stdout.join('')).toContain('Would delete 2 sessions.');
  });
});

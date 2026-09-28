import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveWeatherVoteRecords } from './weather-report-cost-inputs.js';

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('resolveWeatherVoteRecords', () => {
  it('refuses a partially unreadable runtime ledger instead of claiming a complete join', () => {
    const dir = mkdtempSync(join(tmpdir(), 'weather-vote-ledger-'));
    dirs.push(dir);
    const path = join(dir, 'vote-records.jsonl');
    writeFileSync(path, 'not-json\n', 'utf8');
    vi.stubEnv('NEXUS_VOTE_RECORDS_PATH', path);
    vi.stubEnv('NEXUS_PERSIST_LEARNING', 'true');

    expect(() => resolveWeatherVoteRecords(0)).toThrow(/invalid.*vote ledger/i);
  });

  it('does not read the host ledger for an injected cost snapshot', () => {
    expect(resolveWeatherVoteRecords(0, undefined, true)).toEqual([]);
  });
});

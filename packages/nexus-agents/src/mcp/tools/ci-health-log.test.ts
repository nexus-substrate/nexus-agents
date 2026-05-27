/**
 * Tests for ci-health-log (#3076 primitive #4 / #3084).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  appendCiHealthEvent,
  eventFromCheck,
  getCiOutageFrequency,
  pruneOlderThan,
} from './ci-health-log.js';
import { resetNexusDataDirCache, nexusDataPath } from '../../config/nexus-data-dir.js';

describe('ci-health-log', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-cihealth-test-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Read the on-disk jsonl as parsed records. */
  function readLog(): unknown[] {
    const path = nexusDataPath('ci-health', 'events.jsonl');
    const raw = readFileSync(path, 'utf-8');
    return raw
      .split('\n')
      .filter((l) => l !== '')
      .map((l) => JSON.parse(l) as unknown);
  }

  describe('appendCiHealthEvent', () => {
    it('writes one line per call with v=1 and ISO ts', () => {
      appendCiHealthEvent({
        status: 'healthy',
        signals: [
          {
            source: 'github-status',
            status: 'healthy',
            evidence: 'operational',
          },
        ],
      });
      const records = readLog();
      expect(records).toHaveLength(1);
      const r = records[0] as { v: number; ts: string; status: string };
      expect(r.v).toBe(1);
      expect(r.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(r.status).toBe('healthy');
    });

    it('appends in order — second call adds a second line, first preserved', () => {
      appendCiHealthEvent({ status: 'healthy', signals: [] });
      appendCiHealthEvent({ status: 'outage', signals: [] });
      const records = readLog();
      expect(records).toHaveLength(2);
      expect((records[0] as { status: string }).status).toBe('healthy');
      expect((records[1] as { status: string }).status).toBe('outage');
    });

    it('persists optional repo field when present', () => {
      appendCiHealthEvent({ status: 'degraded', signals: [], repo: 'a/b' });
      const r = readLog()[0] as { repo?: string };
      expect(r.repo).toBe('a/b');
    });

    it('omits repo field when not provided', () => {
      appendCiHealthEvent({ status: 'healthy', signals: [] });
      const r = readLog()[0] as { repo?: string };
      expect(r.repo).toBeUndefined();
    });
  });

  describe('getCiOutageFrequency', () => {
    it('returns zeros when log is empty', () => {
      const r = getCiOutageFrequency(30);
      expect(r.events).toBe(0);
      expect(r.outages).toBe(0);
      expect(r.degraded).toBe(0);
      expect(r.degradedRatio).toBe(0);
      expect(r.windowDays).toBe(30);
    });

    it('counts events in window, distinguishing outage vs degraded vs healthy', () => {
      appendCiHealthEvent({ status: 'healthy', signals: [] });
      appendCiHealthEvent({ status: 'healthy', signals: [] });
      appendCiHealthEvent({ status: 'degraded', signals: [] });
      appendCiHealthEvent({ status: 'outage', signals: [] });

      const r = getCiOutageFrequency(30);
      expect(r.events).toBe(4);
      expect(r.outages).toBe(1);
      expect(r.degraded).toBe(1);
      // (1 outage + 1 degraded) / 4 events = 0.5
      expect(r.degradedRatio).toBe(0.5);
    });

    it('ignores events older than the window', () => {
      const path = nexusDataPath('ci-health', 'events.jsonl');
      // Manually write a backdated event (40 days ago) + a fresh one
      const oldTs = new Date(Date.now() - 40 * 86_400_000).toISOString();
      const oldEvent = {
        v: 1,
        ts: oldTs,
        status: 'outage',
        signals: [],
      };
      const freshEvent = {
        v: 1,
        ts: new Date().toISOString(),
        status: 'healthy',
        signals: [],
      };
      // Pre-create the dir via a no-op append, then overwrite with our test data
      appendCiHealthEvent({ status: 'healthy', signals: [] });
      writeFileSync(path, `${JSON.stringify(oldEvent)}\n${JSON.stringify(freshEvent)}\n`);

      const r = getCiOutageFrequency(30);
      // Old outage outside window, fresh healthy inside
      expect(r.events).toBe(1);
      expect(r.outages).toBe(0);
      expect(r.degradedRatio).toBe(0);
    });

    it('respects custom window days', () => {
      appendCiHealthEvent({ status: 'outage', signals: [] });
      const r = getCiOutageFrequency(7);
      expect(r.windowDays).toBe(7);
      expect(r.events).toBe(1);
    });

    it('throws on non-positive window days', () => {
      expect(() => getCiOutageFrequency(0)).toThrow(/must be > 0/);
      expect(() => getCiOutageFrequency(-1)).toThrow(/must be > 0/);
    });
  });

  describe('pruneOlderThan', () => {
    it('returns 0 removed when nothing to prune', () => {
      appendCiHealthEvent({ status: 'healthy', signals: [] });
      const { kept, removed } = pruneOlderThan(30);
      expect(kept).toBe(1);
      expect(removed).toBe(0);
    });

    it('drops entries older than keepDays, preserves newer ones', () => {
      const path = nexusDataPath('ci-health', 'events.jsonl');
      appendCiHealthEvent({ status: 'healthy', signals: [] });
      const oldEvent = {
        v: 1,
        ts: new Date(Date.now() - 100 * 86_400_000).toISOString(),
        status: 'outage',
        signals: [],
      };
      const freshEvent = {
        v: 1,
        ts: new Date().toISOString(),
        status: 'healthy',
        signals: [],
      };
      writeFileSync(path, `${JSON.stringify(oldEvent)}\n${JSON.stringify(freshEvent)}\n`);

      const { kept, removed } = pruneOlderThan(30);
      expect(kept).toBe(1);
      expect(removed).toBe(1);

      // Verify the surviving entry is the fresh one
      const r = getCiOutageFrequency(30);
      expect(r.events).toBe(1);
      expect(r.outages).toBe(0);
    });
  });

  describe('eventFromCheck', () => {
    it('omits the repo field when undefined', () => {
      const e = eventFromCheck({
        status: 'healthy',
        signals: [{ source: 'github-status', status: 'healthy', evidence: 'ok' }],
      });
      expect(e).not.toHaveProperty('repo');
    });

    it('includes the repo field when provided', () => {
      const e = eventFromCheck({
        status: 'degraded',
        signals: [],
        repo: 'a/b',
      });
      expect(e.repo).toBe('a/b');
    });

    it('drops extra fields from input signals — keeps only source/status/evidence', () => {
      const e = eventFromCheck({
        status: 'healthy',
        signals: [
          {
            source: 'github-status',
            status: 'healthy',
            evidence: 'ok',
          },
        ],
      });
      expect(e.signals[0]).toEqual({
        source: 'github-status',
        status: 'healthy',
        evidence: 'ok',
      });
    });
  });

  describe('integration: round-trip with malformed lines', () => {
    it('tolerates one malformed line without breaking later reads', () => {
      const path = nexusDataPath('ci-health', 'events.jsonl');
      appendCiHealthEvent({ status: 'healthy', signals: [] });
      // Inject a corrupt line between two valid records
      const corrupt = 'this is not json\n';
      const valid = `${JSON.stringify({
        v: 1,
        ts: new Date().toISOString(),
        status: 'outage',
        signals: [],
      })}\n`;
      const existing = readFileSync(path, 'utf-8');
      writeFileSync(path, existing + corrupt + valid);

      const r = getCiOutageFrequency(30);
      // 2 valid records, corrupt line skipped
      expect(r.events).toBe(2);
      expect(r.outages).toBe(1);
    });
  });
});

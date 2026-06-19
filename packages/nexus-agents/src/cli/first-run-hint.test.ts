/**
 * Tests for the proactive first-run setup hint (#3208).
 *
 * The marker filesystem, the data-dir resolver, and the TTY signal are all
 * mocked — nothing here touches the real home dir or real stderr.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

import { maybeShowFirstRunHint, firstRunMarkerPath } from './first-run-hint.js';

// Mock the data-dir resolver so the marker path is deterministic and never
// points at the operator's real ~/.nexus-agents.
vi.mock('../config/nexus-data-dir.js', () => ({
  nexusSharedPath: (...segments: string[]): string => `/fake-home/.nexus-agents/${segments.join('/')}`,
}));

// Mock node:fs so existence + writes are observable and never hit disk.
const fsState = vi.hoisted(() => ({
  existing: new Set<string>(),
  writes: [] as { path: string; data: string }[],
  existsSyncThrows: false,
  writeThrows: false,
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn((p: string): boolean => {
    if (fsState.existsSyncThrows) throw new Error('EACCES: cannot stat');
    return fsState.existing.has(p);
  }),
  mkdirSync: vi.fn((): undefined => undefined),
  writeFileSync: vi.fn((p: string, data: string): void => {
    if (fsState.writeThrows) throw new Error('EROFS: read-only file system');
    fsState.writes.push({ path: p, data });
    fsState.existing.add(p);
  }),
}));

const MARKER = '/fake-home/.nexus-agents/.first-run-done';

/** Forces `process.stderr.isTTY` for the duration of one test. */
function withTty<T>(isTty: boolean, fn: () => T): T {
  const original = process.stderr.isTTY;
  Object.defineProperty(process.stderr, 'isTTY', { value: isTty, configurable: true });
  try {
    return fn();
  } finally {
    Object.defineProperty(process.stderr, 'isTTY', { value: original, configurable: true });
  }
}

describe('first-run-hint', () => {
  let stderrSpy: MockInstance;

  beforeEach(() => {
    fsState.existing.clear();
    fsState.writes.length = 0;
    fsState.existsSyncThrows = false;
    fsState.writeThrows = false;
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('resolves the marker under the per-user shared data dir', () => {
    expect(firstRunMarkerPath()).toBe(MARKER);
  });

  describe('first run (marker absent, interactive)', () => {
    it('emits the hint to stderr and creates the marker for a normal command', () => {
      withTty(true, () => {
        maybeShowFirstRunHint('verify');
      });

      expect(stderrSpy).toHaveBeenCalledTimes(1);
      const output = String(stderrSpy.mock.calls[0]?.[0]);
      expect(output).toContain('nexus-agents setup');
      // Marker created.
      expect(fsState.writes).toHaveLength(1);
      expect(fsState.writes[0]?.path).toBe(MARKER);
    });
  });

  describe('second run (marker present)', () => {
    it('emits nothing and does not rewrite the marker', () => {
      fsState.existing.add(MARKER);
      withTty(true, () => {
        maybeShowFirstRunHint('doctor');
      });

      expect(stderrSpy).not.toHaveBeenCalled();
      expect(fsState.writes).toHaveLength(0);
    });
  });

  describe('suppressed commands never emit (even on first run)', () => {
    it.each(['version', 'help', 'setup'])('skips %s', (command) => {
      withTty(true, () => {
        maybeShowFirstRunHint(command);
      });

      expect(stderrSpy).not.toHaveBeenCalled();
      // Suppressed commands must not consume the first-run marker either.
      expect(fsState.writes).toHaveLength(0);
    });
  });

  describe('non-interactive (stderr not a TTY)', () => {
    it('emits nothing AND does not create the marker, preserving the hint for the first interactive run', () => {
      withTty(false, () => {
        maybeShowFirstRunHint('verify');
      });

      expect(stderrSpy).not.toHaveBeenCalled();
      // Decision: do NOT mark in non-interactive runs, so a CI/piped first run
      // doesn't silently consume the operator's one-and-only hint.
      expect(fsState.writes).toHaveLength(0);
    });

    it('treats isTTY === undefined as non-interactive', () => {
      withTty(undefined as unknown as boolean, () => {
        maybeShowFirstRunHint('verify');
      });
      expect(stderrSpy).not.toHaveBeenCalled();
      expect(fsState.writes).toHaveLength(0);
    });
  });

  describe('marker write failure (read-only FS / perms)', () => {
    it('still shows the hint once and does not throw', () => {
      fsState.writeThrows = true;
      expect(() => {
        withTty(true, () => {
          maybeShowFirstRunHint('verify');
        });
      }).not.toThrow();

      // Hint was still shown despite the marker write failing.
      expect(stderrSpy).toHaveBeenCalledTimes(1);
      expect(fsState.writes).toHaveLength(0);
    });
  });

  describe('marker existence-probe failure', () => {
    it('falls through to showing the hint rather than crashing', () => {
      fsState.existsSyncThrows = true;
      fsState.writeThrows = true; // also block the write so the probe path is isolated
      expect(() => {
        withTty(true, () => {
          maybeShowFirstRunHint('doctor');
        });
      }).not.toThrow();
      expect(stderrSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('writes only to stderr, never stdout', () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      withTty(true, () => {
        maybeShowFirstRunHint('verify');
      });
      expect(stdoutSpy).not.toHaveBeenCalled();
    } finally {
      stdoutSpy.mockRestore();
    }
  });
});

import { describe, expect, it } from 'vitest';

import {
  CRITICAL_FREE_BYTES,
  WARN_FREE_BYTES,
  checkScratchFilesystems,
  checkScratchSpace,
  formatScratchSpace,
  worstSeverity,
} from './doctor-scratch-space.js';
import type {
  ScratchSpaceCheck,
  ScratchSpaceSeverity,
  StatfsReading,
} from './doctor-scratch-space.js';

const GIB = 1024 ** 3;

/** A `statfs`-shaped reading with `total` and `free` expressed in bytes. */
const reading = (freeBytes: number, totalBytes: number): StatfsReading => ({
  bsize: 4096,
  blocks: totalBytes / 4096,
  bavail: freeBytes / 4096,
});

describe('checkScratchSpace', () => {
  it('reports ok on a filesystem with plenty of headroom', () => {
    const result = checkScratchSpace('/tmp/scratch', () => reading(20 * GIB, 32 * GIB));

    expect(result.severity).toBe('ok');
    expect(result.available).toBe(true);
    expect(result.freeBytes).toBe(20 * GIB);
    expect(result.totalBytes).toBe(32 * GIB);
    expect(result.percentUsed).toBe(38);
  });

  it('warns when free space drops below the warn floor', () => {
    const result = checkScratchSpace('/tmp/scratch', () => reading(1 * GIB, 32 * GIB));

    expect(result.severity).toBe('warn');
  });

  it('escalates to critical below the critical floor', () => {
    const result = checkScratchSpace('/tmp/scratch', () => reading(100 * 1024 * 1024, 32 * GIB));

    expect(result.severity).toBe('critical');
  });

  it('treats a full filesystem as critical', () => {
    const result = checkScratchSpace('/tmp/scratch', () => reading(0, 32 * GIB));

    expect(result.severity).toBe('critical');
    expect(result.percentUsed).toBe(100);
  });

  it('judges on absolute free bytes, not percentage alone', () => {
    // 3% free of a 4TiB volume is ~123GiB — ample, despite the low percentage.
    const result = checkScratchSpace('/tmp/scratch', () => reading(123 * GIB, 4096 * GIB));

    expect(result.severity).toBe('ok');
  });

  it('flags a small filesystem that is nearly full even though it is small', () => {
    // 200MiB free on a 1GiB volume: below the critical byte floor.
    const result = checkScratchSpace('/tmp/scratch', () => reading(200 * 1024 * 1024, 1 * GIB));

    expect(result.severity).toBe('critical');
  });

  it('degrades to unavailable rather than throwing when statfs fails', () => {
    const result = checkScratchSpace('/tmp/scratch', () => {
      throw new Error('ENOSYS: statfs not supported');
    });

    expect(result.available).toBe(false);
    expect(result.severity).toBe('ok');
    expect(result.message).toContain('could not be read');
  });

  it('keeps the warn floor below the critical floor', () => {
    expect(CRITICAL_FREE_BYTES).toBeLessThan(WARN_FREE_BYTES);
  });
});

describe('formatScratchSpace', () => {
  it('names the root and the free/total figures', () => {
    const out = formatScratchSpace(
      checkScratchSpace('/tmp/scratch', () => reading(20 * GIB, 32 * GIB))
    );

    expect(out).toContain('/tmp/scratch');
    expect(out).toContain('20.0 GiB');
    expect(out).toContain('32.0 GiB');
  });

  it('surfaces remediation guidance only when space is short', () => {
    const healthy = formatScratchSpace(
      checkScratchSpace('/tmp/x', () => reading(20 * GIB, 32 * GIB))
    );
    const starved = formatScratchSpace(checkScratchSpace('/tmp/x', () => reading(0, 32 * GIB)));

    expect(healthy).not.toContain('NEXUS_TMPDIR');
    expect(starved).toContain('NEXUS_TMPDIR');
  });
});

describe('checkScratchFilesystems', () => {
  /** Device ids keyed by root, so tests can place roots on the same or different volumes. */
  const devices =
    (map: Record<string, number>) =>
    (root: string): number => {
      const dev = map[root];
      if (dev === undefined) throw new Error(`no device for ${root}`);
      return dev;
    };

  it('measures the system temp dir as well as the nexus scratch root', () => {
    const checks = checkScratchFilesystems({
      roots: [
        { label: 'nexus', root: '/data/.nexus-agents/tmp' },
        { label: 'system', root: '/tmp' },
      ],
      statfs: (root) =>
        root === '/tmp' ? reading(1 * GIB, 32 * GIB) : reading(200 * GIB, 900 * GIB),
      deviceOf: devices({ '/data/.nexus-agents/tmp': 1, '/tmp': 2 }),
    });

    expect(checks.map((c) => c.root)).toEqual(['/data/.nexus-agents/tmp', '/tmp']);
  });

  it('does not let a roomy nexus root mask a starved harness tmpfs', () => {
    // The #4488 regression: the incident filesystem was the 32 GiB tmpfs the
    // harness writes to, while the nexus root sat on a 900 GiB volume and
    // graded ok. A single-root check reported healthy throughout the outage.
    const checks = checkScratchFilesystems({
      roots: [
        { label: 'nexus', root: '/data/.nexus-agents/tmp' },
        { label: 'system', root: '/tmp' },
      ],
      statfs: (root) => (root === '/tmp' ? reading(0, 32 * GIB) : reading(200 * GIB, 900 * GIB)),
      deviceOf: devices({ '/data/.nexus-agents/tmp': 1, '/tmp': 2 }),
    });

    expect(worstSeverity(checks)).toBe('critical');
  });

  it('measures a shared filesystem once rather than reporting it twice', () => {
    const checks = checkScratchFilesystems({
      roots: [
        { label: 'nexus', root: '/tmp/nexus' },
        { label: 'system', root: '/tmp' },
      ],
      statfs: () => reading(20 * GIB, 32 * GIB),
      deviceOf: devices({ '/tmp/nexus': 7, '/tmp': 7 }),
    });

    expect(checks).toHaveLength(1);
    expect(checks[0]?.root).toBe('/tmp/nexus');
  });

  it('keeps measuring the other root when one cannot be identified', () => {
    // An unreadable root is not evidence about the readable one.
    const checks = checkScratchFilesystems({
      roots: [
        { label: 'nexus', root: '/data/tmp' },
        { label: 'system', root: '/gone' },
      ],
      statfs: () => reading(0, 32 * GIB),
      deviceOf: devices({ '/data/tmp': 1 }),
    });

    expect(checks).toHaveLength(1);
    expect(checks[0]?.root).toBe('/data/tmp');
  });

  it('carries the label so the operator can tell the two roots apart', () => {
    const checks = checkScratchFilesystems({
      roots: [{ label: 'system', root: '/tmp' }],
      statfs: () => reading(20 * GIB, 32 * GIB),
      deviceOf: devices({ '/tmp': 2 }),
    });

    expect(checks[0]?.label).toBe('system');
  });
});

describe('worstSeverity', () => {
  const at = (severity: ScratchSpaceSeverity): ScratchSpaceCheck => ({
    label: 'nexus',
    root: '/x',
    available: true,
    freeBytes: 0,
    totalBytes: 0,
    percentUsed: 0,
    severity,
    message: '',
  });

  it('reports the worst grade across filesystems, not the first', () => {
    expect(worstSeverity([at('ok'), at('critical'), at('warn')])).toBe('critical');
  });

  it('prefers warn over ok', () => {
    expect(worstSeverity([at('ok'), at('warn')])).toBe('warn');
  });

  it('is ok when nothing was measured, since absence is not evidence of a full disk', () => {
    expect(worstSeverity([])).toBe('ok');
  });
});

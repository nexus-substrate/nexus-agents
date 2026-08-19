import { describe, expect, it } from 'vitest';

import {
  CRITICAL_FREE_BYTES,
  WARN_FREE_BYTES,
  checkScratchSpace,
  formatScratchSpace,
} from './doctor-scratch-space.js';
import type { StatfsReading } from './doctor-scratch-space.js';

const GIB = 1024 ** 3;

/** A `statfs`-shaped reading with `total` and `free` expressed in bytes. */
const reading = (freeBytes: number, totalBytes: number): StatfsReading => ({
  bsize: 4096,
  blocks: totalBytes / 4096,
  bfree: freeBytes / 4096,
  bavail: freeBytes / 4096,
  files: 0,
  ffree: 0,
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

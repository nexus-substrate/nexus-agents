/**
 * Tests for the scratch-root length fallback (#6615).
 *
 * tsx binds an IPC socket at `<TMPDIR>/tsx-<uid>/<pid>.pipe`; Linux `sun_path`
 * holds 107 bytes plus the NUL, and libuv truncates rather than rejecting, so a
 * deep checkout's scratch root made spawned tsx children fail with EADDRINUSE.
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_UNIX_SOCKET_PATH_BYTES,
  resolveTestScratchRoot,
  tsxPipePathFits,
} from './test-scratch-root.js';

const UID = 1000;
/** `/tsx-1000/` (10) + a 7-digit pid (7) + `.pipe` (5). */
const SUFFIX_BYTES = 22;
const LARGEST_FITTING_ROOT_BYTES = MAX_UNIX_SOCKET_PATH_BYTES - SUFFIX_BYTES;

/** An absolute path of exactly `bytes` bytes. */
function rootOfLength(bytes: number): string {
  return '/' + 'a'.repeat(bytes - 1);
}

describe('tsxPipePathFits', () => {
  it('the socket-path limit is 107 bytes (108-byte sun_path minus the NUL)', () => {
    expect(MAX_UNIX_SOCKET_PATH_BYTES).toBe(107);
  });

  it('accepts a short root', () => {
    expect(tsxPipePathFits('/tmp', UID)).toBe(true);
  });

  it('accepts a root at the exact boundary', () => {
    expect(tsxPipePathFits(rootOfLength(LARGEST_FITTING_ROOT_BYTES), UID)).toBe(true);
  });

  it('rejects a root one byte over the boundary', () => {
    expect(tsxPipePathFits(rootOfLength(LARGEST_FITTING_ROOT_BYTES + 1), UID)).toBe(false);
  });

  it('counts the uid width, not a fixed one', () => {
    const root = rootOfLength(LARGEST_FITTING_ROOT_BYTES);
    expect(tsxPipePathFits(root, 10000)).toBe(false);
    expect(tsxPipePathFits(root, 100)).toBe(true);
  });

  it('measures UTF-8 bytes, not UTF-16 code units', () => {
    // 'é' is one code unit but two bytes: this root sits at the boundary in
    // code units and one byte over it in bytes.
    const root = rootOfLength(LARGEST_FITTING_ROOT_BYTES - 1) + 'é';
    expect(root.length).toBe(LARGEST_FITTING_ROOT_BYTES);
    expect(tsxPipePathFits(root, UID)).toBe(false);
  });
});

describe('resolveTestScratchRoot', () => {
  it('keeps the in-repo root when the socket path fits (#4412 intent)', () => {
    const preferred = rootOfLength(LARGEST_FITTING_ROOT_BYTES);
    expect(resolveTestScratchRoot(preferred, '/sys-tmp', UID)).toBe(preferred);
  });

  it('falls back under the system tmp dir when the socket path would overflow', () => {
    const preferred = rootOfLength(LARGEST_FITTING_ROOT_BYTES + 1);
    const fallback = resolveTestScratchRoot(preferred, '/sys-tmp', UID);
    expect(fallback).not.toBe(preferred);
    expect(fallback.startsWith('/sys-tmp/nexus-agents-test-')).toBe(true);
    expect(tsxPipePathFits(fallback, UID)).toBe(true);
  });

  it('derives the same fallback on every call, so the config and the reaper agree', () => {
    const preferred = rootOfLength(200);
    expect(resolveTestScratchRoot(preferred, '/sys-tmp', UID)).toBe(
      resolveTestScratchRoot(preferred, '/sys-tmp', UID)
    );
  });

  it('gives distinct checkouts distinct fallbacks', () => {
    const a = resolveTestScratchRoot(rootOfLength(200), '/sys-tmp', UID);
    const b = resolveTestScratchRoot('/b' + rootOfLength(199), '/sys-tmp', UID);
    expect(a).not.toBe(b);
  });
});

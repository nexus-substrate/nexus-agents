/**
 * Tests for the atomic auto-remediation lease (#3648 / #3618 condition 1).
 * The lock is acquired by an atomic ref-create; exactly one of two concurrent
 * acquirers wins; failure is fail-closed (null).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  makeGitRefLeaseAcquirer,
  lockRef,
  type GhRunner,
  type GhExecResult,
} from './auto-remediation-lease.js';

function ok(stdout = ''): GhExecResult {
  return { exitCode: 0, stdout, stderr: '' };
}
function fail(stderr = 'HTTP 422: Reference already exists'): GhExecResult {
  return { exitCode: 1, stdout: '', stderr };
}

const REPO = 'nexus-substrate/nexus-agents';

describe('makeGitRefLeaseAcquirer', () => {
  it('acquires via an atomic POST git/refs (create-if-not-exists)', async () => {
    const gh = vi.fn<GhRunner>(async () => Promise.resolve(ok()));
    const acquire = makeGitRefLeaseAcquirer({ repo: REPO, sha: 'abc123', gh });

    const lease = await acquire('auto-remediation');
    expect(lease).not.toBeNull();
    const call = gh.mock.calls[0]![0];
    expect(call).toContain('POST');
    expect(call).toContain(`repos/${REPO}/git/refs`);
    expect(call).toContain(`ref=${lockRef('auto-remediation')}`);
    expect(call).toContain('sha=abc123');
    // No prior existence read — the create IS the acquisition (no TOCTOU).
    expect(gh).toHaveBeenCalledTimes(1);
  });

  it('returns null fail-closed when the ref already exists (422)', async () => {
    const gh = vi.fn<GhRunner>(async () => Promise.resolve(fail()));
    const acquire = makeGitRefLeaseAcquirer({ repo: REPO, sha: 'abc123', gh });
    expect(await acquire('auto-remediation')).toBeNull();
  });

  it('returns null fail-closed on a transport error too (never proceeds unsure)', async () => {
    const gh = vi.fn<GhRunner>(async () => Promise.resolve(fail('HTTP 503: service unavailable')));
    const acquire = makeGitRefLeaseAcquirer({ repo: REPO, sha: 'abc123', gh });
    expect(await acquire('auto-remediation')).toBeNull();
  });

  it('two concurrent acquirers → exactly one wins (atomic create semantics)', async () => {
    // Shared fake "remote": first create succeeds, subsequent creates 422.
    const refs = new Set<string>();
    const gh: GhRunner = (args) => {
      const isPost = args.includes('POST');
      const refArg = args.find((a) => a.startsWith('ref='))?.slice('ref='.length) ?? '';
      if (isPost) {
        if (refs.has(refArg)) return Promise.resolve(fail()); // already exists
        refs.add(refArg);
        return Promise.resolve(ok());
      }
      return Promise.resolve(ok());
    };
    const acquire = makeGitRefLeaseAcquirer({ repo: REPO, sha: 's', gh });

    const [a, b] = await Promise.all([acquire('auto-remediation'), acquire('auto-remediation')]);
    const winners = [a, b].filter((x) => x !== null);
    expect(winners).toHaveLength(1);
  });

  it('release deletes the ref (best-effort)', async () => {
    const gh = vi.fn<GhRunner>(async () => Promise.resolve(ok()));
    const acquire = makeGitRefLeaseAcquirer({ repo: REPO, sha: 'abc', gh });
    const lease = await acquire('auto-remediation');
    await lease?.release();
    const delCall = gh.mock.calls.find((c) => c[0].includes('DELETE'));
    expect(delCall).toBeDefined();
    expect(delCall?.[0]).toContain(`repos/${REPO}/git/refs/locks/auto-remediation`); // no leading refs/
  });

  it('release swallows errors (stale lock recovered separately, #3646)', async () => {
    let post = true;
    const gh: GhRunner = () => {
      if (post) {
        post = false;
        return Promise.resolve(ok());
      }
      return Promise.resolve(fail('delete failed'));
    };
    const acquire = makeGitRefLeaseAcquirer({ repo: REPO, sha: 'abc', gh });
    const lease = await acquire('auto-remediation');
    await expect(lease?.release()).resolves.toBeUndefined();
  });
});

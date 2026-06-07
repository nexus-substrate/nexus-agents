/**
 * Tests for auto-file-suggestions (#3382). The GitHub boundary is injected, so
 * the safeguards (rate-limit, dedup, label, scrub, fail-closed) are tested
 * without touching `gh`.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  autoFileSuggestions,
  scrubSensitiveRefs,
  MACHINE_SUGGESTED_LABEL,
} from './auto-file-suggestions.js';
import type { PipelineTask } from '../pipeline/dev-pipeline.js';

function task(id: string, title = `Title ${id}`, description = `Body ${id}`): PipelineTask {
  return { id, title, description, assignedTo: 'researcher', status: 'pending' };
}

const noExisting = (): Promise<boolean> => Promise.resolve(false);
const okFiler = vi.fn(() => Promise.resolve({ ok: true as const, url: 'https://gh/issue/1' }));

describe('scrubSensitiveRefs', () => {
  it('replaces sensitive org/gov references', () => {
    expect(scrubSensitiveRefs('Deploy for USAi today')).toBe(
      'Deploy for the configured provider today'
    );
  });
  it('leaves clean text unchanged', () => {
    expect(scrubSensitiveRefs('Add a deploy tool')).toBe('Add a deploy tool');
  });
});

describe('autoFileSuggestions', () => {
  it('files each candidate with the machine-suggested label', async () => {
    const fileIssue = vi.fn((_opts: { title: string; body: string; labels: readonly string[] }) =>
      Promise.resolve({ ok: true as const, url: 'u' })
    );
    const res = await autoFileSuggestions([task('a'), task('b')], {
      searchExisting: noExisting,
      fileIssue,
    });
    expect(res.filed).toHaveLength(2);
    expect(res.skipped).toHaveLength(0);
    for (const call of fileIssue.mock.calls) {
      expect(call[0].labels).toContain(MACHINE_SUGGESTED_LABEL);
    }
  });

  it('skips a candidate whose title already exists (dedup)', async () => {
    const fileIssue = vi.fn((_opts: { title: string; body: string; labels: readonly string[] }) =>
      Promise.resolve({ ok: true as const, url: 'u' })
    );
    const res = await autoFileSuggestions([task('a', 'Existing'), task('b', 'New')], {
      searchExisting: (title) => Promise.resolve(title === 'Existing'),
      fileIssue,
    });
    expect(res.filed.map((f) => f.id)).toEqual(['b']);
    expect(res.skipped).toEqual([{ id: 'a', reason: 'duplicate' }]);
    expect(fileIssue).toHaveBeenCalledTimes(1);
  });

  it('caps filing at maxPerRun (rate limit)', async () => {
    const fileIssue = vi.fn((_opts: { title: string; body: string; labels: readonly string[] }) =>
      Promise.resolve({ ok: true as const, url: 'u' })
    );
    const res = await autoFileSuggestions([task('a'), task('b'), task('c')], {
      maxPerRun: 2,
      searchExisting: noExisting,
      fileIssue,
    });
    expect(res.filed).toHaveLength(2);
    expect(res.skipped).toEqual([{ id: 'c', reason: 'rate-limit' }]);
  });

  it('scrubs sensitive refs from the filed title and body', async () => {
    const fileIssue = vi.fn((_opts: { title: string; body: string; labels: readonly string[] }) =>
      Promise.resolve({ ok: true as const, url: 'u' })
    );
    await autoFileSuggestions([task('a', 'Tool for USAi', 'Used by USAi pipelines')], {
      searchExisting: noExisting,
      fileIssue,
    });
    const arg = fileIssue.mock.calls[0]?.[0];
    expect(arg?.title).not.toMatch(/USAi/);
    expect(arg?.body).not.toMatch(/USAi/);
  });

  it('fails closed when the GitHub filer is unavailable (stops, does not crash)', async () => {
    const fileIssue = vi.fn(() =>
      Promise.resolve({ ok: false as const, error: 'gh: command not found' })
    );
    const res = await autoFileSuggestions([task('a'), task('b')], {
      searchExisting: noExisting,
      fileIssue,
    });
    expect(res.filed).toHaveLength(0);
    expect(res.skipped[0]).toEqual({ id: 'a', reason: 'gh-unavailable' });
    // Failed closed — did not attempt the second after the first failure.
    expect(fileIssue).toHaveBeenCalledTimes(1);
  });

  it('dry-run reports would-file without calling the filer', async () => {
    const fileIssue = vi.fn((_opts: { title: string; body: string; labels: readonly string[] }) =>
      Promise.resolve({ ok: true as const, url: 'u' })
    );
    const res = await autoFileSuggestions([task('a')], {
      dryRun: true,
      searchExisting: noExisting,
      fileIssue,
    });
    expect(res.filed).toEqual([{ id: 'a', url: '(dry-run)' }]);
    expect(fileIssue).not.toHaveBeenCalled();
  });

  it('records an error (not crash) when the boundary throws', async () => {
    const res = await autoFileSuggestions([task('a')], {
      searchExisting: () => Promise.reject(new Error('network')),
      fileIssue: okFiler,
    });
    expect(res.skipped).toEqual([{ id: 'a', reason: 'error' }]);
  });
});

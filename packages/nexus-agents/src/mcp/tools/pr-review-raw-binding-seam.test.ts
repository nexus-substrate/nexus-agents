/**
 * Full-wire seam for #6177: the REAL middleware measures the raw diff, and the
 * record's binding bounds are decided over that measurement.
 *
 * `pr-review-disclosure.test.ts` feeds `ctx.sanitization` by hand, so a
 * middleware that stopped measuring `rawFieldBytes` would leave every test
 * there green (mutation M4 in the PR). This file registers the tool behind the
 * real `createSecureHandler` — the one production uses, with the tool's own
 * `rawHashFields` — and hands it the RAW args: a small diff carrying an HTML
 * comment large enough that the raw input is over `MAX_REVIEWED_DIFF_BYTES`
 * while the sanitized text the handler receives is under it. That is the
 * reach condition the issue names, and the one state where the sanitized
 * measurement and the raw one give different answers.
 *
 * `collectRealVotes` is mocked to one live approve so a record is persisted.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../../cli/voter-agents.js', () => ({
  collectRealVotes: () =>
    Promise.resolve([
      {
        role: 'architect',
        vote: { decision: 'approve', confidence: 0.9, reasoning: 'ok' },
        source: 'cli',
        cli: 'claude',
        processingTimeMs: 1,
      },
    ]),
}));
vi.mock('../../cli-adapters/factory.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../cli-adapters/factory.js')>()),
  getAvailableClis: () => Promise.resolve([]),
}));
vi.mock('../middleware/tool-wrapper.js', () => ({
  wrapToolWithTimeout: (_name: string, fn: unknown) => fn,
  toSdkCallback: (fn: unknown) => fn,
  getToolTimeout: () => 900_000,
}));

import { registerPrReviewTool } from './pr-review-tool.js';
import { PrReviewRecordSchema } from '../../audit/pr-review-record.js';
import { PR_REVIEW_RECORDS_PATH_ENV } from '../../audit/pr-review-record-store.js';
import {
  MAX_REVIEWED_DIFF_BYTES,
  computeReviewedDiffHash,
} from '../../audit/reviewed-diff-hash.js';
import { sanitizeToolInput } from '../middleware/tool-input-sanitizer.js';

type Handler = (args: unknown) => Promise<unknown>;

/** The tool as registered in production: behind the real secure handler. */
function captureHandler(): Handler {
  let handler: Handler | undefined;
  const server = {
    registerTool: (_name: string, _schema: unknown, cb: Handler) => {
      handler = cb;
    },
  };
  // The real middleware acquires a token per call; always grant one.
  registerPrReviewTool(server as never, { rateLimiter: { tryAcquire: () => true } as never });
  if (handler === undefined) throw new Error('handler not registered');
  return handler;
}

const SANITIZED_DIFF =
  'diff --git a/CLAUDE.md b/CLAUDE.md\n--- a/CLAUDE.md\n+++ b/CLAUDE.md\n+prose\n';
/** The raw diff: the same lines plus one comment the middleware strips whole. */
const RAW_DIFF = `${SANITIZED_DIFF}+<!-- ${'x'.repeat(MAX_REVIEWED_DIFF_BYTES)} -->\n`;

describe('the raw byte length reaches the record through the REAL middleware (#6177)', () => {
  let dir: string;
  let prev: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pr-review-raw-binding-seam-'));
    prev = process.env[PR_REVIEW_RECORDS_PATH_ENV];
    process.env[PR_REVIEW_RECORDS_PATH_ENV] = join(dir, 'records.jsonl');
  });

  afterEach(() => {
    if (prev === undefined) Reflect.deleteProperty(process.env, PR_REVIEW_RECORDS_PATH_ENV);
    else process.env[PR_REVIEW_RECORDS_PATH_ENV] = prev;
    rmSync(dir, { recursive: true, force: true });
  });

  it('pins the fixture: raw over the cap, sanitized under it, and the sanitizer fires', () => {
    expect(Buffer.byteLength(RAW_DIFF, 'utf-8')).toBeGreaterThan(MAX_REVIEWED_DIFF_BYTES);
    const result = sanitizeToolInput({ prDiff: RAW_DIFF });
    expect(result.wasModified).toBe(true);
    const sanitized = (result.sanitized as { prDiff: string }).prDiff;
    expect(Buffer.byteLength(sanitized, 'utf-8')).toBeLessThan(MAX_REVIEWED_DIFF_BYTES);
  });

  it('records a PREFIX binding, bound to the raw hash, from raw args', async () => {
    await captureHandler()({
      prTitle: 'Regenerate governance blocks',
      prDiff: RAW_DIFF,
      simulate: false,
      prNumber: 6177,
      baseSha: 'a'.repeat(40),
    });
    const line = readFileSync(process.env[PR_REVIEW_RECORDS_PATH_ENV]!, 'utf-8')
      .split('\n')
      .filter((l) => l.trim() !== '')[0];
    const record = PrReviewRecordSchema.parse(JSON.parse(line!));
    // The hash the middleware computed over the raw bytes, truncated at the cap...
    expect(record.reviewedDiffHash).toBe(computeReviewedDiffHash(RAW_DIFF));
    // ...and the bounds say so, instead of `all N bytes` over the sanitized text.
    expect(record.bindingBounds).toEqual({ kind: 'prefix', boundBytes: MAX_REVIEWED_DIFF_BYTES });
    expect(record.summary).toContain('binding covers first 50,000 bytes (raw)');
    expect(record.coverage?.panelRead).toBe('full');
    // The disclosure still names the sanitized bytes the panel read.
    expect(record.sanitization?.sanitizedDiffHash).not.toBe(record.reviewedDiffHash);
  });
});

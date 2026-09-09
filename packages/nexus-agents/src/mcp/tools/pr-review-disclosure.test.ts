/**
 * Seam test for the sanitization disclosure (#5385).
 *
 * The unit tests either side of this one pass while the wiring between them is
 * broken. `secure-handler.test.ts` proves the middleware puts `commentsRemoved`
 * on `HandlerContext`; `pr-review-tool.test.ts` proves `buildPrReviewProposal`
 * renders the note when told a count. Neither proves the HANDLER carries the
 * one to the other — mutating both call sites to pass `0` left all 158 of those
 * tests green.
 *
 * That gap is the whole defect: on the MCP path the middleware strips the
 * comments before dispatch, so the builder re-sanitizes clean text, counts 0,
 * and the note never fires — on the one path that persists a governance record.
 *
 * `collectRealVotes` is mocked here purely to capture the proposal text the
 * panel would have received. It lives in its own file so that mock does not
 * leak into the existing suite.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const captured: { proposal: string | undefined } = { proposal: undefined };
/** When set, the mock returns one live approve so a record can be persisted. */
const liveVote = { on: false };

vi.mock('../../cli/voter-agents.js', () => ({
  collectRealVotes: (opts: { proposal: string }) => {
    captured.proposal = opts.proposal;
    if (!liveVote.on) return Promise.resolve([]);
    return Promise.resolve([
      {
        role: 'architect',
        vote: { decision: 'approve', confidence: 0.9, reasoning: 'ok' },
        source: 'cli',
        cli: 'claude',
        processingTimeMs: 1,
      },
    ]);
  },
}));
vi.mock('../middleware/tool-wrapper.js', () => ({
  wrapToolWithTimeout: (_name: string, fn: unknown) => fn,
  toSdkCallback: (fn: unknown) => fn,
  getToolTimeout: () => 900_000,
}));
vi.mock('../middleware/secure-handler.js', () => ({
  createSecureHandler: (fn: unknown) => fn,
}));

import { registerPrReviewTool } from './pr-review-tool.js';
import { createLogger } from '../../core/index.js';
import type { HandlerContext } from '../middleware/secure-handler.js';
import { PrReviewRecordSchema } from '../../audit/pr-review-record.js';
import { PR_REVIEW_RECORDS_PATH_ENV } from '../../audit/pr-review-record-store.js';

type Ctx = Pick<HandlerContext, 'logger' | 'sanitization'>;
type Handler = (args: unknown, ctx: Ctx) => Promise<unknown>;

/** Registers against a mock server and returns the bare `(args, ctx)` handler. */
function captureHandler(): Handler {
  let handler: Handler | undefined;
  const server = {
    registerTool: (_name: string, _schema: unknown, cb: Handler) => {
      handler = cb;
    },
  };
  registerPrReviewTool(server as never, {
    rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) } as never,
  });
  if (handler === undefined) throw new Error('handler not registered');
  return handler;
}

const ARGS = {
  prTitle: 'Regenerate governance blocks',
  prDescription: 'body with the comment already stripped by the middleware',
  prDiff: 'diff --git a/CLAUDE.md b/CLAUDE.md\n+prose\n',
  simulate: true,
};

function ctx(commentsRemoved: number): Ctx {
  return {
    logger: createLogger({ tool: 'pr-review-disclosure.test' }),
    sanitization: {
      wasModified: commentsRemoved > 0,
      commentsRemoved,
      fieldsModified: commentsRemoved,
      rawFieldHashes: {},
    },
  };
}

describe('the middleware disclosure reaches the voter proposal (#5385)', () => {
  beforeEach(() => {
    captured.proposal = undefined;
  });

  it('annotates the proposal with the count the MIDDLEWARE reported', async () => {
    // The args are already clean — exactly as the handler receives them on the
    // MCP path — so the builder's own re-sanitization counts 0. The note can
    // only appear if the handler forwarded ctx.sanitization.commentsRemoved.
    await captureHandler()(ARGS, ctx(2));

    expect(captured.proposal).toBeDefined();
    expect(captured.proposal).toContain('2 HTML comment(s) were removed');
  });

  it('leaves the proposal unannotated when the middleware removed nothing', async () => {
    await captureHandler()(ARGS, ctx(0));

    expect(captured.proposal).toBeDefined();
    expect(captured.proposal).not.toContain('HTML comment(s) were removed');
  });
});

describe('the middleware disclosure reaches the persisted RECORD (#5385)', () => {
  // The other seam. `sanitizationViewOf` builds the producer's input from
  // `ctx.sanitization`, and nothing downstream of it was covered: hardcoding
  // `fieldsModified: 0` at that call site left every other suite green, which is
  // precisely how the tag-strip blind spot could have been reintroduced.
  //
  // `commentsRemoved` and `fieldsModified` are given DIFFERENT values on
  // purpose. Equal ones would let a handler that forwarded the wrong field pass.
  let dir: string;
  let prev: string | undefined;

  beforeEach(() => {
    liveVote.on = true;
    dir = mkdtempSync(join(tmpdir(), 'pr-review-disclosure-'));
    prev = process.env[PR_REVIEW_RECORDS_PATH_ENV];
    process.env[PR_REVIEW_RECORDS_PATH_ENV] = join(dir, 'records.jsonl');
  });

  afterEach(() => {
    liveVote.on = false;
    if (prev === undefined) Reflect.deleteProperty(process.env, PR_REVIEW_RECORDS_PATH_ENV);
    else process.env[PR_REVIEW_RECORDS_PATH_ENV] = prev;
    rmSync(dir, { recursive: true, force: true });
  });

  it('carries BOTH counters from ctx.sanitization onto the record', async () => {
    await captureHandler()(
      { ...ARGS, simulate: false, prNumber: 5385, baseSha: 'f'.repeat(40) },
      {
        logger: createLogger({ tool: 'pr-review-disclosure.test' }),
        sanitization: {
          wasModified: true,
          commentsRemoved: 2,
          fieldsModified: 5,
          rawFieldHashes: { prDiff: 'a'.repeat(64) },
        },
      }
    );

    const line = readFileSync(process.env[PR_REVIEW_RECORDS_PATH_ENV]!, 'utf-8')
      .split('\n')
      .filter((l) => l.trim() !== '')[0];
    const record = PrReviewRecordSchema.parse(JSON.parse(line!));
    expect(record.sanitization?.commentsRemoved).toBe(2);
    expect(record.sanitization?.fieldsModified).toBe(5);
    // And the binding used the RAW hash the middleware supplied, not prDiff's.
    expect(record.reviewedDiffHash).toBe('a'.repeat(64));
  });
});

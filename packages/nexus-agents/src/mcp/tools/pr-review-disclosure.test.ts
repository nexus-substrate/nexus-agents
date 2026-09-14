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
// #6003: the tool resolves the panel's seats before the vote, and the CLI
// path of that resolution probes for installed CLIs. None is, under the spawn
// guard; answer "none" so every seat is the registry default (pending
// detection) and the budget falls back to the binding cap.
vi.mock('../../cli-adapters/factory.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../cli-adapters/factory.js')>()),
  getAvailableClis: () => Promise.resolve([]),
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
import { MAX_REVIEWED_DIFF_BYTES } from '../../audit/reviewed-diff-hash.js';

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
      tagsRemoved: 0,
      rawFieldHashes: {},
      rawFieldBytes: {},
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

  it('carries a MASKED tag strip onto the record and into the note (#5385)', async () => {
    // The state six ratification seats executed. A comment alongside a tag made
    // every consumer report the removal as a routine comment strip, because both
    // renderers branched on `commentsRemoved` first. The record must carry the tag
    // count and the panel must be warned, WITH the comment present.
    //
    // Drives the REAL handler so the whole wire is covered: ctx -> view ->
    // producer -> record, and ctx -> note -> proposal.
    await captureHandler()(
      { ...ARGS, simulate: false, prNumber: 5386, baseSha: 'e'.repeat(40) },
      {
        logger: createLogger({ tool: 'pr-review-disclosure.test' }),
        sanitization: {
          wasModified: true,
          commentsRemoved: 1,
          fieldsModified: 1,
          tagsRemoved: 3,
          rawFieldHashes: { prDiff: 'b'.repeat(64) },
          rawFieldBytes: { prDiff: ARGS.prDiff.length + 30 },
        },
      }
    );

    const line = readFileSync(process.env[PR_REVIEW_RECORDS_PATH_ENV]!, 'utf-8')
      .split('\n')
      .filter((l) => l.trim() !== '')[0];
    const record = PrReviewRecordSchema.parse(JSON.parse(line!));
    expect(record.sanitization?.tagsRemoved).toBe(3);
    expect(record.sanitization?.commentsRemoved).toBe(1);
    // The panel was told about the tag, not only the comment.
    expect(captured.proposal).toContain('POSSIBLE PROMPT-INJECTION');
    expect(captured.proposal).toContain('HTML comment(s) were removed');
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
          tagsRemoved: 0,
          rawFieldHashes: { prDiff: 'a'.repeat(64) },
          rawFieldBytes: { prDiff: ARGS.prDiff.length + 30 },
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

describe('binding bounds are decided over the RAW bytes the hash covers (#6177)', () => {
  // The #6003 stamp measured `totalBytes` / `boundBytes` / `binding` over
  // `input.prDiff`, which on the MCP path is the middleware-SANITIZED text,
  // while `reviewedDiffHash` was computed by the middleware over the RAW bytes
  // and truncated at MAX_REVIEWED_DIFF_BYTES. A raw diff over the cap whose
  // sanitized form is under it was recorded as `binding covers all N bytes`
  // beside a hash that had truncated — and `warnIfDiffTruncated`, reading the
  // same sanitized input, stayed silent.
  //
  // Drives the REAL handler: ctx.sanitization -> view -> packer -> producer ->
  // record, exactly the wire the defect lives on.
  let dir: string;
  let prev: string | undefined;
  const warn = vi.fn();

  beforeEach(() => {
    liveVote.on = true;
    warn.mockReset();
    dir = mkdtempSync(join(tmpdir(), 'pr-review-raw-binding-'));
    prev = process.env[PR_REVIEW_RECORDS_PATH_ENV];
    process.env[PR_REVIEW_RECORDS_PATH_ENV] = join(dir, 'records.jsonl');
  });

  afterEach(() => {
    liveVote.on = false;
    if (prev === undefined) Reflect.deleteProperty(process.env, PR_REVIEW_RECORDS_PATH_ENV);
    else process.env[PR_REVIEW_RECORDS_PATH_ENV] = prev;
    rmSync(dir, { recursive: true, force: true });
  });

  /** A logger whose `warn` is observable; everything else is the real one. */
  function spyLogger(): Ctx['logger'] {
    const real = createLogger({ tool: 'pr-review-raw-binding.test' });
    return { ...real, warn, child: () => real };
  }

  /** The raw diff was `rawBytes` long; the middleware hands the handler the sanitized form. */
  function ctxWithRaw(rawBytes: number | undefined): Ctx {
    return {
      logger: spyLogger(),
      sanitization: {
        wasModified: true,
        commentsRemoved: 1,
        fieldsModified: 1,
        tagsRemoved: 0,
        rawFieldHashes: { prDiff: 'c'.repeat(64) },
        rawFieldBytes: rawBytes === undefined ? {} : { prDiff: rawBytes },
      },
    };
  }

  function firstRecord(): ReturnType<typeof PrReviewRecordSchema.parse> {
    const line = readFileSync(process.env[PR_REVIEW_RECORDS_PATH_ENV]!, 'utf-8')
      .split('\n')
      .filter((l) => l.trim() !== '')[0];
    return PrReviewRecordSchema.parse(JSON.parse(line!));
  }

  /** A unified diff of at least `bytes` UTF-8 bytes (ASCII, so bytes == length). */
  function diffOfBytes(bytes: number): string {
    const head = 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,1 +1,1 @@\n';
    const line = '+0123456789abcdef\n';
    return head + line.repeat(Math.ceil((bytes - head.length) / line.length));
  }

  function warnings(): string[] {
    return warn.mock.calls.map((c) => String(c[0]));
  }

  // The sanitized diff the handler receives is ARGS.prDiff, a few dozen bytes;
  // the raw one was 50,010 — an HTML comment of ~50k bytes was stripped before
  // dispatch, which is the reach condition the issue names.
  const RAW_OVER_CAP = MAX_REVIEWED_DIFF_BYTES + 10;

  it('raw over the cap, sanitized under it: the record says the binding is a PREFIX', async () => {
    await captureHandler()(
      { ...ARGS, simulate: false, prNumber: 6177, baseSha: 'a'.repeat(40) },
      ctxWithRaw(RAW_OVER_CAP)
    );
    const record = firstRecord();
    expect(record.bindingBounds).toEqual({ kind: 'prefix', boundBytes: MAX_REVIEWED_DIFF_BYTES });
    expect(record.summary).toContain('binding covers first 50,000 bytes');
    // The panel read the whole sanitized text; only the BINDING is partial.
    expect(record.coverage?.panelRead).toBe('full');
  });

  it('and the truncation warning fires on the RAW length, not the sanitized one', async () => {
    await captureHandler()(
      { ...ARGS, simulate: false, prNumber: 6178, baseSha: 'a'.repeat(40) },
      ctxWithRaw(RAW_OVER_CAP)
    );
    expect(warnings().some((m) => m.includes('exceeds the hash byte cap'))).toBe(true);
  });

  it('the pair: raw under the cap states nothing and warns nothing', async () => {
    await captureHandler()(
      { ...ARGS, simulate: false, prNumber: 6179, baseSha: 'a'.repeat(40) },
      ctxWithRaw(ARGS.prDiff.length + 40)
    );
    expect(firstRecord().bindingBounds).toBeUndefined();
    expect(warnings().some((m) => m.includes('exceeds the hash byte cap'))).toBe(false);
    expect(warnings().some((m) => m.includes('no raw byte length'))).toBe(false);
  });

  it('names the empty case: no raw byte length falls back to the sanitized measurement and SAYS SO', async () => {
    // An older middleware that hashes but does not measure. The sanitized diff
    // is over the cap here so the fallback has something to state; the stamp
    // must name the sanitized source rather than read as a raw measurement.
    await captureHandler()(
      {
        ...ARGS,
        prDiff: diffOfBytes(MAX_REVIEWED_DIFF_BYTES + 200),
        simulate: false,
        prNumber: 6180,
        baseSha: 'a'.repeat(40),
      },
      ctxWithRaw(undefined)
    );
    const record = firstRecord();
    expect(record.bindingBounds?.kind).toBe('prefix');
    expect(record.summary).toContain(
      'binding covers first 50,000 bytes (sanitized; raw length not supplied)'
    );
    expect(warnings().some((m) => m.includes('no raw byte length'))).toBe(true);
  });

  it('the empty case never claims FULL from a missing number', async () => {
    // Sanitized under the cap, raw length unknown: the record must not carry a
    // `full` binding it could not measure. Absent is honest; `full` is not.
    await captureHandler()(
      { ...ARGS, simulate: false, prNumber: 6181, baseSha: 'a'.repeat(40) },
      ctxWithRaw(undefined)
    );
    expect(firstRecord().bindingBounds?.kind).not.toBe('full');
    expect(warnings().some((m) => m.includes('no raw byte length'))).toBe(true);
  });
});

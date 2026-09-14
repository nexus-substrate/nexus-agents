/**
 * The binding is measured over the bytes the hash covers (#6177).
 *
 * `resolveBindingMeasurement` is the one place that chooses which bytes the
 * `bindingBounds` / truncation-warning decision is made over. Both the packer
 * and the producer consume it, so the cases here are the cases the record can
 * be in: no sanitizer, a sanitizer that measured, a sanitizer that did not.
 */

import { describe, expect, it } from 'vitest';
import { createLogger } from '../../core/index.js';
import {
  MAX_REVIEWED_DIFF_BYTES,
  reviewedDiffWasTruncated,
} from '../../audit/reviewed-diff-hash.js';
import type { HandlerContext } from '../middleware/secure-handler.js';
import { resolveBindingMeasurement, sanitizationViewOf } from './pr-review-sanitization-view.js';
import type { ReviewSanitizationInput } from './pr-review-record-producer.js';

/** A ctx whose middleware measured the raw `prDiff` as `rawBytes` long. */
function ctxOf(rawBytes: number | undefined): HandlerContext {
  return {
    requestContext: {} as HandlerContext['requestContext'],
    logger: createLogger({ tool: 'pr-review-sanitization-view.test' }),
    sanitization: {
      wasModified: true,
      commentsRemoved: 1,
      fieldsModified: 1,
      tagsRemoved: 0,
      rawFieldHashes: { prDiff: 'd'.repeat(64) },
      rawFieldBytes: rawBytes === undefined ? {} : { prDiff: rawBytes },
    },
  };
}

const SANITIZED = 'diff --git a/x b/x\n+line\n';

describe('sanitizationViewOf carries the raw length and the raw truncation verdict (#6177)', () => {
  it('forwards the middleware byte count and decides truncation by the hash cap', () => {
    const view = sanitizationViewOf(ctxOf(MAX_REVIEWED_DIFF_BYTES + 1));
    expect(view.rawDiffBytes).toBe(MAX_REVIEWED_DIFF_BYTES + 1);
    expect(view.rawTruncated).toBe(true);
  });

  it('agrees with reviewedDiffWasTruncated at the boundary, both sides of it', () => {
    // The string predicate is the canonical one; the view has only the length.
    // Pin the two at the cap exactly and one past it, where they could diverge.
    for (const bytes of [MAX_REVIEWED_DIFF_BYTES, MAX_REVIEWED_DIFF_BYTES + 1]) {
      const raw = 'x'.repeat(bytes);
      expect(sanitizationViewOf(ctxOf(bytes)).rawTruncated).toBe(reviewedDiffWasTruncated(raw));
    }
  });

  it('names the empty case: no measurement gives undefined for BOTH, not false', () => {
    // A missing number is not "not truncated". `rawTruncated: false` here
    // would let the producer state a full binding it never measured.
    const view = sanitizationViewOf(ctxOf(undefined));
    expect(view.rawDiffBytes).toBeUndefined();
    expect(view.rawTruncated).toBeUndefined();
    expect(view.rawDiffHash).toBe('d'.repeat(64));
  });
});

describe('resolveBindingMeasurement — which bytes the binding is decided over (#6177)', () => {
  const measured: ReviewSanitizationInput = {
    rawDiffHash: 'd'.repeat(64),
    rawDiffBytes: MAX_REVIEWED_DIFF_BYTES + 10,
    rawTruncated: true,
    commentsRemoved: 1,
    fieldsModified: 1,
    tagsRemoved: 0,
  };

  it('no sanitizer: the diff as handed IS the raw diff — measured, source input', () => {
    expect(resolveBindingMeasurement(SANITIZED, undefined)).toEqual({
      totalBytes: Buffer.byteLength(SANITIZED, 'utf-8'),
      truncated: false,
      source: 'input',
    });
  });

  it('a sanitizer that measured: the middleware numbers, source raw — not the sanitized text', () => {
    const m = resolveBindingMeasurement(SANITIZED, measured);
    expect(m).toEqual({ totalBytes: MAX_REVIEWED_DIFF_BYTES + 10, truncated: true, source: 'raw' });
    // The defect: the sanitized text is under the cap; the raw bytes are not.
    expect(Buffer.byteLength(SANITIZED, 'utf-8')).toBeLessThan(MAX_REVIEWED_DIFF_BYTES);
  });

  it('a sanitizer that did NOT measure: the sanitized text, and the source SAYS SO', () => {
    const older: ReviewSanitizationInput = {
      ...measured,
      rawDiffBytes: undefined,
      rawTruncated: undefined,
    };
    expect(resolveBindingMeasurement(SANITIZED, older)).toEqual({
      totalBytes: Buffer.byteLength(SANITIZED, 'utf-8'),
      truncated: false,
      source: 'sanitized-fallback',
    });
  });

  it('half a measurement is no measurement: a length without a verdict falls back', () => {
    // The pair travels together from the view; a caller that hands one without
    // the other is not the current middleware, and must not be read as `raw`.
    const half: ReviewSanitizationInput = { ...measured, rawTruncated: undefined };
    expect(resolveBindingMeasurement(SANITIZED, half).source).toBe('sanitized-fallback');
    const other: ReviewSanitizationInput = { ...measured, rawDiffBytes: undefined };
    expect(resolveBindingMeasurement(SANITIZED, other).source).toBe('sanitized-fallback');
  });

  it('the fallback still reports truncation of the text it DID measure', () => {
    const big = 'diff --git a/x b/x\n' + '+y\n'.repeat(MAX_REVIEWED_DIFF_BYTES / 2);
    const older: ReviewSanitizationInput = {
      ...measured,
      rawDiffBytes: undefined,
      rawTruncated: undefined,
    };
    const m = resolveBindingMeasurement(big, older);
    expect(m.truncated).toBe(reviewedDiffWasTruncated(big));
    expect(m.truncated).toBe(true);
  });
});

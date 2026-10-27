/** Immutable resolved input for builtin pipeline acceptance delivery (#7663). */
import { createHash } from 'node:crypto';
import { err, ok, type Result } from '../core/result.js';
import { MAX_VOTE_ARTIFACT_BYTES } from '../cli/vote-artifact.js';
import type { TrustTier } from '../security/trust-types.js';

export interface AcceptanceIdentity {
  readonly sha256: string;
  readonly bytes: number;
}

/** An absent observation never becomes an observed zero. */
export type AcceptanceSanitization =
  | Readonly<{ status: 'unmeasured' }>
  | Readonly<{ status: 'unmodified' }>
  | Readonly<{
      status: 'modified';
      counts: Readonly<{ tagsRemoved: number; commentsRemoved: number; fieldsModified: number }>;
    }>;

export interface AcceptanceContext {
  readonly source: Readonly<{
    kind: 'task' | 'planFile' | 'goal';
    identity: AcceptanceIdentity;
    rawPreMiddleware: 'unavailable';
  }>;
  readonly projection: Readonly<{ text: string; identity: AcceptanceIdentity }>;
  readonly provenance: Readonly<{
    callerTrustTier: TrustTier | 'unmeasured';
    sourceTrustTier: TrustTier | 'unmeasured';
    argumentSanitization: AcceptanceSanitization;
    projectionSanitization: AcceptanceSanitization;
  }>;
}

interface CaptureAcceptanceInput {
  readonly kind: AcceptanceContext['source']['kind'];
  readonly source: string | Uint8Array;
  readonly projection?: string;
  readonly callerTrustTier?: TrustTier;
  readonly sourceTrustTier?: TrustTier;
  readonly argumentSanitization?: AcceptanceSanitization;
  readonly projectionSanitization?: AcceptanceSanitization;
}

/** Decode without replacement, clipping, BOM removal, or empty acceptance. */
export function decodeAcceptanceSource(source: string | Uint8Array): Result<string, Error> {
  if (typeof source === 'string' && !source.isWellFormed()) {
    return err(new Error('Acceptance input contains a lone surrogate'));
  }
  const size = typeof source === 'string' ? Buffer.byteLength(source) : source.byteLength;
  if (size > MAX_VOTE_ARTIFACT_BYTES) {
    return err(new Error('Acceptance input exceeds the vote artifact byte limit'));
  }
  try {
    const text =
      typeof source === 'string'
        ? source
        : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(source);
    if (text.trim() === '') return err(new Error('Acceptance input is empty'));
    if (text.includes('\0')) return err(new Error('Acceptance input contains a NUL byte'));
    return ok(text);
  } catch {
    return err(new Error('Acceptance input is not valid UTF-8'));
  }
}

function identity(text: string): AcceptanceIdentity {
  return Object.freeze({
    sha256: createHash('sha256').update(text).digest('hex'),
    bytes: Buffer.byteLength(text),
  });
}

function freezeMeasurement(value?: AcceptanceSanitization): AcceptanceSanitization {
  if (value === undefined) return Object.freeze({ status: 'unmeasured' });
  return value.status === 'modified'
    ? Object.freeze({ status: value.status, counts: Object.freeze({ ...value.counts }) })
    : Object.freeze({ status: value.status });
}

/** Capture values, not mutable buffers or caller-owned measurement objects. */
export function captureAcceptanceContext(
  input: CaptureAcceptanceInput
): Result<AcceptanceContext, Error> {
  const source = decodeAcceptanceSource(input.source);
  if (!source.ok) return source;
  const projection = decodeAcceptanceSource(input.projection ?? source.value);
  if (!projection.ok) return projection;
  return ok(
    Object.freeze({
      source: Object.freeze({
        kind: input.kind,
        identity: identity(source.value),
        rawPreMiddleware: 'unavailable' as const,
      }),
      projection: Object.freeze({ text: projection.value, identity: identity(projection.value) }),
      provenance: Object.freeze({
        callerTrustTier: input.callerTrustTier ?? 'unmeasured',
        sourceTrustTier: input.sourceTrustTier ?? 'unmeasured',
        argumentSanitization: freezeMeasurement(input.argumentSanitization),
        projectionSanitization: freezeMeasurement(input.projectionSanitization),
      }),
    })
  );
}

/** Immutable resolved input for builtin pipeline acceptance delivery (#7663). */
import { createHash } from 'node:crypto';
import { err, ok, type Result } from '../core/result.js';
import { MAX_VOTE_ARTIFACT_BYTES } from '../cli/vote-artifact.js';
import type { TrustTier } from '../security/trust-types.js';

const capturedContexts = new WeakSet<object>();

/** Internal capture provenance, not a claim of model delivery or trusted content. */
export function isCapturedAcceptanceContext(value: unknown): value is AcceptanceContext {
  return typeof value === 'object' && value !== null && capturedContexts.has(value);
}

function registerCapture(value: AcceptanceContext): AcceptanceContext {
  capturedContexts.add(value);
  return value;
}

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

type SimpleAcceptanceKind = 'task' | 'planFile' | 'goal' | 'specFile';

/** Component metadata deliberately excludes both original and projected text. */
export interface AcceptanceComponent {
  readonly sourceIdentity: AcceptanceIdentity;
  readonly projectionIdentity: AcceptanceIdentity;
  readonly provenance: AcceptanceContext['provenance'];
}

type AcceptanceSource = Readonly<{
  identity: AcceptanceIdentity;
  rawPreMiddleware: 'unavailable';
}> &
  (
    | Readonly<{ kind: SimpleAcceptanceKind }>
    | Readonly<{
        kind: 'specFile+task';
        components: Readonly<{ specFile: AcceptanceComponent; task: AcceptanceComponent }>;
      }>
  );

export interface AcceptanceContext {
  readonly source: AcceptanceSource;
  readonly projection: Readonly<{ text: string; identity: AcceptanceIdentity }>;
  readonly provenance: Readonly<{
    callerTrustTier: TrustTier | 'unmeasured';
    sourceTrustTier: TrustTier | 'unmeasured';
    argumentSanitization: AcceptanceSanitization;
    projectionSanitization: AcceptanceSanitization;
  }>;
}

interface CaptureAcceptanceInput {
  readonly kind: SimpleAcceptanceKind;
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

export function acceptanceIdentity(text: string): AcceptanceIdentity {
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
    registerCapture(
      Object.freeze({
        source: Object.freeze({
          kind: input.kind,
          identity: acceptanceIdentity(source.value),
          rawPreMiddleware: 'unavailable' as const,
        }),
        projection: Object.freeze({
          text: projection.value,
          identity: acceptanceIdentity(projection.value),
        }),
        provenance: Object.freeze({
          callerTrustTier: input.callerTrustTier ?? 'unmeasured',
          sourceTrustTier: input.sourceTrustTier ?? 'unmeasured',
          argumentSanitization: freezeMeasurement(input.argumentSanitization),
          projectionSanitization: freezeMeasurement(input.projectionSanitization),
        }),
      })
    )
  );
}

/** Combine independently captured file/task inputs without storing component text. */
export function combineSpecAcceptance(
  fileSource: Uint8Array,
  file: AcceptanceContext,
  task: AcceptanceContext
): Result<AcceptanceContext, Error> {
  if (
    !isCapturedAcceptanceContext(file) ||
    !isCapturedAcceptanceContext(task) ||
    file.source.kind !== 'specFile' ||
    task.source.kind !== 'task'
  ) {
    return err(new Error('Composite acceptance requires a specFile and task'));
  }
  if (!sameIdentity(task.source.identity, task.projection.identity)) {
    return err(new Error('Composite task must retain its post-middleware source unchanged'));
  }
  const decoded = decodeAcceptanceSource(fileSource);
  if (!decoded.ok) return decoded;
  if (acceptanceIdentity(decoded.value).sha256 !== file.source.identity.sha256) {
    return err(new Error('Spec file source does not match its captured identity'));
  }
  const separator = '\n\n---\n\n';
  const composite = captureAcceptanceContext({
    kind: 'task',
    source: `${decoded.value}${separator}${task.projection.text}`,
    projection: `${file.projection.text}${separator}${task.projection.text}`,
    ...(task.provenance.callerTrustTier !== 'unmeasured'
      ? { callerTrustTier: task.provenance.callerTrustTier }
      : {}),
    argumentSanitization: task.provenance.argumentSanitization,
  });
  if (!composite.ok) return composite;
  return ok(
    registerCapture(
      Object.freeze({
        ...composite.value,
        source: Object.freeze({
          ...composite.value.source,
          kind: 'specFile+task' as const,
          components: Object.freeze({ specFile: component(file), task: component(task) }),
        }),
      })
    )
  );
}

function component(value: AcceptanceContext): AcceptanceComponent {
  return Object.freeze({
    sourceIdentity: value.source.identity,
    projectionIdentity: value.projection.identity,
    provenance: value.provenance,
  });
}

function sameIdentity(left: AcceptanceIdentity, right: AcceptanceIdentity): boolean {
  return left.sha256 === right.sha256 && left.bytes === right.bytes;
}

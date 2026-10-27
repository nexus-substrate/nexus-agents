import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  captureAcceptanceContext,
  decodeAcceptanceSource,
  type AcceptanceIdentity,
} from './acceptance-context.js';

const identity = (text: string): AcceptanceIdentity => ({
  sha256: createHash('sha256').update(text).digest('hex'),
  bytes: Buffer.byteLength(text),
});

describe('acceptance source validation', () => {
  it.each(['', '   ', 'x\0y', '\ud800', 'x'.repeat(262145)])(
    'rejects invalid text without clipping',
    (source) => {
      expect(decodeAcceptanceSource(source).ok).toBe(false);
    }
  );
  it('rejects malformed UTF-8 instead of hashing replacement characters', () => {
    expect(decodeAcceptanceSource(Uint8Array.of(0xc3, 0x28)).ok).toBe(false);
  });
  it('retains the BOM and multibyte bytes exactly', () => {
    const text = '\ufeffAccept café';
    expect(decodeAcceptanceSource(Buffer.from(text))).toEqual({ ok: true, value: text });
  });
});

describe('immutable acceptance snapshot', () => {
  it('separates source/projection and never invents missing observations', () => {
    const result = captureAcceptanceContext({ kind: 'task', source: 'Accept café' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.source).toEqual({
      kind: 'task',
      identity: identity('Accept café'),
      rawPreMiddleware: 'unavailable',
    });
    expect(result.value.projection).toEqual({
      text: 'Accept café',
      identity: identity('Accept café'),
    });
    expect(result.value.provenance).toEqual({
      callerTrustTier: 'unmeasured',
      sourceTrustTier: 'unmeasured',
      argumentSanitization: { status: 'unmeasured' },
      projectionSanitization: { status: 'unmeasured' },
    });
  });
  it('copies measurements and bytes, retaining separate trust and immutable identities', () => {
    const source = Buffer.from('<system>Accept café</system>');
    const counts = { tagsRemoved: 2, commentsRemoved: 0, fieldsModified: 1 };
    const result = captureAcceptanceContext({
      kind: 'planFile',
      source,
      projection: 'Accept café',
      callerTrustTier: '1',
      sourceTrustTier: '3',
      projectionSanitization: { status: 'modified', counts },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const snapshot = result.value;
    source.fill(0);
    counts.tagsRemoved = 99;
    expect(snapshot.source.identity).toEqual(identity('<system>Accept café</system>'));
    expect(snapshot.projection.identity).toEqual(identity('Accept café'));
    expect(snapshot.provenance.projectionSanitization).toEqual({
      status: 'modified',
      counts: { tagsRemoved: 2, commentsRemoved: 0, fieldsModified: 1 },
    });
    expect(snapshot.provenance.callerTrustTier).toBe('1');
    expect(snapshot.provenance.sourceTrustTier).toBe('3');
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.projection.identity)).toBe(true);
    expect(() => Reflect.set(snapshot.projection, 'text', 'changed')).not.toThrow();
    expect(snapshot.projection.text).toBe('Accept café');
  });
  it('rejects a projection that became empty after cleaning', () => {
    expect(
      captureAcceptanceContext({ kind: 'planFile', source: '<system></system>', projection: '' }).ok
    ).toBe(false);
  });
});

/**
 * Tests for verifyChain (#2281). Distinct from audit-logger.test.ts because
 * those tests stub `node:crypto` to a deterministic fake hash; here we need
 * real SHA-256 to validate round-trips.
 *
 * @module audit/audit-chain-verify.test
 */

import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import { verifyChain, withCoverage } from './audit-logger.js';
import type { AuditEvent } from './audit-types.js';

function realHash(event: AuditEvent): string {
  const data = JSON.stringify({
    id: event.id,
    timestamp: event.timestamp,
    category: event.category,
    action: event.action,
    outcome: event.outcome,
    actor: event.actor,
    previousHash: event.previousHash,
  });
  return crypto.createHash('sha256').update(data).digest('hex');
}

function makeEvent(
  id: string,
  previousHash: string | undefined,
  overrides: Partial<AuditEvent> = {}
): AuditEvent {
  const base: AuditEvent = {
    id,
    version: '1.0',
    timestamp: '2026-04-28T00:00:00.000Z',
    timestampMs: 1745798400000,
    category: 'system',
    severity: 'info',
    outcome: 'success',
    action: 'test.action',
    actor: { type: 'system', id: 'nexus-agents', name: 'Test System' },
    previousHash,
    ...overrides,
  };
  return { ...base, hash: realHash(base) };
}

function chain(count: number): AuditEvent[] {
  const events: AuditEvent[] = [];
  let prevHash: string | undefined = undefined;
  for (let i = 0; i < count; i++) {
    const e = makeEvent(`aud_${String(i)}`, prevHash);
    events.push(e);
    prevHash = e.hash;
  }
  return events;
}

describe('verifyChain', () => {
  it('returns ok for an empty chain', () => {
    const r = verifyChain([]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.eventCount).toBe(0);
  });

  it('validates a clean 5-event chain', () => {
    const r = verifyChain(chain(5));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.eventCount).toBe(5);
  });

  it('treats a log without hashes as un-chained (legacy compat)', () => {
    const events: AuditEvent[] = [
      {
        id: 'aud_0',
        version: '1.0',
        timestamp: '2026-04-28T00:00:00.000Z',
        timestampMs: 1745798400000,
        category: 'system',
        severity: 'info',
        outcome: 'success',
        action: 'test',
        actor: { type: 'system', id: 'sys' },
      },
    ];
    const r = verifyChain(events);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.eventCount).toBe(1);
  });

  it('detects hash_mismatch when an event body is tampered', () => {
    const events = chain(3);
    // Tamper the action field of event 1 without recomputing hash.
    const tampered = { ...events[1]!, action: 'malicious.action' };
    const r = verifyChain([events[0]!, tampered, events[2]!]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('hash_mismatch');
      expect(r.eventIndex).toBe(1);
    }
  });

  it('detects previous_hash_mismatch when an event is removed mid-chain', () => {
    const events = chain(4);
    // Drop event 2; event 3's previousHash now points to a missing predecessor.
    const r = verifyChain([events[0]!, events[1]!, events[3]!]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('previous_hash_mismatch');
      expect(r.eventIndex).toBe(2);
    }
  });

  it('detects missing_hash when chain starts hashed but a later event has no hash', () => {
    const events = chain(3);
    const noHash = { ...events[1]! };
    delete (noHash as { hash?: string }).hash;
    const r = verifyChain([events[0]!, noHash, events[2]!]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('missing_hash');
      expect(r.eventIndex).toBe(1);
    }
  });

  it('returns the first detected tamper, not subsequent ones', () => {
    const events = chain(4);
    const tamperedAtTwo = { ...events[2]!, action: 'tampered' };
    // Even though events[3] would also fail (its previousHash points to events[2] hash,
    // but events[2] hash is now stale relative to its tampered body), the function
    // should report event index 2 first.
    const r = verifyChain([events[0]!, events[1]!, tamperedAtTwo, events[3]!]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.eventIndex).toBe(2);
    }
  });

  it('reports a clear detail string with the failing event id', () => {
    const events = chain(2);
    const tampered = { ...events[1]!, action: 'evil' };
    const r = verifyChain([events[0]!, tampered]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.eventId).toBe('aud_1');
      expect(r.detail).toContain('does not match');
    }
  });
});

describe('front-truncation is detected (#4703)', () => {
  // The threat model is tamper-EVIDENT, not tamper-proof, and it accepts that
  // an adversary who recomputes the whole chain wins. What it claims to catch
  // is "naive deletions by an adversary who does not recompute the chain".
  //
  // Deleting the FIRST n lines is exactly that class, and it needed no rehash:
  // `verifyEvent` guarded the previousHash comparison with `index > 0`, so it
  // never asserted the chain starts at a genesis. The remainder verified clean
  // while its new head still carried a live 64-hex pointer to a deleted event —
  // the evidence was in hand and discarded.

  it('reports unanchored_head when the head still points at a predecessor', () => {
    const full = chain(6);
    const truncated = full.slice(3);

    // Precondition: nothing was rehashed. The head carries its old pointer.
    expect(truncated[0]?.previousHash).toBeDefined();

    const verdict = verifyChain(truncated);

    // Deliberately NOT ok:false. Routine log rotation produces this identical
    // shape, and a verifier that reports tamper on every rotated deployment is
    // one operators learn to dismiss — which is how a real tamper gets waved
    // through. The links DO all verify; what is unverified is the origin.
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.unanchoredHead).toBeDefined();
      // The pointer to the deleted predecessor belongs in the record, not the bin.
      expect(verdict.unanchoredHead?.previousHash).toBe(truncated[0]?.previousHash);
      expect(verdict.unanchoredHead?.detail).toContain('ORIGIN is unverified');
    }
  });

  it('a genesis chain carries NO unanchoredHead — absence is meaningful', () => {
    const verdict = verifyChain(chain(6));
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.unanchoredHead).toBeUndefined();
  });

  it('a genuine genesis chain still verifies', () => {
    const verdict = verifyChain(chain(6));
    expect(verdict.ok).toBe(true);
  });

  it('a single genesis event verifies', () => {
    expect(verifyChain(chain(1)).ok).toBe(true);
  });

  it('an empty chain is unchanged — documented and accepted', () => {
    // Not in scope here: the threat model explicitly accepts this (§1.4).
    // Asserted so a future change to the empty case is a deliberate one.
    expect(verifyChain([]).ok).toBe(true);
  });

  // #4768: `ok` stays true — the threat model accepts that, and nothing
  // contradicts an absent chain. What changes is that the verdict now says it
  // verified NOTHING, which T8 names as the required mitigation for its HIGH
  // residual risk: "OK" was ambiguous between "verified chained log" and
  // "un-chained log, nothing to verify".
  describe('says what it did not verify (#4768, #4660)', () => {
    it('marks an empty chain as unverified rather than silently clean', () => {
      const r = verifyChain([]);

      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.notVerified).toBe('empty');
        expect(r.eventCount).toBe(0);
      }
    });

    it('marks an un-chained log as unverified — T8, residual risk HIGH', () => {
      // First event carries no hash, so the whole batch is treated as
      // un-chained and no links are checked. Previously indistinguishable from
      // a verified chain.
      const unhashed = chain(2).map((e) => {
        const copy: AuditEvent = { ...e };
        delete (copy as { hash?: string }).hash;
        return copy;
      });

      const r = verifyChain(unhashed);

      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.notVerified).toBe('unchained');
        expect(r.eventCount).toBe(2);
      }
    });

    it('leaves notVerified absent when links were actually checked', () => {
      // The guard-rail in the other direction: a genuinely verified chain must
      // NOT be labelled unverified, or the field is noise.
      const r = verifyChain(chain(3));

      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.notVerified).toBeUndefined();
        expect(r.eventCount).toBe(3);
      }
    });
  });
});

// ============================================================================
// Coverage travels with the verdict (#4805, panel Option A 4-1)
// ============================================================================

describe('withCoverage (#4805)', () => {
  it('states full coverage positively rather than by omission', () => {
    // `skipped: 0` is a claim. An absent `coverage` is not the same claim —
    // that distinction is the entire point of the field.
    const r = withCoverage(verifyChain(chain(3)), { skipped: 0, unreadableFiles: 0 });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.coverage).toEqual({ skipped: 0, unreadableFiles: 0 });
  });

  it('carries a partial read on the verdict, not only beside it', () => {
    // The reported case: the tool already published `skippedLines` as a sibling
    // field, but `ChainVerification` is what gets serialized and passed on
    // without its siblings.
    const r = withCoverage(verifyChain(chain(3)), { skipped: 2, unreadableFiles: 1 });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.coverage).toEqual({ skipped: 2, unreadableFiles: 1 });
  });

  it('leaves coverage absent when nobody stated it', () => {
    // `verifyChain` receives only events, so it cannot know. Absent must mean
    // UNKNOWN — defaulting it to zero would manufacture the assurance this
    // field exists to stop manufacturing.
    const r = verifyChain(chain(3));

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.coverage).toBeUndefined();
  });

  it('does not overload notVerified, which is a different axis', () => {
    // `notVerified` means nothing was verified. A partial read verified real
    // links, just not all of them — conflating them would break the meaning
    // #4768/#4660 gave that field.
    const r = withCoverage(verifyChain(chain(3)), { skipped: 2, unreadableFiles: 0 });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.notVerified).toBeUndefined();
  });

  it('leaves a failing verdict untouched', () => {
    // A detected break names an event index; coverage does not qualify it, and
    // spreading onto the failure shape would invent fields on it.
    const broken = chain(3);
    broken[1] = { ...broken[1]!, hash: 'tampered' };
    const r = withCoverage(verifyChain(broken), { skipped: 5, unreadableFiles: 0 });

    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty('coverage');
  });
});

// Segment bounds and failure indexes are inclusive, zero-based event positions.
describe('segmented verification (#7157)', () => {
  it('reports one internally verified segment for a clean file', () => {
    expect(verifyChain(chain(5))).toMatchObject({
      ok: true,
      breaks: [],
      segments: [{ start: 0, end: 4, ok: true }],
      breakCount: 0,
      segmentCount: 1,
      tamperedCount: 0,
      breaksTruncated: false,
      segmentsTruncated: false,
    });
  });

  it('reports a restart as two good segments but keeps the first link failure', () => {
    const first = chain(2);
    const restart = makeEvent('restart', undefined);
    const tail = makeEvent('tail', restart.hash);
    expect(verifyChain([...first, restart, tail])).toMatchObject({
      ok: false,
      reason: 'previous_hash_mismatch',
      eventIndex: 2,
      eventId: 'restart',
      eventCount: 4,
      breaks: [{ index: 2, kind: 'restart' }],
      breakCount: 1,
      segmentCount: 2,
      segments: [
        { start: 0, end: 1, ok: true },
        { start: 2, end: 3, ok: true },
      ],
    });
  });

  it('classifies a link to an earlier, non-adjacent event as a fork', () => {
    const first = chain(3);
    const fork = makeEvent('fork', first[0]!.hash);
    expect(verifyChain([...first, fork])).toMatchObject({
      ok: false,
      breaks: [{ index: 3, kind: 'fork' }],
      segments: [
        { start: 0, end: 2, ok: true },
        { start: 3, end: 3, ok: true },
      ],
    });
  });

  it('classifies an unknown predecessor as mismatch without claiming content tampering', () => {
    const orphan = makeEvent('orphan', 'unknown');
    expect(verifyChain([...chain(2), orphan])).toMatchObject({
      ok: false,
      breaks: [{ index: 2, kind: 'mismatch' }],
      tamperedCount: 0,
      segments: [
        { start: 0, end: 1, ok: true },
        { start: 2, end: 2, ok: true },
      ],
    });
  });

  it('detects tamper after an earlier break at the right index', () => {
    const restart = makeEvent('restart', undefined);
    const tampered = { ...makeEvent('tampered', restart.hash), action: 'changed' };
    const tail = makeEvent('tail', tampered.hash);
    expect(verifyChain([...chain(2), restart, tampered, tail])).toMatchObject({
      ok: false,
      reason: 'previous_hash_mismatch',
      eventIndex: 2,
      breaks: [
        { index: 2, kind: 'restart' },
        { index: 3, kind: 'mismatch' },
      ],
      breakCount: 2,
      segmentCount: 3,
      tamperedCount: 1,
      segments: [
        { start: 0, end: 1, ok: true },
        { start: 2, end: 2, ok: true },
        { start: 3, end: 4, ok: false, firstFailure: { index: 3, kind: 'tampered' } },
      ],
    });
  });

  it('checks content at a restart boundary as well as its link', () => {
    const restart = { ...makeEvent('restart', undefined), action: 'changed' };
    expect(verifyChain([...chain(2), restart])).toMatchObject({
      ok: false,
      reason: 'previous_hash_mismatch',
      eventIndex: 2,
      breaks: [{ index: 2, kind: 'restart' }],
      tamperedCount: 1,
      segments: [
        { start: 0, end: 1, ok: true },
        { start: 2, end: 2, ok: false, firstFailure: { index: 2, kind: 'tampered' } },
      ],
    });
  });

  it('names the empty file as unverified with zero segments', () => {
    expect(verifyChain([])).toMatchObject({
      ok: true,
      notVerified: 'empty',
      eventCount: 0,
      breaks: [],
      segments: [],
      breakCount: 0,
      segmentCount: 0,
      tamperedCount: 0,
      breaksTruncated: false,
      segmentsTruncated: false,
    });
  });

  it('verifies the content of a single event and reports a single segment', () => {
    const event = chain(1)[0]!;
    expect(verifyChain([event])).toMatchObject({
      ok: true,
      segments: [{ start: 0, end: 0, ok: true }],
      segmentCount: 1,
    });
    expect(verifyChain([{ ...event, action: 'changed' }])).toMatchObject({
      ok: false,
      reason: 'hash_mismatch',
      eventIndex: 0,
      breaks: [{ index: 0, kind: 'mismatch' }],
      segmentCount: 1,
      segments: [{ start: 0, end: 0, ok: false, firstFailure: { index: 0, kind: 'tampered' } }],
    });
  });

  it('reports a missing hash as an internally failing segment', () => {
    const events = chain(3);
    const noHash = { ...events[1]! };
    delete (noHash as { hash?: string }).hash;
    expect(verifyChain([events[0]!, noHash, events[2]!])).toMatchObject({
      ok: false,
      reason: 'missing_hash',
      eventIndex: 1,
      segments: expect.arrayContaining([
        { start: 1, end: 1, ok: false, firstFailure: { index: 1, kind: 'missing_hash' } },
      ]),
    });
  });

  it('starts a new valid segment for a restart after a hashless event', () => {
    const first = chain(2);
    const noHash = { ...first[1]! };
    delete (noHash as { hash?: string }).hash;
    const restart = makeEvent('restart', undefined);
    expect(verifyChain([first[0]!, noHash, restart])).toMatchObject({
      ok: false,
      reason: 'missing_hash',
      eventIndex: 1,
      breaks: [
        { index: 1, kind: 'mismatch' },
        { index: 2, kind: 'restart' },
      ],
      breakCount: 2,
      segmentCount: 3,
      segments: [
        { start: 0, end: 0, ok: true },
        { start: 1, end: 1, ok: false, firstFailure: { index: 1, kind: 'missing_hash' } },
        { start: 2, end: 2, ok: true },
      ],
    });
  });

  it('caps diagnostics at 100 entries while counting and checking the whole file', () => {
    const events = Array.from({ length: 105 }, (_, i) =>
      makeEvent(`restart_${String(i)}`, undefined)
    );
    events[104] = { ...events[104]!, action: 'changed' };
    const result = verifyChain(events);
    expect(result).toMatchObject({
      ok: false,
      eventCount: 105,
      breakCount: 104,
      segmentCount: 105,
      tamperedCount: 1,
      breaksTruncated: true,
      segmentsTruncated: true,
    });
    expect(result.breaks).toHaveLength(100);
    expect(result.segments).toHaveLength(100);
  });

  it('sets each truncation flag only when its own cap is exceeded', () => {
    const events = Array.from({ length: 101 }, (_, i) =>
      makeEvent(`restart_${String(i)}`, undefined)
    );
    expect(verifyChain(events.slice(0, 100))).toMatchObject({
      breakCount: 99,
      segmentCount: 100,
      breaksTruncated: false,
      segmentsTruncated: false,
    });
    expect(verifyChain(events)).toMatchObject({
      breakCount: 100,
      segmentCount: 101,
      breaksTruncated: false,
      segmentsTruncated: true,
    });
  });
});

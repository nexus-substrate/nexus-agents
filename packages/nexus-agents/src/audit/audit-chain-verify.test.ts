/**
 * Tests for verifyChain (#2281). Distinct from audit-logger.test.ts because
 * those tests stub `node:crypto` to a deterministic fake hash; here we need
 * real SHA-256 to validate round-trips.
 *
 * @module audit/audit-chain-verify.test
 */

import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import { verifyChain } from './audit-logger.js';
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
});

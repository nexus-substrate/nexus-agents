/**
 * Tests for tier-transition audit events (Epic D / ADR-0017, #3842).
 *
 * Uses REAL SHA-256 (no `node:crypto` stub, unlike audit-logger.test.ts) so the
 * hash-chain round-trip is genuine: events emitted by `logTierTransition` must
 * chain into the log and `verifyChain` must still validate over the new event
 * type. Also covers the `extractTierTransition` recovery helper and the
 * structured payload shape {subject, fromTier, toTier, evidenceRef,
 * ratificationVoteRef?}.
 *
 * @module audit/tier-transition-audit.test
 */

import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { AuditLogger, verifyChain, extractTierTransition } from './audit-logger.js';
import { InMemoryAuditStorage } from './audit-storage.js';
import type { AuditLogConfig, AuditEvent } from './audit-types.js';
import { TIER_TRANSITION_METADATA_KEY } from './audit-types.js';

function makeLogger(): { logger: AuditLogger; storage: InMemoryAuditStorage } {
  const storage = new InMemoryAuditStorage();
  const config: AuditLogConfig = {
    logDir: '/tmp/tier-transition-test',
    filePrefix: 'audit',
    maxFileSizeBytes: 10 * 1024 * 1024,
    maxFiles: 10,
    enableHashChain: true,
    enableCompression: false,
    flushIntervalMs: 60_000,
    maxQueueDepth: 10_000,
    minSeverity: 'info',
  };
  const logger = new AuditLogger(config, storage);
  return { logger, storage };
}

describe('logTierTransition — event shape', () => {
  it('emits a governance event carrying the structured tier-transition payload', async () => {
    const { logger, storage } = makeLogger();
    logger.logTierTransition({
      kind: 'promotion',
      subject: 'auto-remediation',
      fromTier: 'advisory',
      toTier: 'enforce',
      evidenceRef: 'governance/authority-tier-evidence.yaml#auto-remediation',
      ratificationVoteRef: 'consensus_vote/cv_3769_enforce',
    });
    await logger.close();

    const events = storage.getAll();
    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.category).toBe('governance');
    expect(event.action).toBe('tier.promotion');
    expect(event.severity).toBe('warning'); // promotions grant authority
    expect(event.resource).toEqual({
      type: 'loop',
      id: 'auto-remediation',
      name: 'auto-remediation',
    });

    const payload = extractTierTransition(event);
    expect(payload).toEqual({
      kind: 'promotion',
      subject: 'auto-remediation',
      fromTier: 'advisory',
      toTier: 'enforce',
      evidenceRef: 'governance/authority-tier-evidence.yaml#auto-remediation',
      ratificationVoteRef: 'consensus_vote/cv_3769_enforce',
    });
    expect(event.metadata?.[TIER_TRANSITION_METADATA_KEY]).toEqual(payload);
  });

  it('emits a demotion at info severity with no ratificationVoteRef', async () => {
    const { logger, storage } = makeLogger();
    logger.logTierTransition({
      kind: 'demotion',
      subject: 'tune-loop',
      fromTier: 'enforce',
      toTier: 'advisory',
      evidenceRef: 'regression/tune-precision-drop',
    });
    await logger.close();

    const event = storage.getAll()[0]!;
    expect(event.action).toBe('tier.demotion');
    expect(event.severity).toBe('info');
    const payload = extractTierTransition(event);
    expect(payload?.kind).toBe('demotion');
    expect(payload?.ratificationVoteRef).toBeUndefined();
  });
});

describe('logTierTransition — hash chain', () => {
  it('hash-chains a tier-transition event into the log and verifyChain validates', async () => {
    const { logger, storage } = makeLogger();
    // Interleave a system event, a promotion, and a demotion.
    logger.logSystemStartup({ note: 'boot' });
    logger.logTierTransition({
      kind: 'promotion',
      subject: 'learned-selection-rules',
      fromTier: 'advisory',
      toTier: 'enforce',
      evidenceRef: 'evidence#3552',
      ratificationVoteRef: 'cv_3552',
    });
    logger.logTierTransition({
      kind: 'demotion',
      subject: 'learned-selection-rules',
      fromTier: 'enforce',
      toTier: 'advisory',
      evidenceRef: 'regression#3552',
    });
    await logger.close();

    const events = storage.getAll();
    expect(events).toHaveLength(3);
    // Each event after the first links to its predecessor's hash.
    expect(events[1]!.previousHash).toBe(events[0]!.hash);
    expect(events[2]!.previousHash).toBe(events[1]!.hash);

    const result = verifyChain(events);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.eventCount).toBe(3);
  });

  it('verifyChain detects tampering with a tier-transition event body', async () => {
    const { logger, storage } = makeLogger();
    logger.logTierTransition({
      kind: 'promotion',
      subject: 'clawguard',
      fromTier: 'advisory',
      toTier: 'enforce',
      evidenceRef: 'evidence#2077',
      ratificationVoteRef: 'cv_2077',
    });
    await logger.close();

    const events = storage.getAll();
    // Tamper the action without recomputing the hash.
    const tampered = { ...events[0]!, action: 'tier.demotion' as const };
    const result = verifyChain([tampered]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });
});

// #3921: the integrity-critical tier-transition payload (subject/fromTier/
// toTier/evidenceRef/ratificationVoteRef) lives in metadata and was previously
// OUTSIDE computeEventHash — flipping it left the stored hash valid. It is now
// folded into the chain via hashVersion 2. These are the RED-before/GREEN-after
// tamper tests.
describe('logTierTransition — payload is hash-covered (#3921)', () => {
  it('stamps hashVersion 2 on a tier-transition event', async () => {
    const { logger, storage } = makeLogger();
    logger.logTierTransition({
      kind: 'promotion',
      subject: 'clawguard',
      fromTier: 'advisory',
      toTier: 'enforce',
      evidenceRef: 'evidence#2077',
      ratificationVoteRef: 'cv_2077',
    });
    await logger.close();
    expect(storage.getAll()[0]!.hashVersion).toBe(2);
  });

  it('verifyChain detects a flipped toTier in the persisted payload', async () => {
    const { logger, storage } = makeLogger();
    logger.logTierTransition({
      kind: 'promotion',
      subject: 'clawguard',
      fromTier: 'observe',
      toTier: 'suggest',
      evidenceRef: 'evidence#2077',
      ratificationVoteRef: 'cv_2077',
    });
    await logger.close();

    const event = storage.getAll()[0]!;
    // Forge a privilege escalation: rewrite toTier in metadata, leaving the
    // stored hash untouched (the pre-#3921 undetectable attack).
    const tampered: AuditEvent = {
      ...event,
      metadata: {
        ...event.metadata,
        [TIER_TRANSITION_METADATA_KEY]: {
          ...(event.metadata?.[TIER_TRANSITION_METADATA_KEY] as Record<string, unknown>),
          toTier: 'enforce',
        },
      },
    };
    const result = verifyChain([tampered]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  it('verifyChain detects a rewritten ratificationVoteRef in the persisted payload', async () => {
    const { logger, storage } = makeLogger();
    logger.logTierTransition({
      kind: 'promotion',
      subject: 'clawguard',
      fromTier: 'advisory',
      toTier: 'enforce',
      evidenceRef: 'evidence#2077',
      ratificationVoteRef: 'cv_real',
    });
    await logger.close();

    const event = storage.getAll()[0]!;
    const tampered: AuditEvent = {
      ...event,
      metadata: {
        ...event.metadata,
        [TIER_TRANSITION_METADATA_KEY]: {
          ...(event.metadata?.[TIER_TRANSITION_METADATA_KEY] as Record<string, unknown>),
          ratificationVoteRef: 'cv_borrowed_from_another_approval',
        },
      },
    };
    const result = verifyChain([tampered]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  // The realistic plaintext-log adversary doesn't just edit a field and leave a
  // stale hash — they RECOMPUTE the stored hash too. The downgrade attack:
  // flip toTier, strip hashVersion, and recompute the stored hash under the v1
  // head-only projection (which excludes the payload). If the verifier trusted
  // the stored hashVersion it would drop to v1, recompute the same head-only
  // hash, and accept the forgery. The verifier instead DERIVES v2 from the
  // covered `category` plus the (still-present, still-valid) payload — see
  // hasTierTransitionPayload (#3961) — so the strip cannot downgrade it.
  function v1HeadHash(event: AuditEvent): string {
    // Mirror computeEventHash's v1 projection EXACTLY (field order included).
    const projection = {
      id: event.id,
      timestamp: event.timestamp,
      category: event.category,
      action: event.action,
      outcome: event.outcome,
      actor: event.actor,
      previousHash: event.previousHash,
    };
    return createHash('sha256').update(JSON.stringify(projection)).digest('hex');
  }

  it('defeats a version-DOWNGRADE forgery (flip toTier + strip hashVersion + recompute v1 hash)', async () => {
    const { logger, storage } = makeLogger();
    logger.logTierTransition({
      kind: 'promotion',
      subject: 'clawguard',
      fromTier: 'observe',
      toTier: 'suggest',
      evidenceRef: 'evidence#2077',
      ratificationVoteRef: 'cv_2077',
    });
    await logger.close();

    const event = storage.getAll()[0]!;
    const forged: AuditEvent = {
      ...event,
      hashVersion: undefined, // strip the v2 marker to attempt a downgrade
      metadata: {
        ...event.metadata,
        [TIER_TRANSITION_METADATA_KEY]: {
          ...(event.metadata?.[TIER_TRANSITION_METADATA_KEY] as Record<string, unknown>),
          toTier: 'enforce', // privilege escalation
        },
      },
    };
    // Attacker recomputes the stored hash under v1 so a v1 verifier would accept.
    forged.hash = v1HeadHash(forged);

    const result = verifyChain([forged]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  it('also defeats the downgrade when hashVersion is forced to 1 (not just stripped)', async () => {
    const { logger, storage } = makeLogger();
    logger.logTierTransition({
      kind: 'promotion',
      subject: 'clawguard',
      fromTier: 'advisory',
      toTier: 'enforce',
      evidenceRef: 'evidence#2077',
    });
    await logger.close();

    const event = storage.getAll()[0]!;
    const forged: AuditEvent = {
      ...event,
      hashVersion: 1,
      metadata: {
        ...event.metadata,
        [TIER_TRANSITION_METADATA_KEY]: {
          ...(event.metadata?.[TIER_TRANSITION_METADATA_KEY] as Record<string, unknown>),
          subject: 'attacker-loop',
        },
      },
    };
    forged.hash = v1HeadHash(forged);
    const result = verifyChain([forged]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('hash_mismatch');
  });

  it.each(['subject', 'fromTier', 'evidenceRef'] as const)(
    'verifyChain detects a flipped %s (every integrity-critical field is covered)',
    async (field) => {
      const { logger, storage } = makeLogger();
      logger.logTierTransition({
        kind: 'promotion',
        subject: 'clawguard',
        fromTier: 'advisory',
        toTier: 'enforce',
        evidenceRef: 'evidence#2077',
        ratificationVoteRef: 'cv_2077',
      });
      await logger.close();

      const event = storage.getAll()[0]!;
      const tampered: AuditEvent = {
        ...event,
        metadata: {
          ...event.metadata,
          [TIER_TRANSITION_METADATA_KEY]: {
            ...(event.metadata?.[TIER_TRANSITION_METADATA_KEY] as Record<string, unknown>),
            [field]: `tampered-${field}`,
          },
        },
      };
      const result = verifyChain([tampered]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('hash_mismatch');
    }
  );

  it('verifyChain still validates an UNtampered v2 chain', async () => {
    const { logger, storage } = makeLogger();
    logger.logSystemStartup({ note: 'boot' }); // v1 event
    logger.logTierTransition({
      kind: 'promotion',
      subject: 'clawguard',
      fromTier: 'advisory',
      toTier: 'enforce',
      evidenceRef: 'evidence#2077',
      ratificationVoteRef: 'cv_2077',
    }); // v2 event interleaved
    await logger.close();
    const result = verifyChain(storage.getAll());
    expect(result.ok).toBe(true);
  });

  it('a pre-existing v1 chain (no hashVersion, no tierTransition) still verifies', async () => {
    // Non-tier-transition events keep the v1 projection — pre-#3921 chains are
    // unaffected (migration-safe: only events carrying a tierTransition payload
    // are stamped v2).
    const { logger, storage } = makeLogger();
    logger.logSystemStartup({ note: 'boot' });
    logger.logSystemShutdown({ note: 'halt' });
    await logger.close();
    const events = storage.getAll();
    expect(events.every((e) => e.hashVersion === undefined)).toBe(true);
    expect(verifyChain(events).ok).toBe(true);
  });
});

describe('extractTierTransition', () => {
  it('returns null for a non-governance event', async () => {
    const { logger, storage } = makeLogger();
    logger.logSystemStartup();
    await logger.close();
    expect(extractTierTransition(storage.getAll()[0]!)).toBeNull();
  });
});

// #3961 (HIGH): the hash-coverage predicate was `action.startsWith('tier.')`,
// NARROWER than what the ratification gate consumes (extractTierTransition
// recovers a transition from ANY governance event with a valid tierTransition
// payload, any action). So a `governance.audit` (non-`tier.`) event carrying a
// valid payload was hashed WITHOUT covering the payload, yet the drift gate
// treated it as a promotion — a single-event undetectable forge. Both sides now
// share hasTierTransitionPayload, so hash-coverage ⊇ gate-consumption.
describe('non-`tier.` governance event payload is hash-covered (#3961)', () => {
  const validPayload = {
    kind: 'promotion' as const,
    subject: 'sneaky-loop',
    fromTier: 'advisory' as const,
    toTier: 'enforce' as const,
    evidenceRef: 'evidence#3961',
    ratificationVoteRef: 'cv_3961',
  };

  // Emit a governance event with a NON-`tier.` action carrying a valid payload
  // via the public log() path (logTierTransition always uses `tier.*`, so we go
  // through the generic logger to reproduce the escapable shape).
  function sealNonTierGovernance(): { logger: AuditLogger; storage: InMemoryAuditStorage } {
    const { logger, storage } = makeLogger();
    logger.log({
      category: 'governance',
      severity: 'info',
      outcome: 'success',
      action: 'governance.audit', // NOT tier.* — the escapable action
      description: 'governance audit carrying a tier-transition payload',
      actor: { type: 'system', id: 'nexus-agents', name: 'Nexus Agents System' },
      metadata: { [TIER_TRANSITION_METADATA_KEY]: validPayload },
    });
    return { logger, storage };
  }

  it('the drift gate consumes it as a transition (extractTierTransition is non-null)', async () => {
    const { logger, storage } = sealNonTierGovernance();
    await logger.close();
    const event = storage.getAll()[0]!;
    expect(event.action).toBe('governance.audit');
    expect(extractTierTransition(event)).toEqual(validPayload);
    // ...and it is now stamped v2 (hash-covered), matching gate-consumption.
    expect(event.hashVersion).toBe(2);
  });

  it('an unmutated such event still verifies ok', async () => {
    const { logger, storage } = sealNonTierGovernance();
    await logger.close();
    expect(verifyChain(storage.getAll()).ok).toBe(true);
  });

  it.each(['toTier', 'subject'] as const)(
    'verifyChain detects a flipped %s in the payload (was undetectable pre-#3961)',
    async (field) => {
      const { logger, storage } = sealNonTierGovernance();
      await logger.close();
      const event = storage.getAll()[0]!;
      const tampered: AuditEvent = {
        ...event,
        metadata: {
          ...event.metadata,
          [TIER_TRANSITION_METADATA_KEY]: {
            ...(event.metadata?.[TIER_TRANSITION_METADATA_KEY] as Record<string, unknown>),
            [field]: `forged-${field}`,
          },
        },
      };
      const result = verifyChain([tampered]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('hash_mismatch');
    }
  );
});

// The RatificationVoteSchema tests were removed in #4010 alongside the schema
// itself — #4005 re-anchored the promotion gate to the authentic
// vote-records.jsonl, so the hand-committable YAML ledger schema is gone. The
// authentic record-set verification is covered by audit/vote-record.test.ts and
// scripts/vote-record-ratification (gate) tests.

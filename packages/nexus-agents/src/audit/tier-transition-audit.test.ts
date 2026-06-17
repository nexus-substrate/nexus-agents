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
import {
  TIER_TRANSITION_METADATA_KEY,
  RatificationVoteSchema,
  RatificationVoteLedgerSchema,
} from './audit-types.js';

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
  // covered `action` (tier.*), so the strip cannot downgrade it.
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

describe('RatificationVoteSchema — the #3894 resolution-source schema', () => {
  const approved = {
    id: 'cv_2026-06-15_abc',
    subject: 'auto-remediation',
    decision: 'approved' as const,
    strategy: 'higher_order' as const,
    votedAt: '2026-06-15T00:00:00.000Z',
  };

  it('accepts a minimal approved higher_order vote', () => {
    expect(RatificationVoteSchema.safeParse(approved).success).toBe(true);
  });

  it('accepts optional approvalPercentage + voteUri', () => {
    const parsed = RatificationVoteSchema.safeParse({
      ...approved,
      approvalPercentage: 85,
      voteUri: 'https://example.test/vote/abc',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown decision and an unknown strategy', () => {
    expect(RatificationVoteSchema.safeParse({ ...approved, decision: 'maybe' }).success).toBe(
      false
    );
    expect(RatificationVoteSchema.safeParse({ ...approved, strategy: 'coin_flip' }).success).toBe(
      false
    );
  });

  it('is strict — rejects an unknown extra field', () => {
    expect(RatificationVoteSchema.safeParse({ ...approved, extra: 1 }).success).toBe(false);
  });

  it('ledger schema accepts an empty votes array (the committed default)', () => {
    expect(RatificationVoteLedgerSchema.safeParse({ version: 1, votes: [] }).success).toBe(true);
  });

  it('ledger schema rejects a vote missing required fields', () => {
    const parsed = RatificationVoteLedgerSchema.safeParse({
      version: 1,
      votes: [{ id: 'x' }],
    });
    expect(parsed.success).toBe(false);
  });
});

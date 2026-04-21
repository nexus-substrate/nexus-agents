/**
 * Tests for Event Bus Helpers
 * @module agents/collaboration/event-bus-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { DomainEvent } from './event-bus-types.js';
import {
  DEFAULT_MAX_HISTORY_SIZE,
  MAX_SUBSCRIPTIONS,
  patternToRegex,
  topicMatchesPattern,
  applyHistoryFilters,
  applyTimestampFilters,
  applyHistoryLimit,
  countMatchingSubscribers,
} from './event-bus-helpers.js';
import type { SubscriptionRecord } from './event-bus-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeEvent(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    eventId: 'evt-1',
    topic: 'test.event',
    timestamp: '2024-01-15T12:00:00Z',
    payload: {},
    ...overrides,
  };
}

// ============================================================================
// Constants
// ============================================================================

describe('constants', () => {
  it('DEFAULT_MAX_HISTORY_SIZE is 1000', () => {
    expect(DEFAULT_MAX_HISTORY_SIZE).toBe(1000);
  });

  it('MAX_SUBSCRIPTIONS is 500', () => {
    expect(MAX_SUBSCRIPTIONS).toBe(500);
  });
});

// ============================================================================
// patternToRegex
// ============================================================================

describe('patternToRegex', () => {
  it('matches exact topic', () => {
    const regex = patternToRegex('session.created');
    expect(regex.test('session.created')).toBe(true);
    expect(regex.test('session.deleted')).toBe(false);
  });

  it('matches wildcard at end', () => {
    const regex = patternToRegex('session.*');
    expect(regex.test('session.created')).toBe(true);
    expect(regex.test('session.deleted')).toBe(true);
    expect(regex.test('user.created')).toBe(false);
  });

  it('matches global wildcard', () => {
    const regex = patternToRegex('*');
    expect(regex.test('session.created')).toBe(true);
    expect(regex.test('anything')).toBe(true);
  });

  it('wildcard does not match dots', () => {
    const regex = patternToRegex('session.*');
    expect(regex.test('session.nested.deep')).toBe(false);
  });

  it('throws for pattern exceeding max length', () => {
    const longPattern = 'a'.repeat(201);
    expect(() => patternToRegex(longPattern)).toThrow('exceeds maximum length');
  });

  it('escapes regex special characters', () => {
    const regex = patternToRegex('test.event+1');
    expect(regex.test('test.event+1')).toBe(true);
    expect(regex.test('test.eventX1')).toBe(false);
  });
});

// ============================================================================
// topicMatchesPattern
// ============================================================================

describe('topicMatchesPattern', () => {
  it('returns true for matching topic', () => {
    const regex = patternToRegex('session.*');
    expect(topicMatchesPattern('session.created', regex)).toBe(true);
  });

  it('returns false for non-matching topic', () => {
    const regex = patternToRegex('session.*');
    expect(topicMatchesPattern('user.created', regex)).toBe(false);
  });
});

// ============================================================================
// applyHistoryFilters
// ============================================================================

describe('applyHistoryFilters', () => {
  it('filters by topic pattern', () => {
    const events = [makeEvent({ topic: 'session.created' }), makeEvent({ topic: 'user.created' })];
    const result = applyHistoryFilters(events, { topic: 'session.*' });
    expect(result).toHaveLength(1);
    expect(result[0]?.topic).toBe('session.created');
  });

  it('filters by sessionId', () => {
    const events = [makeEvent({ sessionId: 'sess-1' }), makeEvent({ sessionId: 'sess-2' })];
    const result = applyHistoryFilters(events, { sessionId: 'sess-1' });
    expect(result).toHaveLength(1);
  });

  it('filters by correlationId', () => {
    const events = [makeEvent({ correlationId: 'cor-1' }), makeEvent({ correlationId: 'cor-2' })];
    const result = applyHistoryFilters(events, { correlationId: 'cor-1' });
    expect(result).toHaveLength(1);
  });

  it('returns all events with empty filter', () => {
    const events = [makeEvent(), makeEvent()];
    const result = applyHistoryFilters(events, {});
    expect(result).toHaveLength(2);
  });
});

// ============================================================================
// applyTimestampFilters
// ============================================================================

describe('applyTimestampFilters', () => {
  it('filters by after timestamp', () => {
    const events = [
      makeEvent({ timestamp: '2024-01-10T00:00:00Z' }),
      makeEvent({ timestamp: '2024-01-20T00:00:00Z' }),
    ];
    const result = applyTimestampFilters(events, { after: '2024-01-15T00:00:00Z' });
    expect(result).toHaveLength(1);
    expect(result[0]?.timestamp).toBe('2024-01-20T00:00:00Z');
  });

  it('filters by before timestamp', () => {
    const events = [
      makeEvent({ timestamp: '2024-01-10T00:00:00Z' }),
      makeEvent({ timestamp: '2024-01-20T00:00:00Z' }),
    ];
    const result = applyTimestampFilters(events, { before: '2024-01-15T00:00:00Z' });
    expect(result).toHaveLength(1);
    expect(result[0]?.timestamp).toBe('2024-01-10T00:00:00Z');
  });

  it('applies both after and before', () => {
    const events = [
      makeEvent({ timestamp: '2024-01-05T00:00:00Z' }),
      makeEvent({ timestamp: '2024-01-15T00:00:00Z' }),
      makeEvent({ timestamp: '2024-01-25T00:00:00Z' }),
    ];
    const result = applyTimestampFilters(events, {
      after: '2024-01-10T00:00:00Z',
      before: '2024-01-20T00:00:00Z',
    });
    expect(result).toHaveLength(1);
  });
});

// ============================================================================
// applyHistoryLimit
// ============================================================================

describe('applyHistoryLimit', () => {
  it('limits results from the end', () => {
    const events = [
      makeEvent({ eventId: '1' }),
      makeEvent({ eventId: '2' }),
      makeEvent({ eventId: '3' }),
    ];
    const result = applyHistoryLimit(events, { limit: 2 });
    expect(result).toHaveLength(2);
    expect(result[0]?.eventId).toBe('2');
    expect(result[1]?.eventId).toBe('3');
  });

  it('returns all when no limit', () => {
    const events = [makeEvent(), makeEvent()];
    expect(applyHistoryLimit(events, {})).toHaveLength(2);
  });

  it('returns all when limit is 0', () => {
    const events = [makeEvent(), makeEvent()];
    expect(applyHistoryLimit(events, { limit: 0 })).toHaveLength(2);
  });
});

// ============================================================================
// countMatchingSubscribers
// ============================================================================

describe('countMatchingSubscribers', () => {
  it('counts matching subscriptions', () => {
    const subs = new Map<string, SubscriptionRecord>();
    subs.set('sub-1', {
      id: 'sub-1',
      pattern: 'session.*',
      regex: patternToRegex('session.*'),
      listener: () => {},
    });
    subs.set('sub-2', {
      id: 'sub-2',
      pattern: 'user.*',
      regex: patternToRegex('user.*'),
      listener: () => {},
    });
    expect(countMatchingSubscribers('session.created', subs)).toBe(1);
  });

  it('returns 0 for no matches', () => {
    const subs = new Map<string, SubscriptionRecord>();
    subs.set('sub-1', {
      id: 'sub-1',
      pattern: 'user.*',
      regex: patternToRegex('user.*'),
      listener: () => {},
    });
    expect(countMatchingSubscribers('session.created', subs)).toBe(0);
  });

  it('returns 0 for empty subscriptions', () => {
    expect(countMatchingSubscribers('anything', new Map())).toBe(0);
  });
});

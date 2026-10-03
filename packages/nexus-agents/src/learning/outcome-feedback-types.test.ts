import { describe, expect, it } from 'vitest';
import { RoutingDecisionSchema } from './outcome-feedback-types.js';

const storedDecision = {
  id: '59140000-0000-4000-8000-000000000001',
  timestamp: '2026-10-03T00:00:00.000Z',
  query: '',
  selectedModel: 'claude',
  traceId: 'legacy',
};

describe('RoutingDecisionSchema legacy router attribution', () => {
  it('parses legacy quality as unattributed with empty measurement evidence', () => {
    const parsed = RoutingDecisionSchema.parse({ ...storedDecision, routerType: 'quality' });
    expect(parsed.routerType).toBe('unattributed');
    expect(parsed.routerTypeMeasured).toBe(false);
  });

  it('clears claimed measurement for legacy quality', () => {
    const parsed = RoutingDecisionSchema.parse({
      ...storedDecision,
      routerType: 'quality',
      routerTypeMeasured: true,
    });
    expect(parsed.routerType).toBe('unattributed');
    expect(parsed.routerTypeMeasured).toBe(false);
  });

  it.each(['linucb', 'preference', 'cascade', 'topsis', 'unattributed'])(
    'preserves valid %s attribution and measurement',
    (routerType) => {
      const parsed = RoutingDecisionSchema.parse({
        ...storedDecision,
        routerType,
        routerTypeMeasured: true,
      });
      expect(parsed.routerType).toBe(routerType);
      expect(parsed.routerTypeMeasured).toBe(true);
    }
  );

  it.each(['composite', 'budget', 'zero', null, undefined, 1])(
    'rejects invalid stored label %j',
    (routerType) => {
      const result = RoutingDecisionSchema.safeParse({
        ...storedDecision,
        routerType,
        routerTypeMeasured: true,
      });
      expect(result.success).toBe(false);
    }
  );

  it('preserves legacy topsis with empty measurement evidence', () => {
    const parsed = RoutingDecisionSchema.parse({ ...storedDecision, routerType: 'topsis' });
    expect(parsed.routerType).toBe('topsis');
    expect(parsed.routerTypeMeasured).toBeUndefined();
  });

  it('accepts unattributed with empty measurement evidence', () => {
    expect(
      RoutingDecisionSchema.parse({ ...storedDecision, routerType: 'unattributed' }).routerType
    ).toBe('unattributed');
  });

  it('rejects an unknown router instead of treating it as empty evidence', () => {
    expect(
      RoutingDecisionSchema.safeParse({ ...storedDecision, routerType: 'unknown' }).success
    ).toBe(false);
  });

  it('rejects an empty router string explicitly', () => {
    expect(RoutingDecisionSchema.safeParse({ ...storedDecision, routerType: '' }).success).toBe(
      false
    );
  });
});

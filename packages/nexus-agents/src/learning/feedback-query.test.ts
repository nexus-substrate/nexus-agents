import { describe, expect, it, vi } from 'vitest';
import type { CompositeRoutingDecision } from '../cli-adapters/composite-router-types.js';
import type { PreferenceRouter } from '../cli-adapters/preference-router.js';
import { createFeedbackIntegration } from './feedback-integration.js';
import { OutcomeFeedbackCollector } from './outcome-feedback.js';
import type { RoutingDecision } from './outcome-feedback-types.js';

// Retention contract: history keeps at most 256 characters per task (#6900).
const MAX_HISTORY_QUERY_LENGTH = 256;
// delegate_to_model's maximum accepted task length.
const MAX_TASK_LENGTH = 50_000;

const decision: CompositeRoutingDecision = {
  adapter: {} as CompositeRoutingDecision['adapter'],
  cliName: 'api:anthropic',
  confidence: 0.83,
  reason: 'EXPLANATION: preference score favored the strong model',
  stagesExecuted: ['preference-routing'],
  decisionTimeMs: 27,
  preferenceScore: 0.61,
  preferenceTier: 'strong',
  alternatives: ['api:google'],
  taskProfile: {
    taskType: 'code_implementation',
    contextRequired: 1027,
    reasoningComplexity: 7,
    codeGeneration: true,
    multimodal: false,
    parallelizable: true,
    budgetSensitive: false,
  },
};

describe('FeedbackIntegration task text provenance', () => {
  it('bounds maximum-size task history while training and callbacks receive full text', () => {
    const recordPreference = vi.fn();
    const collector = new OutcomeFeedbackCollector();
    collector.registerPreferenceRouter({ recordPreference } as unknown as PreferenceRouter);
    const integration = createFeedbackIntegration(undefined, collector);
    const receivedQueries: string[] = [];
    integration.onOutcomeProcessed((record) => receivedQueries.push(record.query));
    const query = 'TASK: implement sorting '.padEnd(MAX_TASK_LENGTH, 'x');
    const id = integration.recordRoutingDecision(decision, 'max-task-trace', { query });
    expect(collector.getPendingDecisions()[0]?.query).toBe(query);

    integration.recordOutcome({
      routingDecisionId: id,
      success: true,
      qualityScore: 0.91,
      durationMs: 137,
      tokenUsage: 241,
    });

    expect(recordPreference).toHaveBeenCalledExactlyOnceWith(query, true, 0.91, undefined);
    expect(receivedQueries).toEqual([query]);
    expect(collector.getPendingDecisions()).toHaveLength(0);
    // Inspect retention without adding a public history accessor.
    const history = (collector as unknown as { decisionHistory: readonly RoutingDecision[] })
      .decisionHistory;
    expect(history).toHaveLength(1);
    expect(history[0]?.id).toBe(id);
    expect(history[0]?.query.length).toBeLessThanOrEqual(MAX_HISTORY_QUERY_LENGTH);
  });

  it('still finds decisions by id in history after their pending entry is evicted', () => {
    const collector = new OutcomeFeedbackCollector({ maxPendingDecisions: 1 });
    const integration = createFeedbackIntegration(undefined, collector);
    const received: RoutingDecision[] = [];
    integration.onOutcomeProcessed((record) => received.push(record));
    const id = integration.recordRoutingDecision(decision, 'evicted-trace', {
      query: 'first task',
    });
    const pendingId = integration.recordRoutingDecision(decision, 'pending-trace', {
      query: 'second task',
    });

    integration.recordOutcome({
      routingDecisionId: id,
      success: true,
      qualityScore: 0.91,
      durationMs: 137,
      tokenUsage: 241,
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ id, query: 'first task' });
    expect(collector.getPendingDecisions().map((record) => record.id)).toEqual([pendingId]);
    expect(integration.getStats().decisionsByRouter.preference).toBe(2);
  });

  it.each([
    { tier: 'strong' as const, success: true, preferred: true },
    { tier: 'weak' as const, success: true, preferred: false },
    { tier: 'strong' as const, success: false, preferred: false },
  ])('trains on task text for $tier / success=$success', ({ tier, success, preferred }) => {
    const recordPreference = vi.fn();
    const collector = new OutcomeFeedbackCollector();
    collector.registerPreferenceRouter({ recordPreference } as unknown as PreferenceRouter);
    // The public factory's collector injection wires the fake router without private access.
    const integration = createFeedbackIntegration(undefined, collector);
    const query = 'TASK: implement a sorting algorithm';
    const id = integration.recordRoutingDecision({ ...decision, preferenceTier: tier }, undefined, {
      query,
    });
    integration.recordOutcome({
      routingDecisionId: id,
      success,
      qualityScore: 0.91,
      durationMs: 137,
      tokenUsage: 241,
    });
    expect(recordPreference).toHaveBeenCalledExactlyOnceWith(
      query,
      preferred,
      tier === 'strong' ? 0.91 : undefined,
      tier === 'weak' ? 0.91 : undefined
    );
  });

  it.each([undefined, '', '   '])(
    'skips preference training for absent/empty query %j',
    (query) => {
      const recordPreference = vi.fn();
      const collector = new OutcomeFeedbackCollector();
      collector.registerPreferenceRouter({ recordPreference } as unknown as PreferenceRouter);
      const integration = createFeedbackIntegration(undefined, collector);
      const receivedQueries: string[] = [];
      integration.onOutcomeProcessed((record) => receivedQueries.push(record.query));
      const id = integration.recordRoutingDecision(
        decision,
        undefined,
        query === undefined ? undefined : { query }
      );
      integration.recordOutcome({
        routingDecisionId: id,
        success: true,
        qualityScore: 0.89,
        durationMs: 151,
        tokenUsage: 233,
      });
      expect(recordPreference).not.toHaveBeenCalled();
      expect(receivedQueries).toEqual([query ?? '']);
      expect(integration.getStats().totalOutcomes).toBe(1);
    }
  );
});

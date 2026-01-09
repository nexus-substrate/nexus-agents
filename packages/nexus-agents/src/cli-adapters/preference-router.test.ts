/**
 * nexus-agents/cli-adapters - Preference Router Tests
 *
 * Tests for preference-trained routing (RouteLLM pattern).
 *
 * @module cli-adapters/preference-router.test
 * (Source: Issue #148)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PreferenceRouter,
  InMemoryPreferenceStore,
  QueryFeatureExtractor,
  createPreferenceRouter,
} from './preference-router.js';

describe('PreferenceRouter', () => {
  describe('QueryFeatureExtractor', () => {
    let extractor: QueryFeatureExtractor;

    beforeEach(() => {
      extractor = new QueryFeatureExtractor();
    });

    it('should extract features from a simple query', () => {
      const features = extractor.extract('What is the capital of France?');

      expect(features.tokenCount).toBeGreaterThan(0);
      expect(features.complexity).toBeGreaterThanOrEqual(0);
      expect(features.complexity).toBeLessThanOrEqual(1);
      expect(features.domain).toBe('general');
    });

    it('should detect code-related queries', () => {
      const features = extractor.extract('Implement a function to sort an array in TypeScript');

      expect(features.requiresCode).toBe(true);
      expect(features.domain).toBe('coding');
    });

    it('should detect reasoning queries', () => {
      const features = extractor.extract('Analyze why the algorithm fails for edge cases');

      expect(features.requiresReasoning).toBe(true);
      expect(features.domain).toBe('reasoning');
    });

    it('should detect creative queries', () => {
      const features = extractor.extract('Create an innovative design for a mobile app');

      expect(features.requiresCreativity).toBe(true);
      expect(features.domain).toBe('creative');
    });

    it('should detect ambiguity indicators', () => {
      const features = extractor.extract('Maybe we could possibly try a different approach');

      expect(features.hasAmbiguity).toBe(true);
    });

    it('should calculate higher complexity for longer technical queries', () => {
      const simpleFeatures = extractor.extract('Hello');
      const complexFeatures = extractor.extract(
        'Explain how to implement a distributed consensus algorithm ' +
          'that can handle network partitions and ensure eventual consistency ' +
          'while maintaining high availability in a multi-region deployment'
      );

      expect(complexFeatures.complexity).toBeGreaterThan(simpleFeatures.complexity);
    });

    it('should generate consistent keyword signatures', () => {
      const features1 = extractor.extract('implement function code');
      const features2 = extractor.extract('code function implement');

      expect(features1.keywordSignature).toBe(features2.keywordSignature);
    });
  });

  describe('InMemoryPreferenceStore', () => {
    let store: InMemoryPreferenceStore;
    const extractor = new QueryFeatureExtractor();

    beforeEach(() => {
      store = new InMemoryPreferenceStore(100);
    });

    it('should store and retrieve data points', () => {
      const dataPoint = {
        id: 'test-1',
        query: 'test query',
        features: extractor.extract('test query'),
        strongModelPreferred: true,
        recordedAt: new Date(),
      };

      store.store(dataPoint);
      const all = store.getAll();

      expect(all.length).toBe(1);
      expect(all[0]?.id).toBe('test-1');
    });

    it('should filter by domain', () => {
      store.store({
        id: '1',
        query: 'implement function',
        features: extractor.extract('implement function'),
        strongModelPreferred: true,
        recordedAt: new Date(),
        domain: 'coding',
      });

      store.store({
        id: '2',
        query: 'analyze data',
        features: extractor.extract('analyze data'),
        strongModelPreferred: false,
        recordedAt: new Date(),
        domain: 'reasoning',
      });

      const codingPoints = store.getByDomain('coding');
      expect(codingPoints.length).toBe(1);
      expect(codingPoints[0]?.id).toBe('1');
    });

    it('should find similar data points', () => {
      // Store some coding-related data points
      for (let i = 0; i < 5; i++) {
        store.store({
          id: `code-${String(i)}`,
          query: 'implement typescript function',
          features: extractor.extract('implement typescript function'),
          strongModelPreferred: true,
          recordedAt: new Date(),
          domain: 'coding',
        });
      }

      // Store some general data points
      for (let i = 0; i < 5; i++) {
        store.store({
          id: `general-${String(i)}`,
          query: 'hello world',
          features: extractor.extract('hello world'),
          strongModelPreferred: false,
          recordedAt: new Date(),
          domain: 'general',
        });
      }

      const queryFeatures = extractor.extract('implement a typescript class');
      const similar = store.findSimilar(queryFeatures, 5);

      // Should find coding-related points first
      expect(similar.length).toBe(5);
      expect(similar[0]?.domain).toBe('coding');
    });

    it('should calculate correct statistics', () => {
      store.store({
        id: '1',
        query: 'q1',
        features: extractor.extract('q1'),
        strongModelPreferred: true,
        recordedAt: new Date(),
        domain: 'coding',
      });

      store.store({
        id: '2',
        query: 'q2',
        features: extractor.extract('q2'),
        strongModelPreferred: true,
        recordedAt: new Date(),
        domain: 'coding',
      });

      store.store({
        id: '3',
        query: 'q3',
        features: extractor.extract('q3'),
        strongModelPreferred: false,
        recordedAt: new Date(),
        domain: 'general',
      });

      const stats = store.getStats();

      expect(stats.totalDataPoints).toBe(3);
      expect(stats.strongModelPreferenceRate).toBeCloseTo(0.667, 2);
      expect(stats.dataPointsByDomain['coding']).toBe(2);
      expect(stats.dataPointsByDomain['general']).toBe(1);
    });

    it('should enforce max size limit', () => {
      const smallStore = new InMemoryPreferenceStore(20);

      for (let i = 0; i < 30; i++) {
        smallStore.store({
          id: String(i),
          query: `query ${String(i)}`,
          features: extractor.extract(`query ${String(i)}`),
          strongModelPreferred: i % 2 === 0,
          recordedAt: new Date(Date.now() - i * 1000), // Older timestamps for lower i
        });
      }

      const all = smallStore.getAll();
      expect(all.length).toBeLessThanOrEqual(20);
    });

    it('should clear all data', () => {
      store.store({
        id: '1',
        query: 'test',
        features: extractor.extract('test'),
        strongModelPreferred: true,
        recordedAt: new Date(),
      });

      store.clear();
      expect(store.getAll().length).toBe(0);
    });
  });

  describe('PreferenceRouter', () => {
    let router: PreferenceRouter;

    beforeEach(() => {
      router = new PreferenceRouter({
        routingThreshold: 0.5,
        minDataPoints: 5,
        enableOnlineLearning: true,
      });
    });

    it('should use heuristic routing without training data', () => {
      const decision = router.route('Implement a complex sorting algorithm');

      expect(decision.selectedTier).toBeDefined();
      expect(decision.selectedCli).toBeDefined();
      expect(decision.prediction.supportingDataPoints).toBe(0);
      expect(decision.prediction.confidence).toBeLessThan(0.5);
    });

    it('should route complex queries to strong model by default', () => {
      const decision = router.route(
        'Analyze the architectural implications of implementing a distributed ' +
          'consensus algorithm with Byzantine fault tolerance while maintaining ' +
          'ACID guarantees across multiple data centers'
      );

      expect(decision.selectedTier).toBe('strong');
      expect(decision.prediction.strongModelProbability).toBeGreaterThan(0.5);
    });

    it('should route simple queries to weak model when cost-effective', () => {
      // Train with preference data showing weak model works for simple queries
      for (let i = 0; i < 10; i++) {
        router.recordPreference('What is 2 + 2', false, 0.9, 0.9);
      }

      const decision = router.route('What is 5 + 5');

      expect(decision.selectedTier).toBe('weak');
      expect(decision.estimatedCostSavings).toBeGreaterThan(0);
    });

    it('should record preferences for online learning', () => {
      const dataPoint = router.recordPreference('Complex reasoning task', true, 0.95, 0.6);

      expect(dataPoint.id).toBeDefined();
      expect(dataPoint.strongModelPreferred).toBe(true);
      expect(dataPoint.strongModelQuality).toBe(0.95);
      expect(dataPoint.weakModelQuality).toBe(0.6);
    });

    it('should learn from preference data', () => {
      // Record preferences showing strong model is needed for coding
      for (let i = 0; i < 15; i++) {
        router.recordPreference('implement typescript function', true, 0.95, 0.6);
      }

      // Record preferences showing weak model works for simple queries
      for (let i = 0; i < 15; i++) {
        router.recordPreference('hello world greeting', false, 0.8, 0.8);
      }

      const codingDecision = router.route('implement a new typescript class');
      const simpleDecision = router.route('say hello to the world');

      expect(codingDecision.prediction.strongModelProbability).toBeGreaterThan(
        simpleDecision.prediction.strongModelProbability
      );
    });

    it('should report minimum data status', () => {
      expect(router.hasMinimumData()).toBe(false);

      for (let i = 0; i < 5; i++) {
        router.recordPreference(`query ${String(i)}`, true);
      }

      expect(router.hasMinimumData()).toBe(true);
    });

    it('should provide routing statistics', () => {
      router.recordPreference('query 1', true);
      router.recordPreference('query 2', false);

      const stats = router.getStats();

      expect(stats.totalDataPoints).toBe(2);
      expect(stats.strongModelPreferenceRate).toBe(0.5);
    });

    it('should include routing latency in decision', () => {
      const decision = router.route('test query');

      expect(decision.routingLatencyMs).toBeGreaterThanOrEqual(0);
      expect(decision.routingLatencyMs).toBeLessThan(100); // Should be fast
    });

    it('should generate meaningful reasons', () => {
      const heuristicDecision = router.route('complex analysis task');
      expect(heuristicDecision.reason).toContain('Heuristic');

      // Train with data
      for (let i = 0; i < 10; i++) {
        router.recordPreference('analyze complex problem', true);
      }

      const learnedDecision = router.route('analyze this issue');
      expect(learnedDecision.reason).toContain('similar queries');
    });

    it('should respect domain-specific thresholds', () => {
      const customRouter = new PreferenceRouter({
        routingThreshold: 0.5,
        domainThresholds: {
          coding: 0.3, // Lower threshold = more likely to use strong model
          general: 0.7, // Higher threshold = more likely to use weak model
        },
      });

      // With no training data, heuristic will apply
      // Coding queries should favor strong model with low threshold
      const codingDecision = customRouter.route('implement function');
      expect(codingDecision.selectedCli).toBeDefined();
    });

    it('should not record preferences when online learning is disabled', () => {
      const offlineRouter = new PreferenceRouter({
        enableOnlineLearning: false,
      });

      offlineRouter.recordPreference('test', true);
      offlineRouter.recordPreference('test', true);

      const stats = offlineRouter.getStats();
      expect(stats.totalDataPoints).toBe(0);
    });
  });

  describe('createPreferenceRouter factory', () => {
    it('should create router with default config', () => {
      const router = createPreferenceRouter();
      expect(router).toBeInstanceOf(PreferenceRouter);
    });

    it('should create router with custom config', () => {
      const router = createPreferenceRouter({
        routingThreshold: 0.7,
        minDataPoints: 20,
      });

      expect(router).toBeInstanceOf(PreferenceRouter);
    });

    it('should accept custom data store', () => {
      const customStore = new InMemoryPreferenceStore(50);
      const router = createPreferenceRouter({}, customStore);

      router.recordPreference('test', true);

      const stats = customStore.getStats();
      expect(stats.totalDataPoints).toBe(1);
    });
  });
});

/**
 * Tests for routing-audit-format utilities
 *
 * Verifies formatting functions for the routing-audit CLI output.
 * (Source: Issue #170, CODING_STANDARDS.md)
 */

import { describe, it, expect } from 'vitest';
import {
  formatHeader,
  formatTaskAnalysis,
  formatBudgetFilter,
  formatTopsisRanking,
  formatLinUCBSelection,
  formatFinalSelection,
  formatBanditStats,
  formatAsciiOutput,
  formatJsonOutput,
} from './routing-audit-format.js';
import type {
  RoutingAuditResult,
  BudgetFilterResult,
  LinUCBArmDetail,
  BanditStats,
} from './routing-audit-types.js';
import type { TaskProfile } from '../cli-adapters/task-analyzer.js';
import type { TopsisResult, TopsisScore } from '../cli-adapters/topsis-types.js';

describe('routing-audit-format', () => {
  // Create mock data for tests
  const mockTaskProfile: TaskProfile = {
    taskType: 'code_implementation',
    contextRequired: 5000,
    reasoningComplexity: 6,
    codeGeneration: true,
    multimodal: false,
    parallelizable: false,
    budgetSensitive: false,
  };

  const mockBudgetResults: BudgetFilterResult[] = [
    { cliName: 'claude', withinBudget: true, reason: 'within budget' },
    { cliName: 'gemini', withinBudget: true, reason: 'within budget' },
    { cliName: 'codex', withinBudget: true, reason: 'within budget' },
  ];

  const mockTopsisScores: TopsisScore[] = [
    {
      cliName: 'claude',
      closenessScore: 0.85,
      rawValues: { quality: 0.9, cost: 0.2, latency: 0.3 },
      normalizedValues: { quality: 0.9, cost: 0.2, latency: 0.3 },
      weightedValues: { quality: 0.45, cost: 0.06, latency: 0.06 },
      distanceToPIS: 0.1,
      distanceToNIS: 0.5,
    },
    {
      cliName: 'gemini',
      closenessScore: 0.75,
      rawValues: { quality: 0.8, cost: 0.1, latency: 0.2 },
      normalizedValues: { quality: 0.8, cost: 0.1, latency: 0.2 },
      weightedValues: { quality: 0.4, cost: 0.03, latency: 0.04 },
      distanceToPIS: 0.2,
      distanceToNIS: 0.4,
    },
    {
      cliName: 'codex',
      closenessScore: 0.65,
      rawValues: { quality: 0.7, cost: 0.3, latency: 0.4 },
      normalizedValues: { quality: 0.7, cost: 0.3, latency: 0.4 },
      weightedValues: { quality: 0.35, cost: 0.09, latency: 0.08 },
      distanceToPIS: 0.3,
      distanceToNIS: 0.35,
    },
  ];

  const mockTopsisResult: TopsisResult = {
    selectedModel: 'claude',
    scores: mockTopsisScores,
    positiveIdeal: { quality: 1.0, cost: 0.0, latency: 0.0 },
    negativeIdeal: { quality: 0.0, cost: 1.0, latency: 1.0 },
    costOptimized: false,
    estimatedSavingsPercent: 0,
    reasoning: 'Selected for best closeness score',
  };

  const mockLinucbDetails: LinUCBArmDetail[] = [
    { cliName: 'claude', ucbScore: 1.5, pullCount: 10, avgReward: 0.8, isExploration: false },
    { cliName: 'gemini', ucbScore: 1.2, pullCount: 5, avgReward: 0.6, isExploration: false },
    { cliName: 'codex', ucbScore: 1.8, pullCount: 2, avgReward: 0.4, isExploration: true },
  ];

  const mockResult: RoutingAuditResult = {
    task: 'Implement a sorting algorithm with unit tests',
    taskProfile: mockTaskProfile,
    budgetResults: mockBudgetResults,
    topsisResult: mockTopsisResult,
    linucbDetails: mockLinucbDetails,
    selectedCli: 'claude',
    selectionReason: 'LinUCB exploitation (best expected reward)',
    isExploration: false,
  };

  describe('formatHeader', () => {
    it('should format header with task name', () => {
      const lines = formatHeader(mockResult);

      expect(lines.length).toBeGreaterThan(0);
      expect(lines.join('\n')).toContain('Routing Audit');
      expect(lines.join('\n')).toContain('Implement a sorting algorithm');
    });

    it('should truncate long task names', () => {
      const longTaskResult = {
        ...mockResult,
        task: 'This is a very long task description that should be truncated in the header for display purposes',
      };

      const lines = formatHeader(longTaskResult);
      const output = lines.join('\n');

      expect(output).toContain('...');
    });
  });

  describe('formatTaskAnalysis', () => {
    it('should format task profile analysis', () => {
      const lines = formatTaskAnalysis(mockResult);

      expect(lines.length).toBeGreaterThan(0);
      expect(lines.join('\n')).toContain('Task Analysis');
    });
  });

  describe('formatBudgetFilter', () => {
    it('should format all passing budget results', () => {
      const lines = formatBudgetFilter(mockResult);
      const output = lines.join('\n');

      expect(output).toContain('Budget Filter');
      expect(output).toContain('3/3 pass');
      expect(output).toContain('claude');
      expect(output).toContain('gemini');
      expect(output).toContain('codex');
    });

    it('should show failed budget checks', () => {
      const failedBudgetResult: RoutingAuditResult = {
        ...mockResult,
        budgetResults: [
          { cliName: 'claude', withinBudget: true, reason: 'within budget' },
          { cliName: 'gemini', withinBudget: false, reason: 'exceeds token limit' },
          { cliName: 'codex', withinBudget: true, reason: 'within budget' },
        ],
      };

      const lines = formatBudgetFilter(failedBudgetResult);
      const output = lines.join('\n');

      expect(output).toContain('2/3 pass');
      expect(output).toContain('exceeds token limit');
    });
  });

  describe('formatTopsisRanking', () => {
    it('should format TOPSIS scores', () => {
      const lines = formatTopsisRanking(mockResult);
      const output = lines.join('\n');

      expect(output).toContain('TOPSIS Ranking');
      expect(output).toContain('claude');
      expect(output).toContain('85.0%');
    });

    it('should show ranking numbers', () => {
      const lines = formatTopsisRanking(mockResult);
      const output = lines.join('\n');

      expect(output).toContain('1.');
      expect(output).toContain('2.');
      expect(output).toContain('3.');
    });

    it('should show quality, cost, latency values', () => {
      const lines = formatTopsisRanking(mockResult);
      const output = lines.join('\n');

      expect(output).toContain('q=');
      expect(output).toContain('c=');
      expect(output).toContain('l=');
    });
  });

  describe('formatLinUCBSelection', () => {
    it('should format LinUCB arm details', () => {
      const lines = formatLinUCBSelection(mockResult);
      const output = lines.join('\n');

      expect(output).toContain('LinUCB Selection');
      expect(output).toContain('UCB:');
      expect(output).toContain('pulls:');
    });

    it('should mark selected arm', () => {
      const lines = formatLinUCBSelection(mockResult);
      const output = lines.join('\n');

      expect(output).toContain('exploit');
    });

    it('should show exploration marker for exploration selection', () => {
      const explorationResult: RoutingAuditResult = {
        ...mockResult,
        selectedCli: 'codex',
        isExploration: true,
      };

      const lines = formatLinUCBSelection(explorationResult);
      const output = lines.join('\n');

      expect(output).toContain('explore');
    });
  });

  describe('formatFinalSelection', () => {
    it('should format final selection', () => {
      const lines = formatFinalSelection(mockResult, false);
      const output = lines.join('\n');

      expect(output).toContain('Final Selection');
      expect(output).toContain('claude');
      expect(output).toContain('Reason:');
    });

    it('should include explanation when requested', () => {
      const lines = formatFinalSelection(mockResult, true);
      const output = lines.join('\n');

      expect(output).toContain('Explanation:');
      expect(output).toContain('Task analyzed');
      expect(output).toContain('TOPSIS ranks');
      expect(output).toContain('LinUCB balances');
    });

    it('should not include explanation when not requested', () => {
      const lines = formatFinalSelection(mockResult, false);
      const output = lines.join('\n');

      expect(output).not.toContain('Explanation:');
    });
  });

  describe('formatBanditStats', () => {
    const mockBanditStats: BanditStats = {
      detailedArms: [
        {
          cliName: 'claude',
          pullCount: 10,
          avgReward: 0.8,
          cumulativeReward: 8,
          learnedWeights: [0.5, 0.3, 0.2],
          featureImportance: [
            { feature: 'taskComplexity', importance: 0.4 },
            { feature: 'contextLength', importance: 0.3 },
            { feature: 'isCodeTask', importance: 0.2 },
          ],
        },
        {
          cliName: 'gemini',
          pullCount: 5,
          avgReward: 0.6,
          cumulativeReward: 3,
          learnedWeights: [0.4, 0.4, 0.2],
          featureImportance: [
            { feature: 'taskComplexity', importance: 0.35 },
            { feature: 'contextLength', importance: 0.35 },
            { feature: 'isCodeTask', importance: 0.3 },
          ],
        },
        {
          cliName: 'codex',
          pullCount: 2,
          avgReward: 0.4,
          cumulativeReward: 0.8,
          learnedWeights: [0.6, 0.2, 0.2],
          featureImportance: [
            { feature: 'isCodeTask', importance: 0.5 },
            { feature: 'taskComplexity', importance: 0.3 },
            { feature: 'contextLength', importance: 0.2 },
          ],
        },
      ],
      exploration: {
        totalPulls: 17,
        explorationRatio: 0.15,
        armDistribution: [
          { name: 'claude', proportion: 0.588 },
          { name: 'gemini', proportion: 0.294 },
          { name: 'codex', proportion: 0.118 },
        ],
      },
    };

    it('should return empty array when no bandit stats', () => {
      const lines = formatBanditStats(mockResult);
      expect(lines).toEqual([]);
    });

    it('should format bandit stats when present', () => {
      const resultWithStats: RoutingAuditResult = {
        ...mockResult,
        banditStats: mockBanditStats,
      };

      const lines = formatBanditStats(resultWithStats);
      const output = lines.join('\n');

      expect(output).toContain('LinUCB Detailed Statistics');
      expect(output).toContain('Exploration');
      expect(output).toContain('Arm Distribution');
      expect(output).toContain('Feature Importance');
    });

    it('should show exploration ratio', () => {
      const resultWithStats: RoutingAuditResult = {
        ...mockResult,
        banditStats: mockBanditStats,
      };

      const lines = formatBanditStats(resultWithStats);
      const output = lines.join('\n');

      expect(output).toContain('15.0%');
      expect(output).toContain('17 total pulls');
    });

    it('should show feature importance for each arm', () => {
      const resultWithStats: RoutingAuditResult = {
        ...mockResult,
        banditStats: mockBanditStats,
      };

      const lines = formatBanditStats(resultWithStats);
      const output = lines.join('\n');

      expect(output).toContain('taskComplexity');
      expect(output).toContain('contextLength');
      expect(output).toContain('isCodeTask');
    });
  });

  describe('formatAsciiOutput', () => {
    it('should combine all sections', () => {
      const output = formatAsciiOutput(mockResult, { task: mockResult.task });

      expect(output).toContain('Routing Audit');
      expect(output).toContain('Task Analysis');
      expect(output).toContain('Budget Filter');
      expect(output).toContain('TOPSIS Ranking');
      expect(output).toContain('LinUCB Selection');
      expect(output).toContain('Final Selection');
    });

    it('should include explanation when requested', () => {
      const output = formatAsciiOutput(mockResult, { task: mockResult.task, explain: true });

      expect(output).toContain('Explanation:');
    });

    it('should include bandit stats when present', () => {
      const resultWithStats: RoutingAuditResult = {
        ...mockResult,
        banditStats: {
          detailedArms: [
            {
              cliName: 'claude',
              pullCount: 10,
              avgReward: 0.8,
              cumulativeReward: 8,
              learnedWeights: [0.5],
              featureImportance: [{ feature: 'test', importance: 0.5 }],
            },
          ],
          exploration: {
            totalPulls: 10,
            explorationRatio: 0.1,
            armDistribution: [{ name: 'claude', proportion: 1.0 }],
          },
        },
      };

      const output = formatAsciiOutput(resultWithStats, {
        task: mockResult.task,
        banditStats: true,
      });

      expect(output).toContain('LinUCB Detailed Statistics');
    });
  });

  describe('formatJsonOutput', () => {
    it('should return valid JSON', () => {
      const output = formatJsonOutput(mockResult);
      const parsed = JSON.parse(output) as RoutingAuditResult;

      expect(parsed.task).toBe(mockResult.task);
      expect(parsed.selectedCli).toBe('claude');
    });

    it('should include all result fields', () => {
      const output = formatJsonOutput(mockResult);
      const parsed = JSON.parse(output) as RoutingAuditResult;

      expect(parsed.taskProfile).toBeDefined();
      expect(parsed.budgetResults).toBeDefined();
      expect(parsed.topsisResult).toBeDefined();
      expect(parsed.linucbDetails).toBeDefined();
      expect(parsed.selectionReason).toBeDefined();
      expect(parsed.isExploration).toBeDefined();
    });

    it('should be prettified', () => {
      const output = formatJsonOutput(mockResult);

      expect(output).toContain('\n');
      expect(output).toContain('  ');
    });
  });
});

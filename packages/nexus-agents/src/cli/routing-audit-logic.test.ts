/**
 * Tests for routing-audit-logic utilities
 *
 * Verifies core routing audit functions including task analysis,
 * budget filtering, TOPSIS ranking, and LinUCB selection.
 * (Source: Issue #170, CODING_STANDARDS.md)
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeTaskString,
  taskProfileToBanditContext,
  simulateBudgetFilter,
  runTopsisRanking,
  computeLinUCBDetails,
  computeBanditStats,
  auditRouting,
} from './routing-audit-logic.js';
import { LinUCBBandit } from '../cli-adapters/linucb-bandit.js';
import type { BanditContext } from '../cli-adapters/budget-router-types.js';

describe('routing-audit-logic', () => {
  describe('analyzeTaskString', () => {
    it('should analyze a code generation task', () => {
      const profile = analyzeTaskString('Write a function to sort an array');

      expect(profile).toBeDefined();
      expect(profile.codeGeneration).toBe(true);
      expect(profile.taskType).toBeDefined();
    });

    it('should analyze a reasoning task', () => {
      const profile = analyzeTaskString('Explain the architecture of microservices');

      expect(profile).toBeDefined();
      expect(profile.reasoningComplexity).toBeGreaterThan(0);
    });

    it('should analyze a simple task', () => {
      const profile = analyzeTaskString('List files in a directory');

      expect(profile).toBeDefined();
      expect(profile.contextRequired).toBeGreaterThan(0);
    });

    it('should handle empty task string', () => {
      const profile = analyzeTaskString('');

      expect(profile).toBeDefined();
      expect(profile.taskType).toBeDefined();
    });

    it('should detect code-related keywords', () => {
      const profile = analyzeTaskString('Implement unit tests for the API endpoint');

      expect(profile.codeGeneration).toBe(true);
    });
  });

  describe('taskProfileToBanditContext', () => {
    it('should convert task profile to bandit context', () => {
      const profile = analyzeTaskString('Write a complex algorithm with optimization');
      const context = taskProfileToBanditContext(profile);

      expect(context).toHaveProperty('taskComplexity');
      expect(context).toHaveProperty('contextLengthNormalized');
      expect(context).toHaveProperty('isCodeTask');
      expect(context).toHaveProperty('isReasoningTask');
      expect(context).toHaveProperty('budgetUtilization');
      expect(context).toHaveProperty('timePressure');
    });

    it('should normalize task complexity', () => {
      const profile = analyzeTaskString('Simple task');
      const context = taskProfileToBanditContext(profile);

      expect(context.taskComplexity).toBeGreaterThanOrEqual(0);
      expect(context.taskComplexity).toBeLessThanOrEqual(1);
    });

    it('should normalize context length', () => {
      const profile = analyzeTaskString('Task with lots of context requirements');
      const context = taskProfileToBanditContext(profile);

      expect(context.contextLengthNormalized).toBeGreaterThanOrEqual(0);
      expect(context.contextLengthNormalized).toBeLessThanOrEqual(1);
    });

    it('should set isCodeTask for code generation tasks', () => {
      const profile = analyzeTaskString('Write a Python function');
      const context = taskProfileToBanditContext(profile);

      expect(context.isCodeTask).toBe(true);
    });

    it('should set default budget utilization', () => {
      const profile = analyzeTaskString('Any task');
      const context = taskProfileToBanditContext(profile);

      expect(context.budgetUtilization).toBe(0.5);
    });

    it('should set default time pressure', () => {
      const profile = analyzeTaskString('Any task');
      const context = taskProfileToBanditContext(profile);

      expect(context.timePressure).toBe(0.3);
    });
  });

  describe('simulateBudgetFilter', () => {
    it('should return results for all three CLIs', () => {
      const results = simulateBudgetFilter();

      expect(results).toHaveLength(3);
      expect(results.map((r) => r.cliName)).toContain('claude');
      expect(results.map((r) => r.cliName)).toContain('gemini');
      expect(results.map((r) => r.cliName)).toContain('codex');
    });

    it('should mark all CLIs as within budget', () => {
      const results = simulateBudgetFilter();

      for (const result of results) {
        expect(result.withinBudget).toBe(true);
        expect(result.reason).toBe('within budget');
      }
    });

    it('should return readonly array', () => {
      const results = simulateBudgetFilter();

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('runTopsisRanking', () => {
    it('should return TOPSIS result', () => {
      const profile = analyzeTaskString('Write a sorting algorithm');
      const result = runTopsisRanking(profile);

      expect(result).toHaveProperty('selectedModel');
      expect(result).toHaveProperty('scores');
      expect(['claude', 'gemini', 'codex']).toContain(result.selectedModel);
    });

    it('should return scores for all CLIs', () => {
      const profile = analyzeTaskString('Simple task');
      const result = runTopsisRanking(profile);

      expect(result.scores.length).toBeGreaterThanOrEqual(3);
    });

    it('should rank by closeness score', () => {
      const profile = analyzeTaskString('Complex architecture review');
      const result = runTopsisRanking(profile);

      // Verify scores are ordered by closenessScore
      for (let i = 0; i < result.scores.length - 1; i++) {
        const current = result.scores[i];
        const next = result.scores[i + 1];
        if (current !== undefined && next !== undefined) {
          expect(current.closenessScore).toBeGreaterThanOrEqual(next.closenessScore);
        }
      }
    });

    it('should include raw values in scores', () => {
      const profile = analyzeTaskString('Any task');
      const result = runTopsisRanking(profile);

      for (const score of result.scores) {
        expect(score.rawValues).toHaveProperty('quality');
        expect(score.rawValues).toHaveProperty('cost');
        expect(score.rawValues).toHaveProperty('latency');
      }
    });
  });

  describe('computeLinUCBDetails', () => {
    it('should return details for all CLIs', () => {
      const bandit = new LinUCBBandit(['claude', 'gemini', 'codex']);
      const context: BanditContext = {
        taskComplexity: 0.5,
        contextLengthNormalized: 0.3,
        isCodeTask: true,
        isReasoningTask: false,
        budgetUtilization: 0.5,
        timePressure: 0.3,
      };

      const details = computeLinUCBDetails(bandit, context);

      expect(details).toHaveLength(3);
      expect(details.map((d) => d.cliName)).toContain('claude');
      expect(details.map((d) => d.cliName)).toContain('gemini');
      expect(details.map((d) => d.cliName)).toContain('codex');
    });

    it('should include UCB scores', () => {
      const bandit = new LinUCBBandit(['claude', 'gemini', 'codex']);
      const context: BanditContext = {
        taskComplexity: 0.5,
        contextLengthNormalized: 0.3,
        isCodeTask: false,
        isReasoningTask: true,
        budgetUtilization: 0.5,
        timePressure: 0.3,
      };

      const details = computeLinUCBDetails(bandit, context);

      for (const detail of details) {
        expect(typeof detail.ucbScore).toBe('number');
        expect(detail.ucbScore).toBeGreaterThanOrEqual(0);
      }
    });

    it('should include pull counts', () => {
      const bandit = new LinUCBBandit(['claude', 'gemini', 'codex']);
      const context: BanditContext = {
        taskComplexity: 0.5,
        contextLengthNormalized: 0.3,
        isCodeTask: false,
        isReasoningTask: false,
        budgetUtilization: 0.5,
        timePressure: 0.3,
      };

      const details = computeLinUCBDetails(bandit, context);

      for (const detail of details) {
        expect(typeof detail.pullCount).toBe('number');
        expect(detail.pullCount).toBeGreaterThanOrEqual(0);
      }
    });

    it('should mark exploration state', () => {
      const bandit = new LinUCBBandit(['claude', 'gemini', 'codex']);
      const context: BanditContext = {
        taskComplexity: 0.5,
        contextLengthNormalized: 0.3,
        isCodeTask: true,
        isReasoningTask: false,
        budgetUtilization: 0.5,
        timePressure: 0.3,
      };

      const details = computeLinUCBDetails(bandit, context);

      for (const detail of details) {
        expect(typeof detail.isExploration).toBe('boolean');
      }
    });
  });

  describe('computeBanditStats', () => {
    it('should return detailed arm statistics', () => {
      const bandit = new LinUCBBandit(['claude', 'gemini', 'codex']);
      const stats = computeBanditStats(bandit);

      expect(stats).toHaveProperty('detailedArms');
      expect(stats).toHaveProperty('exploration');
      expect(stats.detailedArms).toHaveLength(3);
    });

    it('should include feature importance', () => {
      const bandit = new LinUCBBandit(['claude', 'gemini', 'codex']);
      const stats = computeBanditStats(bandit);

      for (const arm of stats.detailedArms) {
        expect(arm.featureImportance).toBeDefined();
        expect(Array.isArray(arm.featureImportance)).toBe(true);
      }
    });

    it('should include exploration statistics', () => {
      const bandit = new LinUCBBandit(['claude', 'gemini', 'codex']);
      const stats = computeBanditStats(bandit);

      expect(stats.exploration).toHaveProperty('totalPulls');
      expect(stats.exploration).toHaveProperty('explorationRatio');
      expect(stats.exploration).toHaveProperty('armDistribution');
    });

    it('should have arm distribution sum to 1', () => {
      const bandit = new LinUCBBandit(['claude', 'gemini', 'codex']);
      const stats = computeBanditStats(bandit);

      const sum = stats.exploration.armDistribution.reduce((acc, arm) => acc + arm.proportion, 0);
      expect(sum).toBeCloseTo(1, 5);
    });
  });

  describe('auditRouting', () => {
    it('should return complete audit result', () => {
      const result = auditRouting({ task: 'Write a function to parse JSON' });

      expect(result).toHaveProperty('task');
      expect(result).toHaveProperty('taskProfile');
      expect(result).toHaveProperty('budgetResults');
      expect(result).toHaveProperty('topsisResult');
      expect(result).toHaveProperty('linucbDetails');
      expect(result).toHaveProperty('selectedCli');
      expect(result).toHaveProperty('selectionReason');
      expect(result).toHaveProperty('isExploration');
    });

    it('should select a valid CLI', () => {
      const result = auditRouting({ task: 'Any task description' });

      expect(['claude', 'gemini', 'codex']).toContain(result.selectedCli);
    });

    it('should use TOPSIS in deterministic mode', () => {
      const result = auditRouting({
        task: 'Implement a feature',
        deterministic: true,
      });

      expect(result.selectedCli).toBe(result.topsisResult.selectedModel);
      expect(result.selectionReason).toContain('TOPSIS');
      expect(result.selectionReason).toContain('deterministic');
    });

    it('should not include bandit stats by default', () => {
      const result = auditRouting({ task: 'Any task' });

      expect(result.banditStats).toBeUndefined();
    });

    it('should include bandit stats when requested', () => {
      const result = auditRouting({
        task: 'Any task',
        banditStats: true,
      });

      expect(result.banditStats).toBeDefined();
      expect(result.banditStats?.detailedArms).toHaveLength(3);
    });

    it('should analyze code tasks correctly', () => {
      const result = auditRouting({ task: 'Write unit tests for the API' });

      expect(result.taskProfile.codeGeneration).toBe(true);
    });

    it('should provide selection reason', () => {
      const result = auditRouting({ task: 'Any task' });

      expect(result.selectionReason).toBeTruthy();
      expect(result.selectionReason.length).toBeGreaterThan(0);
    });

    it('should handle various task types', () => {
      const tasks = [
        'Write a Python script',
        'Review the system architecture',
        'Debug the authentication flow',
        'Generate documentation',
        'Optimize database queries',
      ];

      for (const task of tasks) {
        const result = auditRouting({ task });
        expect(result.selectedCli).toBeDefined();
        expect(['claude', 'gemini', 'codex']).toContain(result.selectedCli);
      }
    });
  });
});

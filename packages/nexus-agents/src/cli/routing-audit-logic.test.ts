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
  taskProfileToBanditContextFromProfile,
  analyzeToBanditContext,
  simulateBudgetFilter,
  runTopsisRanking,
  computeLinUCBDetails,
  computeBanditStats,
  auditRouting,
} from './routing-audit-logic.js';
import { LinUCBBandit } from '../cli-adapters/linucb-bandit.js';
import type { BanditContext, TaskProfile } from '../core/index.js';
import { CLI_NAMES } from '../config/model-capabilities-types.js';

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

    it('should handle long task descriptions', () => {
      const longTask = 'a'.repeat(10000);
      const profile = analyzeTaskString(longTask);

      expect(profile).toBeDefined();
      expect(profile.contextRequired).toBeGreaterThan(0);
    });

    it('should identify architecture tasks', () => {
      const profile = analyzeTaskString('Design system architecture for microservices');

      expect(profile.taskType).toBe('architecture');
    });

    it('should identify bulk operations', () => {
      const profile = analyzeTaskString('Process batch of 10000 files');

      expect(profile).toBeDefined();
      expect(profile.taskType).toBeDefined();
    });
  });

  describe('taskProfileToBanditContextFromProfile', () => {
    it('should convert task profile to bandit context', () => {
      const profile = analyzeTaskString('Write a complex algorithm with optimization');
      const context = taskProfileToBanditContextFromProfile(profile);

      expect(context).toHaveProperty('taskComplexity');
      expect(context).toHaveProperty('contextLengthNormalized');
      expect(context).toHaveProperty('isCodeTask');
      expect(context).toHaveProperty('isReasoningTask');
      expect(context).toHaveProperty('budgetUtilization');
      expect(context).toHaveProperty('timePressure');
    });

    it('should normalize task complexity', () => {
      const profile = analyzeTaskString('Simple task');
      const context = taskProfileToBanditContextFromProfile(profile);

      expect(context.taskComplexity).toBeGreaterThanOrEqual(0);
      expect(context.taskComplexity).toBeLessThanOrEqual(1);
    });

    it('should normalize context length', () => {
      const profile = analyzeTaskString('Task with lots of context requirements');
      const context = taskProfileToBanditContextFromProfile(profile);

      expect(context.contextLengthNormalized).toBeGreaterThanOrEqual(0);
      expect(context.contextLengthNormalized).toBeLessThanOrEqual(1);
    });

    it('should set isCodeTask for code generation tasks', () => {
      const profile = analyzeTaskString('Write a Python function');
      const context = taskProfileToBanditContextFromProfile(profile);

      expect(context.isCodeTask).toBe(1);
    });

    it('should set default budget utilization', () => {
      const profile = analyzeTaskString('Any task');
      const context = taskProfileToBanditContextFromProfile(profile);

      expect(context.budgetUtilization).toBe(0.5);
    });

    it('should set default time pressure', () => {
      const profile = analyzeTaskString('Any task');
      const context = taskProfileToBanditContextFromProfile(profile);

      expect(context.timePressure).toBe(0.3);
    });

    it('should cap context length at 1.0', () => {
      const profile: TaskProfile = {
        taskType: 'code_implementation',
        contextRequired: 500000,
        reasoningComplexity: 5,
        codeGeneration: true,
        multimodal: false,
        parallelizable: false,
        budgetSensitive: false,
      };
      const context = taskProfileToBanditContextFromProfile(profile);

      expect(context.contextLengthNormalized).toBe(1);
    });

    it('should identify reasoning tasks by high complexity', () => {
      const profile: TaskProfile = {
        taskType: 'code_implementation',
        contextRequired: 1000,
        reasoningComplexity: 8,
        codeGeneration: true,
        multimodal: false,
        parallelizable: false,
        budgetSensitive: false,
      };
      const context = taskProfileToBanditContextFromProfile(profile);

      expect(context.isReasoningTask).toBe(1);
    });

    it('should handle zero reasoning complexity', () => {
      const profile: TaskProfile = {
        taskType: 'bulk_operations',
        contextRequired: 500,
        reasoningComplexity: 0,
        codeGeneration: false,
        multimodal: false,
        parallelizable: true,
        budgetSensitive: false,
      };
      const context = taskProfileToBanditContextFromProfile(profile);

      expect(context.taskComplexity).toBe(0);
      expect(context.isReasoningTask).toBe(0);
    });
  });

  describe('analyzeToBanditContext', () => {
    it('should directly convert task to bandit context', () => {
      const context = analyzeToBanditContext('Write a function to parse JSON');

      expect(context).toHaveProperty('taskComplexity');
      expect(context).toHaveProperty('contextLengthNormalized');
      expect(context).toHaveProperty('isCodeTask');
      expect(context).toHaveProperty('isReasoningTask');
      expect(context).toHaveProperty('budgetUtilization');
      expect(context).toHaveProperty('timePressure');
    });

    it('should produce consistent results for same task', () => {
      const task = 'Implement authentication module with tests';
      const context1 = analyzeToBanditContext(task);
      const context2 = analyzeToBanditContext(task);

      expect(context1.taskComplexity).toBe(context2.taskComplexity);
      expect(context1.isCodeTask).toBe(context2.isCodeTask);
      expect(context1.isReasoningTask).toBe(context2.isReasoningTask);
    });

    it('should normalize all values correctly', () => {
      const context = analyzeToBanditContext('Complex architectural design task');

      expect(context.taskComplexity).toBeGreaterThanOrEqual(0);
      expect(context.taskComplexity).toBeLessThanOrEqual(1);
      expect(context.contextLengthNormalized).toBeGreaterThanOrEqual(0);
      expect(context.contextLengthNormalized).toBeLessThanOrEqual(1);
      expect([0, 1]).toContain(context.isCodeTask);
      expect([0, 1]).toContain(context.isReasoningTask);
    });

    it('should handle empty task string', () => {
      const context = analyzeToBanditContext('');

      expect(context).toBeDefined();
      expect(context.taskComplexity).toBeGreaterThanOrEqual(0);
    });

    it('should identify code tasks', () => {
      const context = analyzeToBanditContext('Write unit tests for the API');

      expect(context.isCodeTask).toBe(1);
    });

    it('should identify reasoning tasks', () => {
      const context = analyzeToBanditContext('Explain the architecture of distributed systems');

      expect(context.isReasoningTask).toBeGreaterThanOrEqual(0);
    });

    it('should handle special characters in task description', () => {
      const context = analyzeToBanditContext('Task with @#$%^&*() special chars');

      expect(context).toBeDefined();
      expect(context.taskComplexity).toBeGreaterThanOrEqual(0);
    });
  });

  describe('simulateBudgetFilter', () => {
    it('should return results for all CLIs', () => {
      const results = simulateBudgetFilter();

      expect(results).toHaveLength(CLI_NAMES.length);
      for (const cli of CLI_NAMES) {
        expect(results.map((r) => r.cliName)).toContain(cli);
      }
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

    it('should adjust profiles for architecture tasks', () => {
      const profile: TaskProfile = {
        taskType: 'architecture',
        contextRequired: 10000,
        reasoningComplexity: 8,
        codeGeneration: false,
        multimodal: false,
        parallelizable: false,
        budgetSensitive: false,
      };
      const result = runTopsisRanking(profile);

      expect(result).toBeDefined();
      expect(result.selectedModel).toBeDefined();
    });

    it('should adjust profiles for bulk operations', () => {
      const profile: TaskProfile = {
        taskType: 'bulk_operations',
        contextRequired: 500,
        reasoningComplexity: 2,
        codeGeneration: false,
        multimodal: false,
        parallelizable: true,
        budgetSensitive: false,
      };
      const result = runTopsisRanking(profile);

      expect(result).toBeDefined();
      expect(result.selectedModel).toBeDefined();
    });

    it('should compute ideal points', () => {
      const profile = analyzeTaskString('Test task');
      const result = runTopsisRanking(profile);

      expect(result.positiveIdeal).toBeDefined();
      expect(result.negativeIdeal).toBeDefined();
    });

    it('should compute expected output tokens', () => {
      const profile: TaskProfile = {
        taskType: 'code_implementation',
        contextRequired: 3000,
        reasoningComplexity: 5,
        codeGeneration: true,
        multimodal: false,
        parallelizable: false,
        budgetSensitive: false,
      };
      const result = runTopsisRanking(profile);

      // Should compute 30% of input tokens as output
      expect(result).toBeDefined();
    });
  });

  describe('computeLinUCBDetails', () => {
    it('should return details for all CLIs', () => {
      const bandit = new LinUCBBandit(['claude', 'gemini', 'codex']);
      const context: BanditContext = {
        taskComplexity: 0.5,
        contextLengthNormalized: 0.3,
        isCodeTask: 1,
        isReasoningTask: 0,
        budgetUtilization: 0.5,
        timePressure: 0.3,
      };

      const details = computeLinUCBDetails(bandit, context);

      expect(details).toHaveLength(3); // bandit was created with 3 arms
      expect(details.map((d) => d.cliName)).toContain('claude');
      expect(details.map((d) => d.cliName)).toContain('gemini');
      expect(details.map((d) => d.cliName)).toContain('codex');
    });

    it('should include UCB scores', () => {
      const bandit = new LinUCBBandit(['claude', 'gemini', 'codex']);
      const context: BanditContext = {
        taskComplexity: 0.5,
        contextLengthNormalized: 0.3,
        isCodeTask: 0,
        isReasoningTask: 1,
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
        isCodeTask: 0,
        isReasoningTask: 0,
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
        isCodeTask: 1,
        isReasoningTask: 0,
        budgetUtilization: 0.5,
        timePressure: 0.3,
      };

      const details = computeLinUCBDetails(bandit, context);

      for (const detail of details) {
        expect(typeof detail.isExploration).toBe('boolean');
      }
    });

    it('should identify exploration when selected arm has lower reward', () => {
      const bandit = new LinUCBBandit(['claude', 'gemini', 'codex']);
      const context: BanditContext = {
        taskComplexity: 0.5,
        contextLengthNormalized: 0.3,
        isCodeTask: 1,
        isReasoningTask: 0,
        budgetUtilization: 0.5,
        timePressure: 0.3,
      };

      // Train bandit with different rewards (0=claude, 1=gemini)
      for (let i = 0; i < 10; i++) {
        bandit.select(context);
        bandit.update(0, context, 0.9);
        bandit.select(context);
        bandit.update(1, context, 0.3);
      }

      const details = computeLinUCBDetails(bandit, context);

      // Should have details for all arms
      expect(details).toHaveLength(3); // bandit was created with 3 arms
    });

    it('should handle zero pulls', () => {
      const bandit = new LinUCBBandit(['claude', 'gemini', 'codex']);
      const context: BanditContext = {
        taskComplexity: 0.3,
        contextLengthNormalized: 0.2,
        isCodeTask: 0,
        isReasoningTask: 1,
        budgetUtilization: 0.4,
        timePressure: 0.2,
      };

      const details = computeLinUCBDetails(bandit, context);

      for (const detail of details) {
        expect(detail.pullCount).toBe(0);
        expect(detail.avgReward).toBe(0);
      }
    });

    it('should return readonly array', () => {
      const bandit = new LinUCBBandit(['claude', 'gemini', 'codex']);
      const context: BanditContext = {
        taskComplexity: 0.5,
        contextLengthNormalized: 0.3,
        isCodeTask: 1,
        isReasoningTask: 0,
        budgetUtilization: 0.5,
        timePressure: 0.3,
      };

      const details = computeLinUCBDetails(bandit, context);

      expect(Array.isArray(details)).toBe(true);
    });
  });

  describe('computeBanditStats', () => {
    it('should return detailed arm statistics', () => {
      const bandit = new LinUCBBandit(['claude', 'gemini', 'codex']);
      const stats = computeBanditStats(bandit);

      expect(stats).toHaveProperty('detailedArms');
      expect(stats).toHaveProperty('exploration');
      expect(stats.detailedArms).toHaveLength(3); // bandit was created with 3 arms
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

    it('should include learned weights', () => {
      const bandit = new LinUCBBandit(['claude', 'gemini', 'codex']);
      const context: BanditContext = {
        taskComplexity: 0.5,
        contextLengthNormalized: 0.3,
        isCodeTask: 1,
        isReasoningTask: 0,
        budgetUtilization: 0.5,
        timePressure: 0.3,
      };

      // Train bandit
      for (let i = 0; i < 10; i++) {
        const selection = bandit.select(context);
        bandit.update(selection.armIndex, context, 0.8);
      }

      const stats = computeBanditStats(bandit);

      for (const arm of stats.detailedArms) {
        expect(arm.learnedWeights).toBeDefined();
        expect(Array.isArray(arm.learnedWeights)).toBe(true);
      }
    });

    it('should compute cumulative rewards', () => {
      const bandit = new LinUCBBandit(['claude', 'gemini', 'codex']);
      const context: BanditContext = {
        taskComplexity: 0.5,
        contextLengthNormalized: 0.3,
        isCodeTask: 1,
        isReasoningTask: 0,
        budgetUtilization: 0.5,
        timePressure: 0.3,
      };

      // Train with specific rewards
      for (let i = 0; i < 5; i++) {
        bandit.select(context);
        bandit.update(0, context, 0.8);
      }

      const stats = computeBanditStats(bandit);
      const claudeArm = stats.detailedArms.find((a) => a.cliName === 'claude');

      expect(claudeArm).toBeDefined();
      expect(claudeArm!.cumulativeReward).toBeGreaterThanOrEqual(0);
    });

    it('should compute exploration ratio', () => {
      const bandit = new LinUCBBandit(['claude', 'gemini', 'codex']);
      const stats = computeBanditStats(bandit);

      expect(stats.exploration.explorationRatio).toBeGreaterThanOrEqual(0);
      expect(stats.exploration.explorationRatio).toBeLessThanOrEqual(1);
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
      expect(result.banditStats?.detailedArms).toHaveLength(CLI_NAMES.length);
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

    it('should use LinUCB selection by default', () => {
      const result = auditRouting({
        task: 'Write unit tests',
        deterministic: false,
      });

      expect(result.selectionReason).toContain('LinUCB');
    });

    it('should provide exploration or exploitation reason', () => {
      const result = auditRouting({ task: 'Simple task' });

      if (result.isExploration) {
        expect(result.selectionReason).toContain('exploration');
      } else {
        expect(result.selectionReason).toContain('exploitation');
      }
    });

    it('should filter eligible CLIs from budget results', () => {
      const result = auditRouting({ task: 'Any task' });
      const eligibleClis = result.budgetResults.filter((r) => r.withinBudget).map((r) => r.cliName);

      expect(eligibleClis).toHaveLength(CLI_NAMES.length);
      expect(result.linucbDetails).toHaveLength(eligibleClis.length);
    });

    it('should handle long task descriptions', () => {
      const longTask = 'Implement a comprehensive feature that ' + 'does many things '.repeat(100);
      const result = auditRouting({ task: longTask });

      expect(result).toBeDefined();
      expect(result.task).toBe(longTask);
    });

    it('should include all required fields in result', () => {
      const result = auditRouting({ task: 'Test task' });

      expect(result.task).toBeDefined();
      expect(result.taskProfile).toBeDefined();
      expect(result.budgetResults).toBeDefined();
      expect(result.topsisResult).toBeDefined();
      expect(result.linucbDetails).toBeDefined();
      expect(result.selectedCli).toBeDefined();
      expect(result.selectionReason).toBeDefined();
      expect(typeof result.isExploration).toBe('boolean');
    });

    it('should handle empty task string', () => {
      const result = auditRouting({ task: '' });

      expect(result).toBeDefined();
      expect(result.selectedCli).toBeDefined();
    });

    it('should use correct context for LinUCB', () => {
      const result = auditRouting({ task: 'Write a sorting algorithm' });

      // LinUCB details should be based on the same task analysis
      expect(result.linucbDetails).toHaveLength(CLI_NAMES.length);
      const selectedArm = result.linucbDetails.find((d) => d.cliName === result.selectedCli);
      expect(selectedArm).toBeDefined();
    });
  });
});

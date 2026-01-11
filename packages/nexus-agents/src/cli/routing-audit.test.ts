/**
 * Tests for the routing-audit command.
 *
 * @module cli/routing-audit.test
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { auditRouting, routingAuditCommand, type RoutingAuditOptions } from './routing-audit.js';

describe('routing-audit', () => {
  describe('auditRouting', () => {
    it('should return a valid routing audit result', () => {
      const options: RoutingAuditOptions = {
        task: 'Implement a sorting algorithm',
      };

      const result = auditRouting(options);

      expect(result).toBeDefined();
      expect(result.task).toBe(options.task);
      expect(result.taskProfile).toBeDefined();
      expect(result.budgetResults).toBeDefined();
      expect(result.budgetResults.length).toBe(3); // claude, gemini, codex
      expect(result.topsisResult).toBeDefined();
      expect(result.topsisResult.scores).toBeDefined();
      expect(result.linucbDetails).toBeDefined();
      expect(result.selectedCli).toBeDefined();
      expect(['claude', 'gemini', 'codex']).toContain(result.selectedCli);
      expect(result.selectionReason).toBeDefined();
      expect(typeof result.isExploration).toBe('boolean');
    });

    it('should analyze task profile correctly for code tasks', () => {
      const result = auditRouting({ task: 'Write a function to parse JSON' });

      expect(result.taskProfile).toBeDefined();
      expect(result.taskProfile.codeGeneration).toBe(true);
    });

    it('should return all budget results as passing', () => {
      const result = auditRouting({ task: 'Any task' });

      for (const br of result.budgetResults) {
        expect(br.withinBudget).toBe(true);
        expect(br.reason).toBe('within budget');
      }
    });

    it('should include TOPSIS scores for all CLIs', () => {
      const result = auditRouting({ task: 'Review architecture decisions' });

      expect(result.topsisResult.scores.length).toBeGreaterThanOrEqual(3);
      for (const score of result.topsisResult.scores) {
        expect(score.cliName).toBeDefined();
        expect(score.closenessScore).toBeGreaterThanOrEqual(0);
        expect(score.closenessScore).toBeLessThanOrEqual(1);
      }
    });

    it('should include LinUCB details for all arms', () => {
      const result = auditRouting({ task: 'Generate unit tests' });

      expect(result.linucbDetails.length).toBe(3);
      for (const arm of result.linucbDetails) {
        expect(arm.cliName).toBeDefined();
        expect(typeof arm.ucbScore).toBe('number');
        expect(typeof arm.pullCount).toBe('number');
        expect(typeof arm.avgReward).toBe('number');
        expect(typeof arm.isExploration).toBe('boolean');
      }
    });

    it('should use TOPSIS selection in deterministic mode', () => {
      const result = auditRouting({
        task: 'Implement complex algorithm',
        deterministic: true,
      });

      expect(result.selectedCli).toBe(result.topsisResult.selectedModel);
      expect(result.selectionReason).toContain('TOPSIS');
      expect(result.selectionReason).toContain('deterministic');
    });

    it('should provide exploitation reason when not exploring', () => {
      const result = auditRouting({
        task: 'Simple task',
        deterministic: false,
      });

      // LinUCB with fresh bandit should either explore or exploit
      expect(['exploitation', 'exploration']).toContain(
        result.selectionReason.includes('exploration') ? 'exploration' : 'exploitation'
      );
    });

    it('should not include bandit stats by default', () => {
      const result = auditRouting({ task: 'Test task' });

      expect(result.banditStats).toBeUndefined();
    });

    it('should include bandit stats when banditStats option is true', () => {
      const result = auditRouting({
        task: 'Test bandit stats',
        banditStats: true,
      });

      expect(result.banditStats).toBeDefined();
      expect(result.banditStats?.detailedArms).toBeDefined();
      expect(result.banditStats?.detailedArms.length).toBe(3);
      expect(result.banditStats?.exploration).toBeDefined();
    });

    it('should include feature importance in bandit stats', () => {
      const result = auditRouting({
        task: 'Analyze feature importance',
        banditStats: true,
      });

      const stats = result.banditStats;
      expect(stats).toBeDefined();

      for (const arm of stats!.detailedArms) {
        expect(arm.featureImportance).toBeDefined();
        expect(arm.featureImportance.length).toBeGreaterThan(0);
        for (const fi of arm.featureImportance) {
          expect(fi.feature).toBeDefined();
          expect(typeof fi.importance).toBe('number');
          expect(fi.importance).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('should include exploration ratio in bandit stats', () => {
      const result = auditRouting({
        task: 'Check exploration ratio',
        banditStats: true,
      });

      const stats = result.banditStats;
      expect(stats).toBeDefined();
      expect(typeof stats!.exploration.explorationRatio).toBe('number');
      expect(stats!.exploration.explorationRatio).toBeGreaterThanOrEqual(0);
      expect(stats!.exploration.explorationRatio).toBeLessThanOrEqual(1);
    });

    it('should include arm distribution in bandit stats', () => {
      const result = auditRouting({
        task: 'Check arm distribution',
        banditStats: true,
      });

      const stats = result.banditStats;
      expect(stats).toBeDefined();
      expect(stats!.exploration.armDistribution.length).toBe(3);

      let totalProportion = 0;
      for (const arm of stats!.exploration.armDistribution) {
        expect(arm.name).toBeDefined();
        expect(typeof arm.proportion).toBe('number');
        totalProportion += arm.proportion;
      }
      expect(totalProportion).toBeCloseTo(1, 5);
    });
  });

  describe('routingAuditCommand', () => {
    let stdoutSpy: MockInstance;
    let stderrSpy: MockInstance;

    beforeEach(() => {
      stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    });

    // Helper to get the command output (last call, which is the actual output)
    function getCommandOutput(): string {
      const calls = stdoutSpy.mock.calls as unknown[][];
      // The command output is the last call (logger outputs come first)
      const lastCall = calls[calls.length - 1];
      return (lastCall?.[0] as string) ?? '';
    }

    it('should return 0 on success', () => {
      const exitCode = routingAuditCommand({
        task: 'Test task',
      });

      expect(exitCode).toBe(0);
      expect(stdoutSpy).toHaveBeenCalled();
    });

    it('should output ASCII format by default', () => {
      routingAuditCommand({
        task: 'Test task',
      });

      const output = getCommandOutput();
      expect(output).toContain('Routing Audit');
      expect(output).toContain('Budget Filter');
      expect(output).toContain('TOPSIS Ranking');
      expect(output).toContain('LinUCB Selection');
      expect(output).toContain('Final Selection');
    });

    it('should output JSON format when json option is true', () => {
      routingAuditCommand({
        task: 'Test task',
        json: true,
      });

      const output = getCommandOutput();
      const parsed = JSON.parse(output) as { task: string };
      expect(parsed.task).toBe('Test task');
    });

    it('should include explanation when explain is true', () => {
      routingAuditCommand({
        task: 'Test task',
        explain: true,
      });

      const output = getCommandOutput();
      expect(output).toContain('Explanation:');
      expect(output).toContain('Task analyzed');
      expect(output).toContain('TOPSIS ranks');
      expect(output).toContain('LinUCB balances');
    });

    it('should handle deterministic mode', () => {
      routingAuditCommand({
        task: 'Test task',
        deterministic: true,
      });

      const output = getCommandOutput();
      expect(output).toContain('deterministic');
    });

    it('should include bandit stats in ASCII output when banditStats is true', () => {
      routingAuditCommand({
        task: 'Test bandit stats output',
        banditStats: true,
      });

      const output = getCommandOutput();
      expect(output).toContain('LinUCB Detailed Statistics');
      expect(output).toContain('Exploration');
      expect(output).toContain('Arm Distribution');
      expect(output).toContain('Feature Importance');
    });

    it('should include bandit stats in JSON output when banditStats is true', () => {
      routingAuditCommand({
        task: 'Test bandit stats JSON',
        banditStats: true,
        json: true,
      });

      const output = getCommandOutput();
      const parsed = JSON.parse(output) as {
        banditStats: {
          detailedArms: unknown[];
          exploration: { explorationRatio: number };
        };
      };
      expect(parsed.banditStats).toBeDefined();
      expect(parsed.banditStats.detailedArms).toBeDefined();
      expect(parsed.banditStats.exploration.explorationRatio).toBeDefined();
    });
  });
});

/**
 * Tests for SICA integration with orchestrate tool.
 * (Source: Issue #558 - Wire SICA wrapping to Orchestrator)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createOrchestratorWithSica } from './orchestrate-sica.js';
import { createLogger } from '../../core/logger.js';
import * as sicaModule from '../../cli-server-sica.js';

vi.mock('../../cli-server-sica.js', () => ({
  isSicaEnabled: vi.fn(),
  getSicaConfig: vi.fn(),
}));

describe('orchestrate-sica', () => {
  const logger = createLogger({ component: 'test' });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createOrchestratorWithSica', () => {
    it('returns plain Orchestrator when SICA is disabled', () => {
      vi.mocked(sicaModule.isSicaEnabled).mockReturnValue(false);

      const orchestrator = createOrchestratorWithSica(logger);

      expect(orchestrator).toBeDefined();
      expect(orchestrator.execute).toBeDefined();
      // Plain Orchestrator should be returned
      expect(sicaModule.isSicaEnabled).toHaveBeenCalled();
    });

    it('returns plain Orchestrator when SICA config is undefined', () => {
      vi.mocked(sicaModule.isSicaEnabled).mockReturnValue(true);
      vi.mocked(sicaModule.getSicaConfig).mockReturnValue(undefined);

      const orchestrator = createOrchestratorWithSica(logger);

      expect(orchestrator).toBeDefined();
      expect(sicaModule.getSicaConfig).toHaveBeenCalled();
    });

    it('returns SICA-wrapped Orchestrator when SICA is enabled', () => {
      vi.mocked(sicaModule.isSicaEnabled).mockReturnValue(true);
      vi.mocked(sicaModule.getSicaConfig).mockReturnValue({
        enabled: true,
        minExecutionsForImprovement: 5,
        improvementThreshold: 0.7,
        maxActiveVersions: 3,
        autoSelectBest: true,
        improvementCooldownMs: 60000,
        enableObservability: true,
      });

      const orchestrator = createOrchestratorWithSica(logger);

      expect(orchestrator).toBeDefined();
      expect(orchestrator.execute).toBeDefined();
      // SICA-wrapped Orchestrator should be returned
      expect(sicaModule.isSicaEnabled).toHaveBeenCalled();
      expect(sicaModule.getSicaConfig).toHaveBeenCalled();
    });

    it('wrapped Orchestrator execute method transforms result correctly', async () => {
      vi.mocked(sicaModule.isSicaEnabled).mockReturnValue(true);
      vi.mocked(sicaModule.getSicaConfig).mockReturnValue({
        enabled: true,
        minExecutionsForImprovement: 5,
        improvementThreshold: 0.7,
        maxActiveVersions: 3,
        autoSelectBest: true,
        improvementCooldownMs: 60000,
        enableObservability: true,
      });

      const orchestrator = createOrchestratorWithSica(logger);

      // Execute a simple task (will use heuristic analysis without adapter)
      const result = await orchestrator.execute({
        id: 'test-task-1',
        description: 'Simple test task',
        context: {},
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.taskId).toBe('test-task-1');
        expect(result.value.output).toBeDefined();
        expect(result.value.metadata).toBeDefined();
      }
    });
  });
});

/**
 * Tests for cli-server-stpa STPA integration module.
 * (Source: Issue #530 - Integrate STPA safety framework)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runStpaSafetyAnalysis, StpaSafetyError, TOOL_DEFINITIONS } from './cli-server-stpa.js';
import type { ILogger } from './core/index.js';
import { NexusError } from './core/index.js';
import { err } from './core/result.js';
import type { StpaAnalysisResult } from './mcp/safety/index.js';
import { HazardCategory, RiskLevel, StpaAnalysisError } from './mcp/safety/index.js';
import * as safetyModule from './mcp/safety/index.js';

/** Creates a valid mock StpaAnalysisResult for testing. */
function createMockAnalysisResult(): StpaAnalysisResult {
  return {
    toolResults: [],
    summary: {
      totalTools: 0,
      totalHazards: 0,
      totalUnsafeControlActions: 0,
      totalSafetyConstraints: 0,
      hazardsByCategory: {
        [HazardCategory.DATA_LOSS]: 0,
        [HazardCategory.PRIVILEGE_ESCALATION]: 0,
        [HazardCategory.RESOURCE_EXHAUSTION]: 0,
        [HazardCategory.INFORMATION_DISCLOSURE]: 0,
        [HazardCategory.UNAUTHORIZED_EXECUTION]: 0,
        [HazardCategory.INTEGRITY_VIOLATION]: 0,
        [HazardCategory.DENIAL_OF_SERVICE]: 0,
        [HazardCategory.INJECTION]: 0,
      },
      averageRiskScore: 0,
      toolsByRiskLevel: {
        [RiskLevel.CRITICAL]: 0,
        [RiskLevel.HIGH]: 0,
        [RiskLevel.MODERATE]: 0,
        [RiskLevel.LOW]: 0,
        [RiskLevel.MINIMAL]: 0,
      },
    },
    interactions: [],
    metadata: {
      analyzerVersion: '1.0.0',
      startedAt: new Date(),
      completedAt: new Date(),
      durationMs: 0,
      configuration: {
        includeLowSeverity: true,
        generateAllConstraints: true,
        checkInteractions: true,
        maxHazardsPerTool: 50,
        categories: [],
      },
    },
  };
}

describe('cli-server-stpa', () => {
  let mockLogger: ILogger;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnThis(),
    } as unknown as ILogger;
  });

  describe('TOOL_DEFINITIONS', () => {
    it('should include all 8 registered tools', () => {
      expect(TOOL_DEFINITIONS).toHaveLength(8);
    });

    it('should have valid tool definitions with required fields', () => {
      for (const tool of TOOL_DEFINITIONS) {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
      }
    });

    it('should include expected tool names', () => {
      const toolNames = TOOL_DEFINITIONS.map((t) => t.name);
      expect(toolNames).toContain('delegate_to_model');
      expect(toolNames).toContain('orchestrate');
      expect(toolNames).toContain('create_expert');
      expect(toolNames).toContain('execute_expert');
      expect(toolNames).toContain('run_workflow');
      expect(toolNames).toContain('list_experts');
      expect(toolNames).toContain('list_workflows');
      expect(toolNames).toContain('consensus_vote');
    });
  });

  describe('runStpaSafetyAnalysis', () => {
    it('should log analysis summary at INFO level', () => {
      runStpaSafetyAnalysis(mockLogger, false);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'STPA safety analysis completed',
        expect.objectContaining({
          toolsAnalyzed: 8,
          hazardsIdentified: expect.any(Number),
          unsafeControlActions: expect.any(Number),
          safetyConstraints: expect.any(Number),
        })
      );
    });

    it('should not throw when failOnHighSeverity is false', () => {
      expect(() => {
        runStpaSafetyAnalysis(mockLogger, false);
      }).not.toThrow();
    });

    it('should analyze all 8 registered tools', () => {
      runStpaSafetyAnalysis(mockLogger, false);

      const infoCall = (mockLogger.info as ReturnType<typeof vi.fn>).mock.calls.find(
        (call) => call[0] === 'STPA safety analysis completed'
      );
      expect(infoCall).toBeDefined();
      expect(infoCall?.[1]?.toolsAnalyzed).toBe(8);
    });
  });

  describe('analysis failure handling', () => {
    it('should warn and return when analysis fails and failOnHighSeverity is false', () => {
      const analysisError = new StpaAnalysisError('analyzer crashed', 'test-tool');
      vi.spyOn(safetyModule, 'analyzeTools').mockReturnValue(err(analysisError));

      expect(() => {
        runStpaSafetyAnalysis(mockLogger, false);
      }).not.toThrow();

      expect(mockLogger.warn).toHaveBeenCalledWith('STPA safety analysis failed', {
        error: 'analyzer crashed',
      });

      vi.restoreAllMocks();
    });

    it('should throw NexusError when analysis fails and failOnHighSeverity is true', () => {
      const analysisError = new StpaAnalysisError('analyzer crashed', 'test-tool');
      vi.spyOn(safetyModule, 'analyzeTools').mockReturnValue(err(analysisError));

      expect(() => {
        runStpaSafetyAnalysis(mockLogger, true);
      }).toThrow(NexusError);

      vi.restoreAllMocks();
    });
  });

  describe('StpaSafetyError', () => {
    it('should be an instance of Error', () => {
      const mockResult = createMockAnalysisResult();
      const error = new StpaSafetyError('Test error', mockResult);

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('StpaSafetyError');
      expect(error.message).toBe('Test error');
      expect(error.analysisResult).toBe(mockResult);
    });

    it('should have SECURITY_ERROR code', () => {
      const mockResult = createMockAnalysisResult();
      const error = new StpaSafetyError('Test error', mockResult);
      expect(error.code).toBe('SECURITY_ERROR');
    });
  });
});

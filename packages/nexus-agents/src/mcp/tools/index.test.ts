/**
 * Tests for MCP tool registration index.
 *
 * Validates that registerTools() returns the correct tool list,
 * all register functions are exported, and helper utilities work.
 */

import { describe, it, expect } from 'vitest';
import {
  registerTools,
  toolSuccess,
  toolSuccessStructured,
  toolError,
  // All register functions must be re-exported from index
  registerOrchestrateTool,
  registerCreateExpertTool,
  registerExecuteExpertTool,
  registerRunWorkflowTool,
  registerDelegateToModelTool,
  registerListExpertsTool,
  registerListWorkflowsTool,
  registerConsensusVoteTool,
  registerResearchQueryTool,
  registerResearchAddTool,
  registerResearchDiscoverTool,
  registerResearchAnalyzeTool,
  registerResearchCatalogReviewTool,
  registerMemoryQueryTool,
  registerMemoryStatsTool,
  registerMemoryWriteTool,
  registerWeatherReportTool,
  registerIssueTriageTool,
  registerRunGraphWorkflowTool,
  registerExecuteSpecTool,
  registerRegistryImportTool,
  registerQueryTraceTool,
  registerRepoAnalyzeTool,
  registerRepoSecurityPlanTool,
  // Zod schemas
  OrchestrateInputSchema,
  CreateExpertInputSchema,
  ExecuteExpertInputSchema,
  RunWorkflowInputSchema,
  DelegateInputSchema,
  ListExpertsInputSchema,
  ListWorkflowsInputSchema,
  ConsensusVoteInputSchema,
  ResearchQueryInputSchema,
  ResearchAddInputSchema,
  ResearchDiscoverInputSchema,
  ResearchAnalyzeInputSchema,
  ResearchCatalogReviewInputSchema,
  MemoryQueryInputSchema,
  MemoryStatsInputSchema,
  MemoryWriteInputSchema,
  WeatherReportInputSchema,
  IssueTriageInputSchema,
  RunGraphWorkflowInputSchema,
  ExecuteSpecInputSchema,
  RegistryImportInputSchema,
  QueryTraceInputSchema,
  RepoAnalyzeInputSchema,
  RepoSecurityPlanInputSchema,
} from './index.js';

const EXPECTED_TOOL_COUNT = 24;

const EXPECTED_TOOL_NAMES = [
  'orchestrate',
  'create_expert',
  'execute_expert',
  'run_workflow',
  'delegate_to_model',
  'list_experts',
  'list_workflows',
  'consensus_vote',
  'research_query',
  'research_add',
  'research_discover',
  'research_analyze',
  'research_catalog_review',
  'memory_query',
  'memory_stats',
  'memory_write',
  'weather_report',
  'issue_triage',
  'run_graph_workflow',
  'execute_spec',
  'registry_import',
  'query_trace',
  'repo_analyze',
  'repo_security_plan',
];

describe('MCP tools index', () => {
  describe('registerTools', () => {
    it('returns exactly 22 tool names', () => {
      const server = { tool: () => undefined } as never;
      const result = registerTools(server);
      expect(result.tools).toHaveLength(EXPECTED_TOOL_COUNT);
    });

    it('returns all expected tool names', () => {
      const server = { tool: () => undefined } as never;
      const result = registerTools(server);
      expect([...result.tools].sort()).toEqual([...EXPECTED_TOOL_NAMES].sort());
    });

    it('returns a logger instance', () => {
      const server = { tool: () => undefined } as never;
      const result = registerTools(server);
      expect(result.logger).toBeDefined();
      expect(typeof result.logger.info).toBe('function');
    });

    it('returns a rate limiter instance', () => {
      const server = { tool: () => undefined } as never;
      const result = registerTools(server);
      expect(result.rateLimiter).toBeDefined();
    });
  });

  describe('register functions are exported', () => {
    const registerFunctions = [
      ['registerOrchestrateTool', registerOrchestrateTool],
      ['registerCreateExpertTool', registerCreateExpertTool],
      ['registerExecuteExpertTool', registerExecuteExpertTool],
      ['registerRunWorkflowTool', registerRunWorkflowTool],
      ['registerDelegateToModelTool', registerDelegateToModelTool],
      ['registerListExpertsTool', registerListExpertsTool],
      ['registerListWorkflowsTool', registerListWorkflowsTool],
      ['registerConsensusVoteTool', registerConsensusVoteTool],
      ['registerResearchQueryTool', registerResearchQueryTool],
      ['registerResearchAddTool', registerResearchAddTool],
      ['registerResearchDiscoverTool', registerResearchDiscoverTool],
      ['registerResearchAnalyzeTool', registerResearchAnalyzeTool],
      ['registerResearchCatalogReviewTool', registerResearchCatalogReviewTool],
      ['registerMemoryQueryTool', registerMemoryQueryTool],
      ['registerMemoryStatsTool', registerMemoryStatsTool],
      ['registerMemoryWriteTool', registerMemoryWriteTool],
      ['registerWeatherReportTool', registerWeatherReportTool],
      ['registerIssueTriageTool', registerIssueTriageTool],
      ['registerRunGraphWorkflowTool', registerRunGraphWorkflowTool],
      ['registerExecuteSpecTool', registerExecuteSpecTool],
      ['registerRegistryImportTool', registerRegistryImportTool],
      ['registerQueryTraceTool', registerQueryTraceTool],
      ['registerRepoAnalyzeTool', registerRepoAnalyzeTool],
      ['registerRepoSecurityPlanTool', registerRepoSecurityPlanTool],
    ] as const;

    it.each(registerFunctions)('%s is a function', (_name, fn) => {
      expect(typeof fn).toBe('function');
    });

    it('exports 23 register functions', () => {
      expect(registerFunctions).toHaveLength(EXPECTED_TOOL_COUNT);
    });
  });

  describe('Zod schemas are exported', () => {
    const schemas = [
      ['OrchestrateInputSchema', OrchestrateInputSchema],
      ['CreateExpertInputSchema', CreateExpertInputSchema],
      ['ExecuteExpertInputSchema', ExecuteExpertInputSchema],
      ['RunWorkflowInputSchema', RunWorkflowInputSchema],
      ['DelegateInputSchema', DelegateInputSchema],
      ['ListExpertsInputSchema', ListExpertsInputSchema],
      ['ListWorkflowsInputSchema', ListWorkflowsInputSchema],
      ['ConsensusVoteInputSchema', ConsensusVoteInputSchema],
      ['ResearchQueryInputSchema', ResearchQueryInputSchema],
      ['ResearchAddInputSchema', ResearchAddInputSchema],
      ['ResearchDiscoverInputSchema', ResearchDiscoverInputSchema],
      ['ResearchAnalyzeInputSchema', ResearchAnalyzeInputSchema],
      ['ResearchCatalogReviewInputSchema', ResearchCatalogReviewInputSchema],
      ['MemoryQueryInputSchema', MemoryQueryInputSchema],
      ['MemoryStatsInputSchema', MemoryStatsInputSchema],
      ['MemoryWriteInputSchema', MemoryWriteInputSchema],
      ['WeatherReportInputSchema', WeatherReportInputSchema],
      ['IssueTriageInputSchema', IssueTriageInputSchema],
      ['RunGraphWorkflowInputSchema', RunGraphWorkflowInputSchema],
      ['ExecuteSpecInputSchema', ExecuteSpecInputSchema],
      ['RegistryImportInputSchema', RegistryImportInputSchema],
      ['QueryTraceInputSchema', QueryTraceInputSchema],
      ['RepoAnalyzeInputSchema', RepoAnalyzeInputSchema],
      ['RepoSecurityPlanInputSchema', RepoSecurityPlanInputSchema],
    ] as const;

    it.each(schemas)('%s has a parse method', (_name, schema) => {
      expect(typeof schema.parse).toBe('function');
    });

    it('exports 23 schemas', () => {
      expect(schemas).toHaveLength(EXPECTED_TOOL_COUNT);
    });
  });

  describe('toolSuccess', () => {
    it('returns content with text', () => {
      const result = toolSuccess('hello');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({ type: 'text', text: 'hello' });
    });

    it('does not set isError', () => {
      const result = toolSuccess('ok');
      expect(result.isError).toBeUndefined();
    });
  });

  describe('toolSuccessStructured', () => {
    it('returns both content and structuredContent (Issue #1117)', () => {
      const data = { experts: [{ role: 'code' }], count: 1 };
      const result = toolSuccessStructured(data);
      expect(result.content).toHaveLength(1);
      expect(result.structuredContent).toEqual(data);
      expect(result.isError).toBeUndefined();
    });

    it('serializes data to JSON text content', () => {
      const data = { foo: 'bar', num: 42 };
      const result = toolSuccessStructured(data);
      const text = result.content[0]?.text ?? '';
      expect(JSON.parse(text)).toEqual(data);
    });
  });

  describe('toolError', () => {
    it('returns content with error message', () => {
      const result = toolError('bad input');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({ type: 'text', text: 'bad input' });
    });

    it('sets isError to true', () => {
      const result = toolError('fail');
      expect(result.isError).toBe(true);
    });

    it('does not include structuredContent', () => {
      const result = toolError('fail');
      expect(result.structuredContent).toBeUndefined();
    });
  });
});

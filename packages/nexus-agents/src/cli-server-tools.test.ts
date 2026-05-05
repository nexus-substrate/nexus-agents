/**
 * Tests for cli-server-tools.ts
 *
 * Covers: REGISTERED_TOOLS constant, OrchestratorUnavailableError, isToolAllowed,
 * createOrchestratorForOrchestration, copyOptionalProps, createToolContext,
 * registerMcpTools (with mocked sub-registrations), tool allowlisting,
 * STPA safety analysis integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { ErrorCode } from './core/index.js';
import {
  REGISTERED_TOOLS,
  OrchestratorUnavailableError,
  registerMcpTools,
} from './cli-server-tools.js';
import type { RegisterMcpToolsOptions } from './cli-server-tools.js';

// ============================================================================
// Mock external modules (vi.hoisted so they are available in vi.mock factories)
// ============================================================================

const {
  mockRegisterTools,
  mockRegisterDelegateToModelTool,
  mockRegisterOrchestrateTool,
  mockRegisterCreateExpertTool,
  mockRegisterExecuteExpertTool,
  mockRegisterRunWorkflowTool,
  mockRegisterListExpertsTool,
  mockRegisterListWorkflowsTool,
  mockRegisterConsensusVoteTool,
  mockRegisterResearchQueryTool,
  mockRegisterResearchAddTool,
  mockRegisterResearchAddSourceTool,
  mockRegisterResearchDiscoverTool,
  mockRegisterResearchAnalyzeTool,
  mockRegisterResearchCatalogReviewTool,
  mockRegisterResearchSynthesizeTool,
  mockRegisterSurveyOssLandscapeTool,
  mockRegisterVendorPublishingAuditTool,
  mockRegisterCompareDataFeedsTool,
  mockRegisterMemoryQueryTool,
  mockRegisterMemoryStatsTool,
  mockRegisterMemoryWriteTool,
  mockRegisterWeatherReportTool,
  mockRegisterImprovementReviewTool,
  mockRegisterRegistryImportTool,
  mockRegisterIssueTriageTool,
  mockRegisterRunGraphWorkflowTool,
  mockRegisterExecuteSpecTool,
  mockRegisterQueryTraceTool,
  mockRegisterQueryTaskStateTool,
  mockRegisterVerifyAuditChainTool,
  mockRegisterExtractSymbolsTool,
  mockRegisterSearchCodebaseTool,
  mockRegisterRepoAnalyzeTool,
  mockRegisterRepoSecurityPlanTool,
  mockCreateDefaultDeps,
  mockCreateRealWorkflowEngine,
  mockCreateToolRateLimiterFactory,
  mockSetGlobalToolRateLimiterFactory,
  mockRunStpaSafetyAnalysis,
  mockCreateGatewayServerProxy,
  mockGetSharedCliCache,
} = vi.hoisted(() => ({
  mockRegisterTools: vi.fn().mockReturnValue({
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
      setLevel: vi.fn(),
    },
  }),
  mockRegisterDelegateToModelTool: vi.fn(),
  mockRegisterOrchestrateTool: vi.fn(),
  mockRegisterCreateExpertTool: vi.fn(),
  mockRegisterExecuteExpertTool: vi.fn(),
  mockRegisterRunWorkflowTool: vi.fn(),
  mockRegisterListExpertsTool: vi.fn(),
  mockRegisterListWorkflowsTool: vi.fn(),
  mockRegisterConsensusVoteTool: vi.fn(),
  mockRegisterResearchQueryTool: vi.fn(),
  mockRegisterResearchAddTool: vi.fn(),
  mockRegisterResearchAddSourceTool: vi.fn(),
  mockRegisterResearchDiscoverTool: vi.fn(),
  mockRegisterResearchAnalyzeTool: vi.fn(),
  mockRegisterResearchCatalogReviewTool: vi.fn(),
  mockRegisterResearchSynthesizeTool: vi.fn(),
  mockRegisterSurveyOssLandscapeTool: vi.fn(),
  mockRegisterVendorPublishingAuditTool: vi.fn(),
  mockRegisterCompareDataFeedsTool: vi.fn(),
  mockRegisterMemoryQueryTool: vi.fn(),
  mockRegisterMemoryStatsTool: vi.fn(),
  mockRegisterMemoryWriteTool: vi.fn(),
  mockRegisterWeatherReportTool: vi.fn(),
  mockRegisterImprovementReviewTool: vi.fn(),
  mockRegisterRegistryImportTool: vi.fn(),
  mockRegisterIssueTriageTool: vi.fn(),
  mockRegisterRunGraphWorkflowTool: vi.fn(),
  mockRegisterExecuteSpecTool: vi.fn(),
  mockRegisterQueryTraceTool: vi.fn(),
  mockRegisterQueryTaskStateTool: vi.fn(),
  mockRegisterVerifyAuditChainTool: vi.fn(),
  mockRegisterExtractSymbolsTool: vi.fn(),
  mockRegisterSearchCodebaseTool: vi.fn(),
  mockRegisterRepoAnalyzeTool: vi.fn(),
  mockRegisterRepoSecurityPlanTool: vi.fn(),
  mockCreateDefaultDeps: vi.fn().mockReturnValue({
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
      setLevel: vi.fn(),
    },
    rateLimiter: { tryAcquire: vi.fn().mockReturnValue(true) },
  }),
  mockCreateRealWorkflowEngine: vi.fn().mockReturnValue({
    loadTemplate: vi.fn(),
    execute: vi.fn(),
    cancel: vi.fn(),
    getStatus: vi.fn(),
    listTemplates: vi.fn(),
  }),
  mockCreateToolRateLimiterFactory: vi.fn().mockReturnValue({
    getForTool: vi.fn().mockReturnValue({
      tryAcquire: vi.fn().mockReturnValue(true),
    }),
    isEnabled: vi.fn().mockReturnValue(true),
  }),
  mockSetGlobalToolRateLimiterFactory: vi.fn(),
  mockRunStpaSafetyAnalysis: vi.fn(),
  mockCreateGatewayServerProxy: vi.fn(),
  mockGetSharedCliCache: vi.fn().mockReturnValue({ get: vi.fn(), set: vi.fn() }),
}));

vi.mock('./mcp/index.js', () => ({
  registerTools: mockRegisterTools,
  registerDelegateToModelTool: mockRegisterDelegateToModelTool,
  registerOrchestrateTool: mockRegisterOrchestrateTool,
  registerCreateExpertTool: mockRegisterCreateExpertTool,
  registerExecuteExpertTool: mockRegisterExecuteExpertTool,
  registerRunWorkflowTool: mockRegisterRunWorkflowTool,
  registerListExpertsTool: mockRegisterListExpertsTool,
  registerListWorkflowsTool: mockRegisterListWorkflowsTool,
  registerConsensusVoteTool: mockRegisterConsensusVoteTool,
  registerResearchQueryTool: mockRegisterResearchQueryTool,
  registerResearchAddTool: mockRegisterResearchAddTool,
  registerResearchAddSourceTool: mockRegisterResearchAddSourceTool,
  registerResearchDiscoverTool: mockRegisterResearchDiscoverTool,
  registerResearchAnalyzeTool: mockRegisterResearchAnalyzeTool,
  registerResearchCatalogReviewTool: mockRegisterResearchCatalogReviewTool,
  registerResearchSynthesizeTool: mockRegisterResearchSynthesizeTool,
  registerSurveyOssLandscapeTool: mockRegisterSurveyOssLandscapeTool,
  registerVendorPublishingAuditTool: mockRegisterVendorPublishingAuditTool,
  registerCompareDataFeedsTool: mockRegisterCompareDataFeedsTool,
  registerMemoryQueryTool: mockRegisterMemoryQueryTool,
  registerMemoryStatsTool: mockRegisterMemoryStatsTool,
  registerMemoryWriteTool: mockRegisterMemoryWriteTool,
  registerWeatherReportTool: mockRegisterWeatherReportTool,
  registerImprovementReviewTool: mockRegisterImprovementReviewTool,
  registerRegistryImportTool: mockRegisterRegistryImportTool,
  registerIssueTriageTool: mockRegisterIssueTriageTool,
  registerRunGraphWorkflowTool: mockRegisterRunGraphWorkflowTool,
  registerExecuteSpecTool: mockRegisterExecuteSpecTool,
  registerQueryTraceTool: mockRegisterQueryTraceTool,
  registerQueryTaskStateTool: mockRegisterQueryTaskStateTool,
  registerVerifyAuditChainTool: mockRegisterVerifyAuditChainTool,
  registerExtractSymbolsTool: mockRegisterExtractSymbolsTool,
  registerSearchCodebaseTool: mockRegisterSearchCodebaseTool,
  registerRepoAnalyzeTool: mockRegisterRepoAnalyzeTool,
  registerRepoSecurityPlanTool: mockRegisterRepoSecurityPlanTool,
  createDefaultDeps: mockCreateDefaultDeps,
}));

vi.mock('./mcp/tools/orchestrate.js', () => ({
  createMockOrchestrator: vi.fn().mockReturnValue({
    execute: vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve({ ok: true, value: { taskId: 'mock', output: {}, metadata: {} } })
      ),
  }),

  createMockTechLead: vi.fn().mockReturnValue({
    execute: vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve({ ok: true, value: { taskId: 'mock', output: {}, metadata: {} } })
      ),
  }),
}));

vi.mock('./agents/index.js', () => ({
  Orchestrator: vi.fn().mockImplementation(function () {
    return {
      execute: vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve({ ok: true, value: { taskId: 'real', output: {}, metadata: {} } })
        ),
    };
  }),
  createOrchestrator: vi.fn().mockReturnValue({
    execute: vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve({ ok: true, value: { taskId: 'real', output: {}, metadata: {} } })
      ),
  }),
}));

vi.mock('./workflows/index.js', () => ({
  createRealWorkflowEngine: mockCreateRealWorkflowEngine,
}));

vi.mock('./mcp/middleware/index.js', () => ({
  createToolRateLimiterFactory: mockCreateToolRateLimiterFactory,
  setGlobalToolRateLimiterFactory: mockSetGlobalToolRateLimiterFactory,
}));

vi.mock('./cli-server-stpa.js', () => ({
  runStpaSafetyAnalysis: mockRunStpaSafetyAnalysis,
  StpaSafetyError: class StpaSafetyError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'StpaSafetyError';
    }
  },
}));

vi.mock('./mcp/gateway/index.js', () => ({
  createGatewayServerProxy: mockCreateGatewayServerProxy,
}));

vi.mock('./mcp/middleware/adapter-availability.js', () => ({
  getSharedCliCache: mockGetSharedCliCache,
}));

// Mock annotation proxy as identity (tested separately in annotation-proxy.test.ts)
vi.mock('./mcp/tools/annotation-proxy.js', () => ({
  createAnnotationsProxy: (server: unknown) => server,
}));

// Mock dev pipeline tool (tested separately in dev-pipeline-tool.test.ts)
vi.mock('./mcp/tools/dev-pipeline-tool.js', () => ({
  registerDevPipelineTool: vi.fn(),
}));

// Mock unified pipeline tool (tested separately)
vi.mock('./mcp/tools/pipeline-tool.js', () => ({
  registerPipelineTool: vi.fn(),
}));

// Mock observability proxy as identity (tested separately in tool-observability-proxy.test.ts)
vi.mock('./mcp/tools/tool-observability-proxy.js', () => ({
  createToolObservabilityProxy: (server: unknown) => server,
}));

// Mock prompts and resources registration (tested separately in their own test files)
vi.mock('./mcp/prompts/index.js', () => ({
  registerPrompts: vi.fn(),
}));

vi.mock('./mcp/resources/index.js', () => ({
  registerResources: vi.fn(),
}));

// ============================================================================
// Mock helpers
// ============================================================================

/** Re-sets mock return values after vi.clearAllMocks() wipes them. */
function resetMockReturnValues(): void {
  mockRegisterTools.mockReturnValue({
    logger: makeMockLogger(),
  });
  mockCreateDefaultDeps.mockReturnValue({
    logger: makeMockLogger(),
    rateLimiter: { tryAcquire: vi.fn().mockReturnValue(true) },
  });
  mockCreateRealWorkflowEngine.mockReturnValue({
    loadTemplate: vi.fn(),
    execute: vi.fn(),
    cancel: vi.fn(),
    getStatus: vi.fn(),
    listTemplates: vi.fn(),
  });
  mockCreateToolRateLimiterFactory.mockReturnValue({
    getForTool: vi.fn().mockReturnValue({
      tryAcquire: vi.fn().mockReturnValue(true),
    }),
    isEnabled: vi.fn().mockReturnValue(true),
  });
  // Gateway mock returns whatever server is passed (identity by default)
  mockCreateGatewayServerProxy.mockImplementation((server: unknown) => server);
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn().mockReturnThis(),
    setLevel: vi.fn(),
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockServer() {
  return {
    tool: vi.fn(),
    connect: vi.fn(),
  } as unknown as RegisterMcpToolsOptions['server'];
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeDefaultOptions(overrides: Record<string, unknown> = {}) {
  return {
    server: makeMockServer(),
    logger: makeMockLogger(),
    builtInTemplates: new Map(),
    ...overrides,
  } as RegisterMcpToolsOptions;
}

// ============================================================================
// REGISTERED_TOOLS constant
// ============================================================================

describe('REGISTERED_TOOLS', () => {
  it('should contain exactly 28 tool names', () => {
    expect(REGISTERED_TOOLS).toHaveLength(28);
  });

  it('should include all expected tool names', () => {
    const expected = [
      'delegate_to_model',
      'orchestrate',
      'create_expert',
      'execute_expert',
      'run_workflow',
      'list_experts',
      'list_workflows',
      'consensus_vote',
      'research_query',
      'research_add',
      'research_discover',
      'research_analyze',
      'research_catalog_review',
      'survey_oss_landscape',
      'vendor_publishing_audit',
      'compare_data_feeds',
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
      'improvement_review',
    ];
    expect([...REGISTERED_TOOLS]).toEqual(expected);
  });

  it('should have no duplicate entries', () => {
    const asSet = new Set(REGISTERED_TOOLS);
    expect(asSet.size).toBe(REGISTERED_TOOLS.length);
  });
});

// ============================================================================
// OrchestratorUnavailableError
// ============================================================================

describe('OrchestratorUnavailableError', () => {
  it('should have correct name', () => {
    const error = new OrchestratorUnavailableError('test message');
    expect(error.name).toBe('OrchestratorUnavailableError');
  });

  it('should have MODEL_UNAVAILABLE error code', () => {
    const error = new OrchestratorUnavailableError('no adapter');
    expect(error.code).toBe(ErrorCode.MODEL_UNAVAILABLE);
  });

  it('should preserve the message', () => {
    const msg = 'No model adapter available';
    const error = new OrchestratorUnavailableError(msg);
    expect(error.message).toBe(msg);
  });

  it('should be an instance of Error', () => {
    const error = new OrchestratorUnavailableError('test');
    expect(error).toBeInstanceOf(Error);
  });

  it('should work with empty message', () => {
    const error = new OrchestratorUnavailableError('');
    expect(error.message).toBe('');
    expect(error.code).toBe(ErrorCode.MODEL_UNAVAILABLE);
  });
});

// ============================================================================
// registerMcpTools - basic registration
// ============================================================================

describe('registerMcpTools', () => {
  const originalEnv = process.env['NEXUS_ALLOW_MOCK_ORCHESTRATION'];

  beforeEach(() => {
    vi.clearAllMocks();
    resetMockReturnValues();
    delete process.env['NEXUS_ALLOW_MOCK_ORCHESTRATION'];
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['NEXUS_ALLOW_MOCK_ORCHESTRATION'] = originalEnv;
    } else {
      delete process.env['NEXUS_ALLOW_MOCK_ORCHESTRATION'];
    }
  });

  it('should gracefully degrade when no adapter and mock not enabled', () => {
    const options = makeDefaultOptions();
    // Should NOT throw — orchestrate tool is skipped, other tools still register
    expect(() => {
      registerMcpTools(options);
    }).not.toThrow();
  });

  it('should succeed with useMockTechLead: true and no adapter', () => {
    const options = makeDefaultOptions({ useMockTechLead: true });
    expect(() => {
      registerMcpTools(options);
    }).not.toThrow();
  });

  it('should succeed with NEXUS_ALLOW_MOCK_ORCHESTRATION env var', () => {
    process.env['NEXUS_ALLOW_MOCK_ORCHESTRATION'] = 'true';
    const options = makeDefaultOptions();
    expect(() => {
      registerMcpTools(options);
    }).not.toThrow();
  });

  it('should gracefully degrade when env var is not "true"', () => {
    process.env['NEXUS_ALLOW_MOCK_ORCHESTRATION'] = 'false';
    const options = makeDefaultOptions();
    // Should NOT throw — orchestrate tool is skipped, other tools still register
    expect(() => {
      registerMcpTools(options);
    }).not.toThrow();
  });

  it('should succeed with a model adapter provided', () => {
    const mockAdapter = {
      generate: vi.fn(),
    } as unknown as RegisterMcpToolsOptions['modelAdapter'];
    const options = makeDefaultOptions({ modelAdapter: mockAdapter });
    expect(() => {
      registerMcpTools(options);
    }).not.toThrow();
  });

  it('should call registerTools with server and logger', () => {
    const options = makeDefaultOptions({ useMockTechLead: true });
    registerMcpTools(options);
    expect(mockRegisterTools).toHaveBeenCalledWith(options.server, { logger: options.logger });
  });

  it('should call setGlobalToolRateLimiterFactory', () => {
    const options = makeDefaultOptions({ useMockTechLead: true });
    registerMcpTools(options);
    expect(mockSetGlobalToolRateLimiterFactory).toHaveBeenCalledTimes(1);
  });

  it('should log registration info', () => {
    const logger = makeMockLogger();
    const options = makeDefaultOptions({ logger, useMockTechLead: true });
    registerMcpTools(options);
    expect(logger.info).toHaveBeenCalled();
  });

  it('should wire cliCache into execute_expert deps (Issue #945)', () => {
    const options = makeDefaultOptions({ useMockTechLead: true });
    registerMcpTools(options);
    expect(mockRegisterExecuteExpertTool).toHaveBeenCalledTimes(1);
    const call = mockRegisterExecuteExpertTool.mock.calls[0];
    expect(call).toBeDefined();

    const deps = call![1] as Record<string, unknown>;
    expect(deps).toHaveProperty('cliCache');
    expect(deps.cliCache).toBe(mockGetSharedCliCache());
  });
});

// ============================================================================
// registerMcpTools - STPA safety analysis
// ============================================================================

describe('registerMcpTools - STPA safety analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockReturnValues();
    process.env['NEXUS_ALLOW_MOCK_ORCHESTRATION'] = 'true';
  });

  afterEach(() => {
    delete process.env['NEXUS_ALLOW_MOCK_ORCHESTRATION'];
  });

  it('should not run STPA analysis by default', () => {
    const options = makeDefaultOptions();
    registerMcpTools(options);
    expect(mockRunStpaSafetyAnalysis).not.toHaveBeenCalled();
  });

  it('should run STPA analysis when enableStpaSafetyAnalysis is true', () => {
    const options = makeDefaultOptions({ enableStpaSafetyAnalysis: true });
    registerMcpTools(options);
    expect(mockRunStpaSafetyAnalysis).toHaveBeenCalledTimes(1);
  });

  it('should pass failOnHighSeverityHazards flag to STPA', () => {
    const options = makeDefaultOptions({
      enableStpaSafetyAnalysis: true,
      failOnHighSeverityHazards: true,
    });
    registerMcpTools(options);
    expect(mockRunStpaSafetyAnalysis).toHaveBeenCalledWith(expect.anything(), true);
  });

  it('should default failOnHighSeverityHazards to false', () => {
    const options = makeDefaultOptions({ enableStpaSafetyAnalysis: true });
    registerMcpTools(options);
    expect(mockRunStpaSafetyAnalysis).toHaveBeenCalledWith(expect.anything(), false);
  });
});

// ============================================================================
// registerMcpTools - tool allowlisting (Issue #740)
// ============================================================================

describe('registerMcpTools - tool allowlisting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockReturnValues();
    process.env['NEXUS_ALLOW_MOCK_ORCHESTRATION'] = 'true';
  });

  afterEach(() => {
    delete process.env['NEXUS_ALLOW_MOCK_ORCHESTRATION'];
  });

  it('should register all tool categories when no allowlist', () => {
    const options = makeDefaultOptions();
    registerMcpTools(options);
    expect(mockRegisterDelegateToModelTool).toHaveBeenCalled();
    expect(mockRegisterOrchestrateTool).toHaveBeenCalled();
    expect(mockRegisterConsensusVoteTool).toHaveBeenCalled();
    expect(mockRegisterResearchQueryTool).toHaveBeenCalled();
    expect(mockRegisterMemoryQueryTool).toHaveBeenCalled();
  });

  it('should skip categories when allowlist excludes them', () => {
    const options = makeDefaultOptions({
      securityConfig: {
        toolAllowlist: ['delegate_to_model', 'orchestrate'],
      },
    });
    registerMcpTools(options);

    expect(mockRegisterConsensusVoteTool).not.toHaveBeenCalled();
    expect(mockRegisterResearchQueryTool).not.toHaveBeenCalled();
    expect(mockRegisterMemoryQueryTool).not.toHaveBeenCalled();
    expect(mockRegisterIssueTriageTool).not.toHaveBeenCalled();
    expect(mockRegisterRunGraphWorkflowTool).not.toHaveBeenCalled();
    expect(mockRegisterExecuteSpecTool).not.toHaveBeenCalled();
  });

  it('should log allowlist info when active', () => {
    const logger = makeMockLogger();
    const options = makeDefaultOptions({
      logger,
      securityConfig: {
        toolAllowlist: ['delegate_to_model'],
      },
    });
    registerMcpTools(options);

    const allowlistCall = logger.info.mock.calls.find(
      (call: unknown[]) => call[0] === 'Tool allowlist active'
    );
    expect(allowlistCall).toBeDefined();
  });
});

// ============================================================================
// registerMcpTools - rate limiting config
// ============================================================================

describe('registerMcpTools - rate limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockReturnValues();
    process.env['NEXUS_ALLOW_MOCK_ORCHESTRATION'] = 'true';
  });

  afterEach(() => {
    delete process.env['NEXUS_ALLOW_MOCK_ORCHESTRATION'];
  });

  it('should create rate limiter factory with enabled=true by default', () => {
    const options = makeDefaultOptions();
    registerMcpTools(options);
    expect(mockCreateToolRateLimiterFactory).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true })
    );
  });

  it('should respect rateLimit.enabled=false from security config', () => {
    const options = makeDefaultOptions({
      securityConfig: {
        rateLimit: { enabled: false },
      },
    });
    registerMcpTools(options);
    expect(mockCreateToolRateLimiterFactory).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    );
  });
});

// ============================================================================
// registerMcpTools - workflow config wiring
// ============================================================================

describe('registerMcpTools - workflow config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockReturnValues();
    process.env['NEXUS_ALLOW_MOCK_ORCHESTRATION'] = 'true';
  });

  afterEach(() => {
    delete process.env['NEXUS_ALLOW_MOCK_ORCHESTRATION'];
  });

  it('should pass workflow config to workflow engine creation', () => {
    const options = makeDefaultOptions({
      workflowConfig: {
        timeout: 30000,
        maxParallel: 4,
        templatesDir: '/tmp/templates',
      },
    });
    registerMcpTools(options);
    expect(mockCreateRealWorkflowEngine).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultTimeoutMs: 30000,
        maxConcurrency: 4,
        templatePaths: ['/tmp/templates'],
      })
    );
  });
});

// ============================================================================
// registerMcpTools - policy firewall wiring
// ============================================================================

describe('registerMcpTools - policy firewall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockReturnValues();
    process.env['NEXUS_ALLOW_MOCK_ORCHESTRATION'] = 'true';
  });

  afterEach(() => {
    delete process.env['NEXUS_ALLOW_MOCK_ORCHESTRATION'];
  });

  it('should log policy firewall info when provided', () => {
    const logger = makeMockLogger();
    const mockFirewall = {
      getMode: vi.fn().mockReturnValue('enforce'),
    } as unknown as RegisterMcpToolsOptions['policyFirewall'];

    const options = makeDefaultOptions({
      logger,
      policyFirewall: mockFirewall,
      executionMode: 'read-write',
    });
    registerMcpTools(options);

    const regCall = logger.info.mock.calls.find(
      (call: unknown[]) => call[0] === 'Tools registered with per-tool rate limiting'
    );
    expect(regCall).toBeDefined();
    expect((regCall as unknown[])[1]).toEqual(
      expect.objectContaining({
        policyFirewallEnabled: true,
        policyMode: 'enforce',
        executionMode: 'read-write',
      })
    );
  });

  it('should log executionMode as read-only when not provided', () => {
    const logger = makeMockLogger();
    const options = makeDefaultOptions({ logger });
    registerMcpTools(options);

    const regCall = logger.info.mock.calls.find(
      (call: unknown[]) => call[0] === 'Tools registered with per-tool rate limiting'
    );
    expect(regCall).toBeDefined();
    expect((regCall as unknown[])[1]).toEqual(
      expect.objectContaining({ executionMode: 'read-only' })
    );
  });
});

// ============================================================================
// registerMcpTools - gateway middleware wiring (Issue #896)
// ============================================================================

describe('registerMcpTools - gateway wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockReturnValues();
    process.env['NEXUS_ALLOW_MOCK_ORCHESTRATION'] = 'true';
  });

  afterEach(() => {
    delete process.env['NEXUS_ALLOW_MOCK_ORCHESTRATION'];
  });

  it('should not create gateway proxy when gatewayConfig is omitted', () => {
    const options = makeDefaultOptions();
    registerMcpTools(options);
    expect(mockCreateGatewayServerProxy).not.toHaveBeenCalled();
  });

  it('should create gateway proxy when gatewayConfig is provided', () => {
    const gwConfig = { enabled: true };
    const options = makeDefaultOptions({ gatewayConfig: gwConfig });
    registerMcpTools(options);
    expect(mockCreateGatewayServerProxy).toHaveBeenCalledWith(options.server, gwConfig);
  });

  it('should pass gateway-wrapped server to registerTools', () => {
    const proxyServer = { registerTool: vi.fn() };
    mockCreateGatewayServerProxy.mockReturnValue(proxyServer);
    const gwConfig = { enabled: true };
    const options = makeDefaultOptions({ gatewayConfig: gwConfig });
    registerMcpTools(options);
    // registerTools should receive the proxy, not the original server
    expect(mockRegisterTools).toHaveBeenCalledWith(proxyServer, expect.anything());
  });
});

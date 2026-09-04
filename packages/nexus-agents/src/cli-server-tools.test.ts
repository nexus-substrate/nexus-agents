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
import {
  getGlobalPolicyFirewall,
  resetGlobalPolicyFirewall,
} from './mcp/middleware/policy-registry.js';
import { getPipelineEventBus } from './pipeline/event-bus.js';
import { getOutcomeStore } from './orchestration/outcomes/outcome-store.js';
import type { IAuditLogger } from './audit/audit-types.js';
import {
  configureUntrustedInputFirewall,
  runUntrustedInputFirewall,
  _setUntrustedInputFirewallForTests,
} from './dogfooding/untrusted-input-firewall.js';

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
  mockRegisterPrReviewTool,
  mockRegisterSupplyChainTradeoffPanelTool,
  mockRegisterRegistryImportTool,
  mockRegisterIssueTriageTool,
  mockRegisterRunGraphWorkflowTool,
  mockRegisterExecuteSpecTool,
  mockRegisterQueryTraceTool,
  mockRegisterQueryTaskStateTool,
  mockRegisterGetJobResultTool,
  mockRegisterListJobsTool,
  mockRegisterCancelJobTool,
  mockRegisterCiHealthCheckTool,
  mockRegisterVerifyAuditChainTool,
  mockRegisterExtractSymbolsTool,
  mockRegisterSearchCodebaseTool,
  mockRegisterSearchUsagesTool,
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
  mockRegisterPrReviewTool: vi.fn(),
  mockRegisterSupplyChainTradeoffPanelTool: vi.fn(),
  mockRegisterRegistryImportTool: vi.fn(),
  mockRegisterIssueTriageTool: vi.fn(),
  mockRegisterRunGraphWorkflowTool: vi.fn(),
  mockRegisterExecuteSpecTool: vi.fn(),
  mockRegisterQueryTraceTool: vi.fn(),
  mockRegisterQueryTaskStateTool: vi.fn(),
  mockRegisterGetJobResultTool: vi.fn(),
  mockRegisterListJobsTool: vi.fn(),
  mockRegisterCancelJobTool: vi.fn(),
  mockRegisterCiHealthCheckTool: vi.fn(),
  mockRegisterVerifyAuditChainTool: vi.fn(),
  mockRegisterExtractSymbolsTool: vi.fn(),
  mockRegisterSearchCodebaseTool: vi.fn(),
  mockRegisterSearchUsagesTool: vi.fn(),
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

vi.mock('./mcp/index.js', async () => ({
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
  registerPrReviewTool: mockRegisterPrReviewTool,
  registerSupplyChainTradeoffPanelTool: mockRegisterSupplyChainTradeoffPanelTool,
  registerRegistryImportTool: mockRegisterRegistryImportTool,
  registerIssueTriageTool: mockRegisterIssueTriageTool,
  registerRunGraphWorkflowTool: mockRegisterRunGraphWorkflowTool,
  registerExecuteSpecTool: mockRegisterExecuteSpecTool,
  registerQueryTraceTool: mockRegisterQueryTraceTool,
  registerQueryTaskStateTool: mockRegisterQueryTaskStateTool,
  registerGetJobResultTool: mockRegisterGetJobResultTool,
  registerListJobsTool: mockRegisterListJobsTool,
  registerCancelJobTool: mockRegisterCancelJobTool,
  registerCiHealthCheckTool: mockRegisterCiHealthCheckTool,
  registerVerifyAuditChainTool: mockRegisterVerifyAuditChainTool,
  registerExtractSymbolsTool: mockRegisterExtractSymbolsTool,
  registerSearchCodebaseTool: mockRegisterSearchCodebaseTool,
  registerSearchUsagesTool: mockRegisterSearchUsagesTool,
  registerRepoAnalyzeTool: mockRegisterRepoAnalyzeTool,
  registerRepoSecurityPlanTool: mockRegisterRepoSecurityPlanTool,
  registerRunQualityGateTool: vi.fn(),
  registerSuggestResearchTasksTool: vi.fn(),
  registerListAvailableModelsTool: vi.fn(),
  registerRunTool: vi.fn(),
  createDefaultDeps: mockCreateDefaultDeps,
  // Canonical tool-name list (Issue #2935) — DERIVED from the real TOOL_MANIFEST
  // via importActual (#3597) so the mock can never drift from the source of truth
  // (the prior hand-maintained copy had gone stale, missing `run`). The manifest
  // is an object array, so map to names.
  REGISTERED_TOOL_NAMES: (
    await vi.importActual<typeof import('./mcp/tools/tool-manifest.js')>(
      './mcp/tools/tool-manifest.js'
    )
  ).TOOL_MANIFEST.map((t) => t.name),
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
  // REGISTERED_TOOLS is the canonical list, so a count literal would be a
  // tautology and a maintenance tax. Assert structural invariants instead:
  // non-empty, unique, no blank names. Count drift is caught where a *parallel*
  // registry is cross-checked against this length (annotations, index, etc.).
  it('contains unique, non-empty tool names', () => {
    expect(REGISTERED_TOOLS.length).toBeGreaterThan(0);
    expect(new Set(REGISTERED_TOOLS).size).toBe(REGISTERED_TOOLS.length);
    expect(REGISTERED_TOOLS.every((name) => name.trim().length > 0)).toBe(true);
  });

  it('is the derived NAME list of the object-shaped TOOL_MANIFEST (#3597)', async () => {
    const { TOOL_MANIFEST } = await import('./mcp/tools/tool-manifest.js');
    // REGISTERED_TOOLS aliases REGISTERED_TOOL_NAMES = TOOL_MANIFEST.map(t => t.name).
    expect([...REGISTERED_TOOLS]).toEqual(TOOL_MANIFEST.map((t) => t.name));
  });

  // (Removed the legacy hand-maintained `expected` tool-name list, #3597 — it had
  // gone stale (missing `run`) and is now strictly superseded by the exact,
  // order-included equality against the real TOOL_MANIFEST in the test above.)

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
    expect(() => {
      registerMcpTools(options);
    }).not.toThrow();

    // #5320: both halves of "gracefully degrade", which not.toThrow() cannot
    // see — registering nothing at all also does not throw. The positive case
    // asserts mockRegisterOrchestrateTool WAS called; this is its complement.
    expect(mockRegisterOrchestrateTool).not.toHaveBeenCalled();
    expect(mockRegisterTools).toHaveBeenCalled();
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
    expect(() => {
      registerMcpTools(options);
    }).not.toThrow();

    expect(mockRegisterOrchestrateTool).not.toHaveBeenCalled();
    expect(mockRegisterTools).toHaveBeenCalled();
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

  it('threads the audit logger to a standardHandler tool, not just run_dev_pipeline (#4991)', () => {
    // #4987 made the MCP PolicyFirewall evaluate rules on EVERY tool, and
    // `secure-handler.ts:261` emits the decision only `if (pResult &&
    // config.auditLogger)`. `buildStandardDeps` withheld the logger from every
    // tool except `run_dev_pipeline`, so a policy denial on any of the 38 tools
    // registered through `standardHandler` could never reach the chain — in
    // enforce mode or in warn. The warn-mode soak #4988 depends on therefore
    // produced no durable evidence at all.
    //
    // memory_query is a plain standardHandler tool: if IT gets the logger, the
    // generic path does.
    const auditLogger = { logPolicyDecision: vi.fn() };
    registerMcpTools(makeDefaultOptions({ auditLogger }));

    expect(mockRegisterMemoryQueryTool).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ auditLogger })
    );
  });

  it('omits the audit logger when the server has none', () => {
    // The pair: threading must stay conditional. An always-present key would
    // put `undefined` on the deps object and defeat the `config.auditLogger`
    // guard's ability to mean "no durable chain configured".
    registerMcpTools(makeDefaultOptions());

    const deps = mockRegisterMemoryQueryTool.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(deps).toBeDefined();
    expect(deps).not.toHaveProperty('auditLogger');
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
    // Module-level state: leaving a firewall wired would leak an enforcing
    // policy into every later test in the process.
    resetGlobalPolicyFirewall();
  });

  /**
   * A firewall stand-in with real mode state: `stagePolicyFirewallForRollout`
   * calls `setMode`, and a `vi.fn()` returning a fixed string would report the
   * configured mode forever no matter what the staging did.
   */
  function stageableFirewall(
    mode: 'enforce' | 'warn'
  ): NonNullable<RegisterMcpToolsOptions['policyFirewall']> {
    let current = mode;
    return {
      getMode: () => current,
      setMode: (next: 'enforce' | 'warn') => {
        current = next;
      },
      getRules: () => [],
      evaluate: () => ({ allowed: true, reason: 'test' }),
      addRule: () => undefined,
      removeRule: () => false,
    };
  }

  it('should log policy firewall info when provided', () => {
    const logger = makeMockLogger();
    const mockFirewall = stageableFirewall('enforce');

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
    // No longer `policyFirewallEnabled: true` + `policyMode: 'enforce'`. The
    // firewall is constructed and then dropped — `buildStandardDeps` does not
    // forward it and no tool registration passes it, so `createPolicyMiddleware`
    // is never reached for any tool. Logging it as enabled and enforcing
    // claimed an enforcement that does not happen, and this assertion pinned
    // that claim as intended behaviour.
    expect((regCall as unknown[])[1]).toEqual(
      expect.objectContaining({ executionMode: 'read-write' })
    );
    expect((regCall as unknown[])[1]).not.toHaveProperty('policyFirewallEnabled');
    expect((regCall as unknown[])[1]).not.toHaveProperty('policyMode');
  });

  it('stages the wired firewall into warn mode rather than the configured enforce', () => {
    // #4888 wired the firewall that had only ever reached a log line. Honouring
    // the configured `enforce` on the release that lands the wiring would turn
    // rules nothing has ever evaluated into denials for every operator, so the
    // rollout starts in warn — and this asserts the staging happened, not just
    // that the firewall was stored.
    const logger = makeMockLogger();
    const mockFirewall = stageableFirewall('enforce');

    registerMcpTools(makeDefaultOptions({ logger, policyFirewall: mockFirewall }));

    expect(getGlobalPolicyFirewall()).toBe(mockFirewall);
    expect(mockFirewall.getMode()).toBe('warn');
  });

  it('does not warn when no policy firewall was constructed', () => {
    // The pair: an unconditional warning would be noise on every start and
    // would stop being read, which is how the original claim survived.
    const logger = makeMockLogger();

    registerMcpTools(makeDefaultOptions({ logger }));

    const warn = logger.warn.mock.calls.find((call: unknown[]) =>
      String(call[0]).includes('PolicyFirewall')
    );
    expect(warn).toBeUndefined();
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

describe('stage failures do not become fabricated outcomes (#5003)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockReturnValues();
    process.env['NEXUS_ALLOW_MOCK_ORCHESTRATION'] = 'true';
  });

  afterEach(() => {
    delete process.env['NEXUS_ALLOW_MOCK_ORCHESTRATION'];
  });

  it('records nothing to the OutcomeStore for a stage.failed event', async () => {
    // The deleted bridge subscribed to `stage.failed` and wrote
    // `{cli: 'claude', category: 'code_generation'}` — an attribution the event
    // does not carry, for stages where no CLI ran at all. `agent-executor` is
    // the single canonical writer now: it knows which CLI ran and skips the
    // record when it does not. This asserts nothing re-subscribes.
    registerMcpTools(makeDefaultOptions());
    const store = getOutcomeStore();
    const before = store.query().length;

    getPipelineEventBus().emit({
      type: 'stage.failed',
      executionId: 'exec-5003',
      stageId: 'security',
      error: 'semgrep not installed',
      model: 'codex-5.3',
      timestamp: Date.now(),
    } as never);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(store.query()).toHaveLength(before);
    expect(store.query().some((o) => o.id.startsWith('fb-fail-'))).toBe(false);
  });
});

// ============================================================================
// registerMcpTools - untrusted-input firewall durable sink (#4992 review)
// ============================================================================

describe('registerMcpTools wires the untrusted-input firewall to the durable audit log (#4992)', () => {
  const PAYLOAD = {
    type: 'issue',
    username: 'drive-by',
    authorAssociation: 'NONE',
    title: 't',
    body: 'b',
  } as const;
  const READ_ONLY = { hasWriteAccess: false, hasSecretAccess: false } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    resetMockReturnValues();
  });

  afterEach(() => {
    configureUntrustedInputFirewall({});
    _setUntrustedInputFirewallForTests(undefined);
  });

  it('with an auditLogger, trust classifications on the live path reach it', () => {
    const log = vi.fn();
    const auditLogger: IAuditLogger = {
      log,
      logToolInvocation: vi.fn(),
      logPolicyDecision: vi.fn(),
      logSecurityEvent: vi.fn(),
      logRateLimitViolation: vi.fn(),
      logTierTransition: vi.fn(),
      flush: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    };
    registerMcpTools(makeDefaultOptions({ auditLogger }));

    const result = runUntrustedInputFirewall(PAYLOAD, { context: READ_ONLY });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.auditSink).toBe('durable');
    const actions = log.mock.calls.map(([input]) => (input as { action?: string }).action);
    expect(actions).toContain('security.trust_classification');
  });

  it('without one (audit disabled), the firewall claims no durable emission', () => {
    registerMcpTools(makeDefaultOptions());

    const result = runUntrustedInputFirewall(PAYLOAD, { context: READ_ONLY });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.auditSink).toBe('none');
  });
});

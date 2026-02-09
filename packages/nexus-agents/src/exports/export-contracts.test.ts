/**
 * Export Contract Tests
 *
 * Validates that all key public symbols are importable from the main barrel.
 * If any of these imports break, it means a re-export is missing from
 * an index.ts or exports/*.ts barrel file.
 *
 * This file acts as a compile-time + runtime contract that prevents
 * the recurring "missing export wiring" bugs (#855, #867, #872, #876).
 *
 * @module exports/export-contracts
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// MCP Tools — registration functions
// ============================================================================
import {
  registerTools,
  registerOrchestrateTool,
  registerCreateExpertTool,
  registerExecuteExpertTool,
  registerRunWorkflowTool,
  registerDelegateToModelTool,
  registerListExpertsTool,
  registerListWorkflowsTool,
  registerConsensusVoteTool,
  registerIssueTriageTool,
  registerRunGraphWorkflowTool,
  registerExecuteSpecTool,
} from '../index.js';

// ============================================================================
// MCP Tool schemas and helpers
// ============================================================================
import {
  OrchestrateInputSchema,
  CreateExpertInputSchema,
  ExecuteExpertInputSchema,
  DelegateInputSchema,
  RunWorkflowInputSchema,
  ListExpertsInputSchema,
  ListWorkflowsInputSchema,
  ConsensusVoteInputSchema,
  IssueTriageInputSchema,
  RunGraphWorkflowInputSchema,
  ExecuteSpecInputSchema,
  MODEL_CAPABILITIES,
  toolSuccess,
  toolError,
} from '../index.js';

// ============================================================================
// Delegate helpers (Issue #872 — TUI consumption)
// ============================================================================
import { analyzeDelegateTask, selectModel } from '../index.js';

// ============================================================================
// Expert helpers
// ============================================================================
import { getAvailableRoles, getCapabilitiesForRole } from '../index.js';

// ============================================================================
// Weather report (Issue #865)
// ============================================================================
import { generateWeatherReport } from '../index.js';

// ============================================================================
// Graph workflows (Issue #831, #841, #866)
// ============================================================================
import {
  GraphBuilder,
  executeGraph,
  START,
  END,
  getGraphWorkflowList,
  getGraphRegistry,
} from '../index.js';

// ============================================================================
// Outcome tracking (Issue #861)
// ============================================================================
import { getOutcomeStore, OutcomeStore } from '../index.js';

// ============================================================================
// Adaptive thresholds — Learning loop (Issue #901)
// ============================================================================
import {
  computeAdaptiveThresholds,
  detectTrend,
  emitThresholdUpdate,
  emitTrendDetected,
} from '../index.js';

// ============================================================================
// Orchestration — spec pipeline (Issue #843)
// ============================================================================
import { parseSpec, decomposeSpec, executeSpec } from '../index.js';
import { createWorkflowRouter } from '../index.js';

// ============================================================================
// Core — Result type, logger, errors
// ============================================================================
import { ok, err, createLogger, VERSION } from '../index.js';

// ============================================================================
// Config — model capabilities
// ============================================================================
import { CompositeRouter } from '../index.js';

// ============================================================================
// Consensus
// ============================================================================
import { ConsensusEngine } from '../index.js';

// ============================================================================
// Model Availability — probes & fallback chains (Issue #869)
// ============================================================================
import {
  AvailabilityCache,
  getAvailabilityCache,
  resetAvailabilityCache,
  resolveFallback,
  getFallbackChain,
  filterAvailableModels,
} from '../index.js';

// ============================================================================
// Pipeline — V2 core types (Issue #909)
// ============================================================================
import {
  TaskContractSchema,
  PlanContractSchema,
  TASK_STATUSES,
  STAGE_TYPES,
  ARTIFACT_TYPES,
  analysisToTaskContract,
  taskContractToToolResponse,
  compilePlan,
  PipelineRunner,
  PluginManifestSchema,
  StageResultSchema,
  PLUGIN_TRUST_LEVELS,
  PluginRegistry,
  PIPELINE_EVENT_TYPES,
  EventBus,
  ArtifactStore,
  PolicyEngine,
  createDefaultPolicyEngine,
  BUILT_IN_RULES,
  createFeedbackSubscriber,
  createDelegatePipeline,
  delegateInputToTaskContract,
  executeDelegatePipeline,
  CORE_PLUGINS,
  registerCorePlugins,
  createCorePluginRegistry,
  createEventBusBridge,
  evaluatePipelinePolicy,
  getPolicyMode,
  orchestrateInputToTaskContract,
  executeOrchestratePipeline,
  resolveV2Config,
} from '../index.js';

describe('Export contracts — MCP tool registration', () => {
  it('exports all tool registration functions', () => {
    expect(typeof registerTools).toBe('function');
    expect(typeof registerOrchestrateTool).toBe('function');
    expect(typeof registerCreateExpertTool).toBe('function');
    expect(typeof registerExecuteExpertTool).toBe('function');
    expect(typeof registerRunWorkflowTool).toBe('function');
    expect(typeof registerDelegateToModelTool).toBe('function');
    expect(typeof registerListExpertsTool).toBe('function');
    expect(typeof registerListWorkflowsTool).toBe('function');
    expect(typeof registerConsensusVoteTool).toBe('function');
    expect(typeof registerIssueTriageTool).toBe('function');
    expect(typeof registerRunGraphWorkflowTool).toBe('function');
    expect(typeof registerExecuteSpecTool).toBe('function');
  });

  it('exports tool input schemas', () => {
    expect(OrchestrateInputSchema).toBeDefined();
    expect(CreateExpertInputSchema).toBeDefined();
    expect(ExecuteExpertInputSchema).toBeDefined();
    expect(DelegateInputSchema).toBeDefined();
    expect(RunWorkflowInputSchema).toBeDefined();
    expect(ListExpertsInputSchema).toBeDefined();
    expect(ListWorkflowsInputSchema).toBeDefined();
    expect(ConsensusVoteInputSchema).toBeDefined();
    expect(IssueTriageInputSchema).toBeDefined();
    expect(RunGraphWorkflowInputSchema).toBeDefined();
    expect(ExecuteSpecInputSchema).toBeDefined();
  });

  it('exports tool result helpers', () => {
    const success = toolSuccess('ok');
    expect(success.content[0]?.text).toBe('ok');
    const error = toolError('bad');
    expect(error.isError).toBe(true);
  });
});

describe('Export contracts — delegate helpers', () => {
  it('exports analyzeDelegateTask', () => {
    expect(typeof analyzeDelegateTask).toBe('function');
    const req = analyzeDelegateTask('write unit tests');
    expect(typeof req.estimatedTokens).toBe('number');
    expect(typeof req.needsReasoning).toBe('boolean');
    expect(typeof req.needsCodeGen).toBe('boolean');
  });

  it('exports selectModel', () => {
    expect(typeof selectModel).toBe('function');
    const req = analyzeDelegateTask('analyze code');
    const result = selectModel({ task: 'analyze code', estimate_tokens: false }, req);
    expect(typeof result.model).toBe('string');
    expect(typeof result.reasoning).toBe('string');
    expect(Array.isArray(result.alternatives)).toBe(true);
  });

  it('exports MODEL_CAPABILITIES', () => {
    expect(typeof MODEL_CAPABILITIES).toBe('object');
    expect(Object.keys(MODEL_CAPABILITIES).length).toBeGreaterThan(0);
  });
});

describe('Export contracts — expert helpers', () => {
  it('exports getAvailableRoles', () => {
    const roles = getAvailableRoles();
    expect(roles.length).toBeGreaterThan(0);
    expect(roles).toContain('code_expert');
  });

  it('exports getCapabilitiesForRole', () => {
    const caps = getCapabilitiesForRole('code_expert');
    expect(caps).toBeDefined();
    expect(Array.isArray(caps)).toBe(true);
  });
});

describe('Export contracts — weather report', () => {
  it('exports generateWeatherReport', () => {
    expect(typeof generateWeatherReport).toBe('function');
    const report = generateWeatherReport({});
    expect(report).toHaveProperty('cliWeather');
    expect(report).toHaveProperty('collectedAt');
  });
});

describe('Export contracts — graph workflows', () => {
  it('exports GraphBuilder', () => {
    expect(typeof GraphBuilder).toBe('function');
  });

  it('exports executeGraph', () => {
    expect(typeof executeGraph).toBe('function');
  });

  it('exports START and END constants', () => {
    expect(typeof START).toBe('string');
    expect(typeof END).toBe('string');
  });

  it('exports workflow list and registry', () => {
    const list = getGraphWorkflowList();
    expect(list.length).toBeGreaterThan(0);
    const registry = getGraphRegistry();
    expect(registry.size).toBeGreaterThan(0);
  });
});

describe('Export contracts — outcome tracking', () => {
  it('exports getOutcomeStore', () => {
    expect(typeof getOutcomeStore).toBe('function');
    const store = getOutcomeStore();
    expect(typeof store.query).toBe('function');
    expect(typeof store.append).toBe('function');
  });

  it('exports OutcomeStore class', () => {
    expect(typeof OutcomeStore).toBe('function');
  });
});

describe('Export contracts — orchestration', () => {
  it('exports spec pipeline functions', () => {
    expect(typeof parseSpec).toBe('function');
    expect(typeof decomposeSpec).toBe('function');
    expect(typeof executeSpec).toBe('function');
  });

  it('exports workflow router', () => {
    expect(typeof createWorkflowRouter).toBe('function');
  });
});

describe('Export contracts — core', () => {
  it('exports Result helpers', () => {
    const success = ok(42);
    expect(success.ok).toBe(true);
    const failure = err(new Error('test'));
    expect(failure.ok).toBe(false);
  });

  it('exports createLogger', () => {
    expect(typeof createLogger).toBe('function');
  });

  it('exports VERSION', () => {
    expect(typeof VERSION).toBe('string');
  });
});

describe('Export contracts — routing', () => {
  it('exports CompositeRouter', () => {
    expect(typeof CompositeRouter).toBe('function');
  });
});

describe('Export contracts — consensus', () => {
  it('exports ConsensusEngine', () => {
    expect(typeof ConsensusEngine).toBe('function');
  });
});

describe('Export contracts — pipeline V2 types', () => {
  it('exports TaskContractSchema', () => {
    expect(TaskContractSchema).toBeDefined();
    expect(typeof TaskContractSchema.safeParse).toBe('function');
  });

  it('exports PlanContractSchema', () => {
    expect(PlanContractSchema).toBeDefined();
    expect(typeof PlanContractSchema.safeParse).toBe('function');
  });

  it('exports V2 constants', () => {
    expect(TASK_STATUSES).toContain('intake');
    expect(TASK_STATUSES).toContain('done');
    expect(STAGE_TYPES).toContain('execute');
    expect(ARTIFACT_TYPES).toContain('code');
  });

  it('exports V1↔V2 adapter functions', () => {
    expect(typeof analysisToTaskContract).toBe('function');
    expect(typeof taskContractToToolResponse).toBe('function');
  });

  it('exports compilePlan function', () => {
    expect(typeof compilePlan).toBe('function');
  });

  it('exports PipelineRunner class', () => {
    expect(typeof PipelineRunner).toBe('function');
    const runner = new PipelineRunner();
    expect(typeof runner.compile).toBe('function');
    expect(typeof runner.execute).toBe('function');
  });

  it('exports plugin type schemas and constants', () => {
    expect(PluginManifestSchema).toBeDefined();
    expect(StageResultSchema).toBeDefined();
    expect(PLUGIN_TRUST_LEVELS).toContain('core');
    expect(PLUGIN_TRUST_LEVELS).toContain('experimental');
  });

  it('exports PluginRegistry class', () => {
    expect(typeof PluginRegistry).toBe('function');
    const registry = new PluginRegistry();
    expect(typeof registry.register).toBe('function');
    expect(typeof registry.resolve).toBe('function');
    expect(typeof registry.freeze).toBe('function');
  });

  it('exports EventBus class and event constants', () => {
    expect(typeof EventBus).toBe('function');
    const bus = new EventBus();
    expect(typeof bus.emit).toBe('function');
    expect(typeof bus.subscribe).toBe('function');
    expect(typeof bus.query).toBe('function');
    expect(PIPELINE_EVENT_TYPES).toContain('task.created');
    expect(PIPELINE_EVENT_TYPES).toContain('stage.completed');
  });

  it('exports ArtifactStore class', () => {
    expect(typeof ArtifactStore).toBe('function');
    const store = new ArtifactStore();
    expect(typeof store.put).toBe('function');
    expect(typeof store.get).toBe('function');
    expect(typeof store.query).toBe('function');
    expect(typeof store.provenance).toBe('function');
  });

  it('exports PolicyEngine and built-in rules', () => {
    expect(typeof PolicyEngine).toBe('function');
    expect(typeof createDefaultPolicyEngine).toBe('function');
    expect(BUILT_IN_RULES).toHaveLength(5);
    const engine = createDefaultPolicyEngine();
    expect(engine.listRules()).toHaveLength(5);
  });

  it('exports createFeedbackSubscriber', () => {
    expect(typeof createFeedbackSubscriber).toBe('function');
  });

  it('exports createDelegatePipeline', () => {
    expect(typeof createDelegatePipeline).toBe('function');
  });

  it('exports delegateInputToTaskContract (Issue #920)', () => {
    expect(typeof delegateInputToTaskContract).toBe('function');
  });

  it('exports executeDelegatePipeline (Issue #920)', () => {
    expect(typeof executeDelegatePipeline).toBe('function');
  });

  it('exports CORE_PLUGINS (Issue #921)', () => {
    expect(Array.isArray(CORE_PLUGINS)).toBe(true);
    expect(CORE_PLUGINS.length).toBe(3);
  });

  it('exports registerCorePlugins (Issue #921)', () => {
    expect(typeof registerCorePlugins).toBe('function');
  });

  it('exports createCorePluginRegistry (Issue #921)', () => {
    expect(typeof createCorePluginRegistry).toBe('function');
  });

  it('exports createEventBusBridge (Issue #922)', () => {
    expect(typeof createEventBusBridge).toBe('function');
  });

  it('exports evaluatePipelinePolicy (Issue #923)', () => {
    expect(typeof evaluatePipelinePolicy).toBe('function');
  });

  it('exports getPolicyMode (Issue #923)', () => {
    expect(typeof getPolicyMode).toBe('function');
  });

  it('exports orchestrateInputToTaskContract (Issue #924)', () => {
    expect(typeof orchestrateInputToTaskContract).toBe('function');
  });

  it('exports executeOrchestratePipeline (Issue #924)', () => {
    expect(typeof executeOrchestratePipeline).toBe('function');
  });

  it('exports resolveV2Config (Issue #925)', () => {
    expect(typeof resolveV2Config).toBe('function');
  });
});

describe('Export contracts — adaptive thresholds (Issue #901)', () => {
  it('exports computeAdaptiveThresholds and detectTrend', () => {
    expect(typeof computeAdaptiveThresholds).toBe('function');
    expect(typeof detectTrend).toBe('function');
  });

  it('exports learning event emitters', () => {
    expect(typeof emitThresholdUpdate).toBe('function');
    expect(typeof emitTrendDetected).toBe('function');
  });
});

describe('Export contracts — model availability', () => {
  it('exports AvailabilityCache class', () => {
    expect(typeof AvailabilityCache).toBe('function');
  });

  it('exports singleton accessors', () => {
    expect(typeof getAvailabilityCache).toBe('function');
    expect(typeof resetAvailabilityCache).toBe('function');
  });

  it('exports fallback chain functions', () => {
    expect(typeof resolveFallback).toBe('function');
    expect(typeof getFallbackChain).toBe('function');
    expect(typeof filterAvailableModels).toBe('function');
  });
});

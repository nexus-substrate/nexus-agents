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

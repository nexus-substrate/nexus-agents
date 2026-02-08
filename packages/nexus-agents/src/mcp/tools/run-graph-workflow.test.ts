/**
 * Tests for run_graph_workflow MCP tool.
 *
 * (Source: Issue #840 — Expose graph workflows via MCP tool)
 */

import { describe, it, expect } from 'vitest';
import {
  RunGraphWorkflowInputSchema,
  registerRunGraphWorkflowTool,
  type RunGraphWorkflowResponse,
} from './run-graph-workflow.js';
import { RateLimiter } from '../middleware/index.js';

// ============================================================================
// Test Helpers
// ============================================================================

type ToolResponse = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
type ToolHandler = (args: unknown) => Promise<ToolResponse>;

interface MockRegisteredTool {
  name: string;
  handler: ToolHandler;
}

function createTestRateLimiter(): RateLimiter {
  return new RateLimiter({ capacity: 1000, refillRate: 1000, refillIntervalMs: 1000 });
}

function createMockServer(): {
  tools: MockRegisteredTool[];
  registerTool: (name: string, config: unknown, handler: ToolHandler) => void;
} {
  const tools: MockRegisteredTool[] = [];
  return {
    tools,
    registerTool(name: string, _config: unknown, handler: ToolHandler): void {
      tools.push({ name, handler });
    },
  };
}

function registerAndGetHandler(): ToolHandler {
  const server = createMockServer();
  registerRunGraphWorkflowTool(server as never, {
    rateLimiter: createTestRateLimiter(),
  });
  const tool = server.tools.find((t) => t.name === 'run_graph_workflow');
  if (!tool) throw new Error('Tool not registered');
  return tool.handler;
}

function parseResponse(response: ToolResponse): RunGraphWorkflowResponse {
  return JSON.parse(response.content[0]?.text ?? '{}') as RunGraphWorkflowResponse;
}

// ============================================================================
// Schema Validation
// ============================================================================

describe('RunGraphWorkflowInputSchema', () => {
  it('validates basic workflow input', () => {
    const result = RunGraphWorkflowInputSchema.safeParse({
      workflow: 'echo',
      inputs: { input: 'hello' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.workflow).toBe('echo');
      expect(result.data.enableCheckpointing).toBe(true);
      expect(result.data.enableAuditTrail).toBe(false);
    }
  });

  it('applies defaults for optional fields', () => {
    const result = RunGraphWorkflowInputSchema.safeParse({ workflow: 'pipeline' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.inputs).toEqual({});
      expect(result.data.enableCheckpointing).toBe(true);
      expect(result.data.enableAuditTrail).toBe(false);
    }
  });

  it('rejects empty workflow name', () => {
    const result = RunGraphWorkflowInputSchema.safeParse({ workflow: '' });
    expect(result.success).toBe(false);
  });

  it('rejects workflow name exceeding max length', () => {
    const result = RunGraphWorkflowInputSchema.safeParse({ workflow: 'x'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('accepts custom checkpointing and audit trail flags', () => {
    const result = RunGraphWorkflowInputSchema.safeParse({
      workflow: 'echo',
      enableCheckpointing: false,
      enableAuditTrail: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enableCheckpointing).toBe(false);
      expect(result.data.enableAuditTrail).toBe(true);
    }
  });

  it('rejects missing workflow field', () => {
    const result = RunGraphWorkflowInputSchema.safeParse({ inputs: {} });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Tool Registration
// ============================================================================

describe('registerRunGraphWorkflowTool', () => {
  it('registers the tool on the server', () => {
    const server = createMockServer();
    registerRunGraphWorkflowTool(server as never, {
      rateLimiter: createTestRateLimiter(),
    });
    expect(server.tools).toHaveLength(1);
    expect(server.tools[0]?.name).toBe('run_graph_workflow');
  });
});

// ============================================================================
// List Action (Discoverability)
// ============================================================================

describe('list action', () => {
  it('returns available workflows when workflow is "list"', async () => {
    const handler = registerAndGetHandler();
    const response = await handler({ workflow: 'list' });

    expect(response.isError).toBeUndefined();
    const workflows = JSON.parse(response.content[0]?.text ?? '[]') as Array<{
      name: string;
      description: string;
    }>;
    expect(workflows.length).toBe(7);
    expect(workflows.map((w) => w.name)).toEqual([
      'echo',
      'pipeline',
      'code-review',
      'security-scan',
      'security-audit',
      'test-generation',
      'documentation',
    ]);
  });

  it('includes descriptions and metadata', async () => {
    const handler = registerAndGetHandler();
    const response = await handler({ workflow: 'list' });

    const workflows = JSON.parse(response.content[0]?.text ?? '[]') as Array<{
      name: string;
      description: string;
      inputFields: string[];
      nodeCount: number;
      hasConditionalEdges: boolean;
    }>;
    for (const wf of workflows) {
      expect(wf.description.length).toBeGreaterThan(0);
      expect(wf.inputFields.length).toBeGreaterThan(0);
      expect(wf.nodeCount).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// Echo Workflow (Happy Path)
// ============================================================================

describe('echo workflow', () => {
  it('executes echo workflow and returns output', async () => {
    const handler = registerAndGetHandler();
    const response = await handler({ workflow: 'echo', inputs: { input: 'hello world' } });

    expect(response.isError).toBeUndefined();
    const result = parseResponse(response);
    expect(result.status).toBe('completed');
    expect(result.workflow).toBe('echo');
    expect(result.finalState['output']).toBe('echo: hello world');
    expect(result.stepsExecuted).toBeGreaterThan(0);
    expect(result.nodesExecuted).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('collects events during execution', async () => {
    const handler = registerAndGetHandler();
    const response = await handler({ workflow: 'echo', inputs: { input: 'test' } });

    const result = parseResponse(response);
    expect(result.events.length).toBeGreaterThan(0);

    const nodeStarted = result.events.find((e) => e.type === 'node_started');
    expect(nodeStarted).toBeDefined();
    expect(nodeStarted?.nodeId).toBe('echo');

    const nodeCompleted = result.events.find((e) => e.type === 'node_completed');
    expect(nodeCompleted).toBeDefined();
    expect(nodeCompleted?.nodeId).toBe('echo');

    const execComplete = result.events.find((e) => e.type === 'execution_complete');
    expect(execComplete).toBeDefined();
  });

  it('creates checkpoints by default', async () => {
    const handler = registerAndGetHandler();
    const response = await handler({ workflow: 'echo', inputs: { input: 'test' } });

    const result = parseResponse(response);
    expect(result.checkpointCount).toBeGreaterThan(0);
  });

  it('skips checkpointing when disabled', async () => {
    const handler = registerAndGetHandler();
    const response = await handler({
      workflow: 'echo',
      inputs: { input: 'test' },
      enableCheckpointing: false,
    });

    const result = parseResponse(response);
    expect(result.checkpointCount).toBe(0);
  });
});

// ============================================================================
// Pipeline Workflow (Multi-Node)
// ============================================================================

describe('pipeline workflow', () => {
  it('executes pipeline with validate and process nodes', async () => {
    const handler = registerAndGetHandler();
    const response = await handler({ workflow: 'pipeline', inputs: { input: 'data' } });

    const result = parseResponse(response);
    expect(result.status).toBe('completed');
    expect(result.workflow).toBe('pipeline');
    expect(result.nodesExecuted).toBe(2);
    expect(result.finalState['output']).toBe('done: data');
  });

  it('accumulates steps in append reducer', async () => {
    const handler = registerAndGetHandler();
    const response = await handler({ workflow: 'pipeline', inputs: { input: 'my-data' } });

    const result = parseResponse(response);
    const steps = result.finalState['steps'] as string[];
    expect(steps).toHaveLength(2);
    expect(steps[0]).toContain('validated');
    expect(steps[1]).toContain('processed');
  });

  it('produces multiple step events for multi-step execution', async () => {
    const handler = registerAndGetHandler();
    const response = await handler({ workflow: 'pipeline', inputs: { input: 'x' } });

    const result = parseResponse(response);
    const stepEvents = result.events.filter((e) => e.type === 'step_completed');
    expect(stepEvents.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// Error Paths
// ============================================================================

describe('error handling', () => {
  it('returns error for unknown workflow', async () => {
    const handler = registerAndGetHandler();
    const response = await handler({ workflow: 'nonexistent' });

    const result = parseResponse(response);
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Unknown workflow');
    expect(result.error).toContain('nonexistent');
    expect(result.error).toContain('echo');
    expect(result.error).toContain('pipeline');
    expect(result.error).toContain('code-review');
    expect(result.error).toContain('security-scan');
  });

  it('returns validation error for invalid input', async () => {
    const handler = registerAndGetHandler();
    const response = await handler({ workflow: '' });

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain('Validation error');
  });

  it('returns validation error for missing workflow', async () => {
    const handler = registerAndGetHandler();
    const response = await handler({});

    expect(response.isError).toBe(true);
    expect(response.content[0]?.text).toContain('Validation error');
  });

  it('returns failed status with error details in response', async () => {
    const handler = registerAndGetHandler();
    const response = await handler({ workflow: 'nonexistent' });

    const result = parseResponse(response);
    expect(result.workflow).toBe('nonexistent');
    expect(result.stepsExecuted).toBe(0);
    expect(result.nodesExecuted).toBe(0);
    expect(result.checkpointCount).toBe(0);
    expect(result.events).toEqual([]);
  });
});

// ============================================================================
// Audit Trail Integration
// ============================================================================

describe('audit trail', () => {
  it('records events when audit trail enabled', async () => {
    const handler = registerAndGetHandler();
    const response = await handler({
      workflow: 'echo',
      inputs: { input: 'audit-test' },
      enableAuditTrail: true,
    });

    const result = parseResponse(response);
    expect(result.status).toBe('completed');
    // Audit trail doesn't change the response shape but the bridge is called
    // We verify events are still collected (bridge doesn't interfere)
    expect(result.events.length).toBeGreaterThan(0);
  });

  it('works without audit trail (default)', async () => {
    const handler = registerAndGetHandler();
    const response = await handler({ workflow: 'echo', inputs: { input: 'no-audit' } });

    const result = parseResponse(response);
    expect(result.status).toBe('completed');
    expect(result.events.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Event Summary Format
// ============================================================================

describe('event summary format', () => {
  it('includes nodeId for node events', async () => {
    const handler = registerAndGetHandler();
    const response = await handler({ workflow: 'echo', inputs: { input: 'fmt' } });

    const result = parseResponse(response);
    const nodeEvents = result.events.filter((e) => e.nodeId !== undefined);
    expect(nodeEvents.length).toBeGreaterThan(0);
    for (const event of nodeEvents) {
      expect(event.nodeId).toBe('echo');
    }
  });

  it('includes detail strings for all events', async () => {
    const handler = registerAndGetHandler();
    const response = await handler({ workflow: 'echo', inputs: { input: 'detail' } });

    const result = parseResponse(response);
    for (const event of result.events) {
      expect(event.detail).toBeDefined();
      expect(typeof event.detail).toBe('string');
      expect(event.detail?.length).toBeGreaterThan(0);
    }
  });

  it('omits nodeId for execution-level events', async () => {
    const handler = registerAndGetHandler();
    const response = await handler({ workflow: 'echo', inputs: { input: 'x' } });

    const result = parseResponse(response);
    const execComplete = result.events.find((e) => e.type === 'execution_complete');
    expect(execComplete?.nodeId).toBeUndefined();
  });
});

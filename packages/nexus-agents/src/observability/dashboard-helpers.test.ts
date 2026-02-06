/**
 * Tests for Dashboard Helpers
 * @module observability/dashboard-helpers.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentEvent, InteractionGraph, InteractionEdge } from './swarm-observer-types.js';
import type { EventPayload } from './swarm-observer-payloads.js';
import {
  extractState,
  summarizeStateChange,
  summarizeMessage,
  summarizeTool,
  summarizeMemory,
  summarizeTask,
  summarizeError,
  summarizeEvent,
  getEventSeverity,
  buildTopEdges,
  buildGraphSummary,
  getActiveTracesFromGraph,
} from './dashboard-helpers.js';

vi.mock('../core/index.js', () => ({
  getTimeProvider: vi.fn(() => ({
    now: (): number => 1700000000000,
    toISOString: (): string => '2023-11-14T22:13:20.000Z',
  })),
}));

// ============================================================================
// Test Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeEvent(payload: EventPayload, eventType?: string) {
  return {
    eventId: 'evt-1',
    agentId: 'agent-1',
    eventType: eventType ?? payload.type,
    timestamp: new Date().toISOString(),
    traceId: 'trace-1',
    spanId: 'span-1',
    payload,
  } as unknown as AgentEvent;
}

function makeEdge(overrides: Partial<InteractionEdge> = {}): InteractionEdge {
  return {
    from: 'agent-a',
    to: 'agent-b',
    interactionType: 'message',
    timestamp: new Date(1700000000000 - 5000).toISOString(),
    outcome: 'success' as const,
    traceId: 'trace-1',
    weight: 1,
    ...overrides,
  };
}

function makeMockGraph(
  nodes: string[] = [],
  edges: InteractionEdge[] = [],
  centrality?: Map<string, number>,
  sccs?: string[][]
): InteractionGraph {
  return {
    addNode: vi.fn(),
    addEdge: vi.fn(),
    getNodes: vi.fn(() => nodes),
    getEdges: vi.fn(() => edges),
    getOutgoingEdges: vi.fn(() => []),
    getIncomingEdges: vi.fn(() => []),
    getDegreeCentrality: vi.fn(() => centrality ?? new Map(nodes.map((n) => [n, 0]))),
    getStronglyConnectedComponents: vi.fn(() => sccs ?? [nodes]),
    getEdgeCount: vi.fn(() => 0),
    clear: vi.fn(),
  };
}

// ============================================================================
// extractState
// ============================================================================

describe('extractState', () => {
  it('extracts state from state_change event', () => {
    const event = makeEvent({
      type: 'state_change',
      previousState: 'idle',
      newState: 'executing',
    });
    expect(extractState(event)).toBe('executing');
  });

  it('returns idle for non-state_change events', () => {
    const event = makeEvent({
      type: 'error',
      errorMessage: 'fail',
      errorCode: 'ERR',
      recoverable: true,
    });
    expect(extractState(event)).toBe('idle');
  });

  it('extracts error state', () => {
    const event = makeEvent({
      type: 'state_change',
      previousState: 'executing',
      newState: 'error',
    });
    expect(extractState(event)).toBe('error');
  });

  it('extracts waiting state', () => {
    const event = makeEvent({
      type: 'state_change',
      previousState: 'thinking',
      newState: 'waiting',
    });
    expect(extractState(event)).toBe('waiting');
  });

  it('extracts thinking state', () => {
    const event = makeEvent({
      type: 'state_change',
      previousState: 'idle',
      newState: 'thinking',
    });
    expect(extractState(event)).toBe('thinking');
  });

  it('returns idle for message payload', () => {
    const event = makeEvent({
      type: 'message',
      direction: 'sent',
      messageType: 'request',
    });
    expect(extractState(event)).toBe('idle');
  });

  it('returns idle for tool payload', () => {
    const event = makeEvent({
      type: 'tool',
      phase: 'invoked',
      toolName: 'search',
    });
    expect(extractState(event)).toBe('idle');
  });

  it('returns idle for task payload', () => {
    const event = makeEvent({
      type: 'task',
      phase: 'started',
      taskId: 't-1',
    });
    expect(extractState(event)).toBe('idle');
  });

  it('returns idle for memory payload', () => {
    const event = makeEvent({
      type: 'memory',
      operation: 'read',
      memoryType: 'session',
    });
    expect(extractState(event)).toBe('idle');
  });
});

// ============================================================================
// summarizeStateChange
// ============================================================================

describe('summarizeStateChange', () => {
  it('formats state transition', () => {
    const event = makeEvent({
      type: 'state_change',
      previousState: 'idle',
      newState: 'executing',
    });
    expect(summarizeStateChange(event)).toBe('idle \u2192 executing');
  });

  it('returns empty for non-state_change', () => {
    const event = makeEvent({
      type: 'error',
      errorMessage: 'fail',
      errorCode: 'ERR',
      recoverable: false,
    });
    expect(summarizeStateChange(event)).toBe('');
  });

  it('formats error transition', () => {
    const event = makeEvent({
      type: 'state_change',
      previousState: 'executing',
      newState: 'error',
    });
    expect(summarizeStateChange(event)).toBe('executing \u2192 error');
  });

  it('returns empty for tool event', () => {
    const event = makeEvent({
      type: 'tool',
      phase: 'invoked',
      toolName: 'test',
    });
    expect(summarizeStateChange(event)).toBe('');
  });

  it('returns empty for message event', () => {
    const event = makeEvent({
      type: 'message',
      direction: 'sent',
      messageType: 'cmd',
    });
    expect(summarizeStateChange(event)).toBe('');
  });
});

// ============================================================================
// summarizeMessage
// ============================================================================

describe('summarizeMessage', () => {
  it('summarizes sent message', () => {
    const event = makeEvent({
      type: 'message',
      direction: 'sent',
      messageType: 'request',
      targetAgentId: 'agent-2',
    });
    expect(summarizeMessage(event)).toBe('sent request to agent-2');
  });

  it('summarizes received message', () => {
    const event = makeEvent({
      type: 'message',
      direction: 'received',
      messageType: 'response',
      sourceAgentId: 'agent-3',
    });
    expect(summarizeMessage(event)).toBe('recv response from agent-3');
  });

  it('returns empty for non-message', () => {
    const event = makeEvent({
      type: 'error',
      errorMessage: 'x',
      errorCode: 'ERR',
      recoverable: true,
    });
    expect(summarizeMessage(event)).toBe('');
  });

  it('uses unknown for sent without targetAgentId', () => {
    const event = makeEvent({
      type: 'message',
      direction: 'sent',
      messageType: 'broadcast',
    });
    expect(summarizeMessage(event)).toBe('sent broadcast to unknown');
  });

  it('uses unknown for received without sourceAgentId', () => {
    const event = makeEvent({
      type: 'message',
      direction: 'received',
      messageType: 'notification',
    });
    expect(summarizeMessage(event)).toBe('recv notification from unknown');
  });
});

// ============================================================================
// summarizeTool
// ============================================================================

describe('summarizeTool', () => {
  it('summarizes tool invocation', () => {
    const event = makeEvent({
      type: 'tool',
      phase: 'invoked',
      toolName: 'search',
    });
    expect(summarizeTool(event)).toBe('invoking search');
  });

  it('summarizes tool success', () => {
    const event = makeEvent({
      type: 'tool',
      phase: 'completed',
      toolName: 'search',
      success: true,
    });
    expect(summarizeTool(event)).toBe('search succeeded');
  });

  it('summarizes tool failure', () => {
    const event = makeEvent({
      type: 'tool',
      phase: 'completed',
      toolName: 'search',
      success: false,
    });
    expect(summarizeTool(event)).toBe('search failed');
  });

  it('returns empty for non-tool event', () => {
    const event = makeEvent({
      type: 'memory',
      operation: 'read',
      memoryType: 'session',
    });
    expect(summarizeTool(event)).toBe('');
  });

  it('treats undefined success as failed on completed', () => {
    const event = makeEvent({
      type: 'tool',
      phase: 'completed',
      toolName: 'deploy',
    });
    expect(summarizeTool(event)).toBe('deploy failed');
  });
});

// ============================================================================
// summarizeMemory
// ============================================================================

describe('summarizeMemory', () => {
  it('summarizes memory write', () => {
    const event = makeEvent({
      type: 'memory',
      operation: 'write',
      memoryType: 'belief',
    });
    expect(summarizeMemory(event)).toBe('write belief');
  });

  it('summarizes memory read', () => {
    const event = makeEvent({
      type: 'memory',
      operation: 'read',
      memoryType: 'session',
    });
    expect(summarizeMemory(event)).toBe('read session');
  });

  it('returns empty for non-memory', () => {
    const event = makeEvent({
      type: 'error',
      errorMessage: 'x',
      errorCode: 'ERR',
      recoverable: false,
    });
    expect(summarizeMemory(event)).toBe('');
  });

  it('returns empty for task event', () => {
    const event = makeEvent({
      type: 'task',
      phase: 'started',
      taskId: 'task-1',
    });
    expect(summarizeMemory(event)).toBe('');
  });
});

// ============================================================================
// summarizeTask
// ============================================================================

describe('summarizeTask', () => {
  it('summarizes task start with description', () => {
    const event = makeEvent({
      type: 'task',
      phase: 'started',
      taskId: 't-1',
      taskDescription: 'analyze code',
    });
    expect(summarizeTask(event)).toBe('started: analyze code');
  });

  it('summarizes task start with id when no description', () => {
    const event = makeEvent({
      type: 'task',
      phase: 'started',
      taskId: 't-1',
    });
    expect(summarizeTask(event)).toBe('started: t-1');
  });

  it('summarizes completed task', () => {
    const event = makeEvent({
      type: 'task',
      phase: 'completed',
      taskId: 't-1',
      success: true,
    });
    expect(summarizeTask(event)).toBe('completed: t-1');
  });

  it('summarizes failed task', () => {
    const event = makeEvent({
      type: 'task',
      phase: 'completed',
      taskId: 't-1',
      success: false,
    });
    expect(summarizeTask(event)).toBe('failed: t-1');
  });

  it('returns empty for non-task event', () => {
    const event = makeEvent({
      type: 'tool',
      phase: 'invoked',
      toolName: 'x',
    });
    expect(summarizeTask(event)).toBe('');
  });

  it('treats undefined success as failed on completed', () => {
    const event = makeEvent({
      type: 'task',
      phase: 'completed',
      taskId: 't-2',
    });
    expect(summarizeTask(event)).toBe('failed: t-2');
  });
});

// ============================================================================
// summarizeError
// ============================================================================

describe('summarizeError', () => {
  it('truncates long error messages', () => {
    const event = makeEvent({
      type: 'error',
      errorMessage: 'A very long error message that exceeds thirty characters',
      errorCode: 'ERR',
      recoverable: true,
    });
    const result = summarizeError(event);
    expect(result).toContain('error:');
    expect(result.length).toBeLessThanOrEqual(37);
  });

  it('returns empty for non-error', () => {
    const event = makeEvent({
      type: 'memory',
      operation: 'write',
      memoryType: 'belief',
    });
    expect(summarizeError(event)).toBe('');
  });

  it('handles short error message without truncation', () => {
    const event = makeEvent({
      type: 'error',
      errorMessage: 'timeout',
      errorCode: 'TIMEOUT',
      recoverable: false,
    });
    expect(summarizeError(event)).toBe('error: timeout');
  });

  it('handles exactly 30-char error message', () => {
    const msg = 'a'.repeat(30);
    const event = makeEvent({
      type: 'error',
      errorMessage: msg,
      errorCode: 'ERR',
      recoverable: true,
    });
    expect(summarizeError(event)).toBe(`error: ${msg}`);
  });

  it('handles empty error message', () => {
    const event = makeEvent({
      type: 'error',
      errorMessage: '',
      errorCode: 'EMPTY',
      recoverable: true,
    });
    expect(summarizeError(event)).toBe('error: ');
  });
});

// ============================================================================
// summarizeEvent
// ============================================================================

describe('summarizeEvent', () => {
  it('delegates to state_change handler', () => {
    const event = makeEvent({
      type: 'state_change',
      previousState: 'idle',
      newState: 'executing',
    });
    expect(summarizeEvent(event)).toContain('\u2192');
  });

  it('delegates to message handler', () => {
    const event = makeEvent({
      type: 'message',
      direction: 'sent',
      messageType: 'request',
      targetAgentId: 'agent-2',
    });
    expect(summarizeEvent(event)).toBe('sent request to agent-2');
  });

  it('delegates to tool handler', () => {
    const event = makeEvent({
      type: 'tool',
      phase: 'invoked',
      toolName: 'search',
    });
    expect(summarizeEvent(event)).toBe('invoking search');
  });

  it('delegates to memory handler', () => {
    const event = makeEvent({
      type: 'memory',
      operation: 'write',
      memoryType: 'belief',
    });
    expect(summarizeEvent(event)).toBe('write belief');
  });

  it('delegates to task handler', () => {
    const event = makeEvent({
      type: 'task',
      phase: 'started',
      taskId: 't-1',
      taskDescription: 'test',
    });
    expect(summarizeEvent(event)).toBe('started: test');
  });

  it('delegates to error handler', () => {
    const event = makeEvent({
      type: 'error',
      errorMessage: 'boom',
      errorCode: 'ERR',
      recoverable: false,
    });
    expect(summarizeEvent(event)).toBe('error: boom');
  });

  it('returns eventType for unknown payload type', () => {
    const event = makeEvent({ type: 'unknown_type' } as unknown as EventPayload, 'custom');
    expect(summarizeEvent(event)).toBe('custom');
  });
});

// ============================================================================
// getEventSeverity
// ============================================================================

describe('getEventSeverity', () => {
  it('returns error for error eventType', () => {
    const event = makeEvent(
      {
        type: 'error',
        errorMessage: 'fail',
        errorCode: 'ERR',
        recoverable: true,
      },
      'error'
    );
    expect(getEventSeverity(event)).toBe('error');
  });

  it('returns warning for failed tool', () => {
    const event = makeEvent(
      {
        type: 'tool',
        phase: 'completed',
        toolName: 'x',
        success: false,
      },
      'tool'
    );
    expect(getEventSeverity(event)).toBe('warning');
  });

  it('returns warning for failed task', () => {
    const event = makeEvent(
      {
        type: 'task',
        phase: 'completed',
        taskId: 't',
        success: false,
      },
      'task'
    );
    expect(getEventSeverity(event)).toBe('warning');
  });

  it('returns error for state_change to error state', () => {
    const event = makeEvent(
      {
        type: 'state_change',
        previousState: 'executing',
        newState: 'error',
      },
      'state_change'
    );
    expect(getEventSeverity(event)).toBe('error');
  });

  it('returns info for normal events', () => {
    const event = makeEvent({ type: 'memory', operation: 'write', memoryType: 'belief' }, 'memory');
    expect(getEventSeverity(event)).toBe('info');
  });

  it('returns info for successful tool', () => {
    const event = makeEvent(
      {
        type: 'tool',
        phase: 'completed',
        toolName: 'x',
        success: true,
      },
      'tool'
    );
    expect(getEventSeverity(event)).toBe('info');
  });

  it('returns info for successful task', () => {
    const event = makeEvent(
      {
        type: 'task',
        phase: 'completed',
        taskId: 't',
        success: true,
      },
      'task'
    );
    expect(getEventSeverity(event)).toBe('info');
  });

  it('returns info for state_change to non-error state', () => {
    const event = makeEvent(
      {
        type: 'state_change',
        previousState: 'idle',
        newState: 'executing',
      },
      'state_change'
    );
    expect(getEventSeverity(event)).toBe('info');
  });

  it('returns info for tool invoked (not completed)', () => {
    const event = makeEvent(
      {
        type: 'tool',
        phase: 'invoked',
        toolName: 'x',
      },
      'tool'
    );
    expect(getEventSeverity(event)).toBe('info');
  });

  it('returns info for sent message', () => {
    const event = makeEvent(
      {
        type: 'message',
        direction: 'sent',
        messageType: 'request',
      },
      'message'
    );
    expect(getEventSeverity(event)).toBe('info');
  });

  it('error eventType takes precedence over payload checks', () => {
    // An event with eventType='error' but a non-error payload
    const event = makeEvent(
      {
        type: 'tool',
        phase: 'completed',
        toolName: 'x',
        success: true,
      },
      'error'
    );
    expect(getEventSeverity(event)).toBe('error');
  });
});

// ============================================================================
// buildTopEdges
// ============================================================================

describe('buildTopEdges', () => {
  it('returns empty array for graph with no edges', () => {
    const graph = makeMockGraph(['agent-a'], []);
    const result = buildTopEdges(graph);
    expect(result).toEqual([]);
  });

  it('aggregates edges between same agent pair', () => {
    const edges = [
      makeEdge({ from: 'a', to: 'b', outcome: 'success', durationMs: 100 }),
      makeEdge({ from: 'a', to: 'b', outcome: 'success', durationMs: 200 }),
      makeEdge({ from: 'a', to: 'b', outcome: 'failure', durationMs: 300 }),
    ];
    const graph = makeMockGraph(['a', 'b'], edges);
    const result = buildTopEdges(graph);

    expect(result).toHaveLength(1);
    expect(result[0].from).toBe('a');
    expect(result[0].to).toBe('b');
    expect(result[0].count).toBe(3);
    expect(result[0].successRate).toBeCloseTo(2 / 3);
    expect(result[0].avgLatencyMs).toBe(200);
  });

  it('sorts edges by count descending', () => {
    const edges = [
      makeEdge({ from: 'a', to: 'b' }),
      makeEdge({ from: 'c', to: 'd' }),
      makeEdge({ from: 'c', to: 'd' }),
      makeEdge({ from: 'c', to: 'd' }),
    ];
    const graph = makeMockGraph(['a', 'b', 'c', 'd'], edges);
    const result = buildTopEdges(graph);

    expect(result[0].from).toBe('c');
    expect(result[0].count).toBe(3);
    expect(result[1].from).toBe('a');
    expect(result[1].count).toBe(1);
  });

  it('limits to 10 edges', () => {
    const edges: InteractionEdge[] = [];
    for (let i = 0; i < 15; i++) {
      edges.push(makeEdge({ from: `a${String(i)}`, to: `b${String(i)}` }));
    }
    const graph = makeMockGraph([], edges);
    const result = buildTopEdges(graph);
    expect(result).toHaveLength(10);
  });

  it('handles edges without durationMs', () => {
    const edges = [
      makeEdge({
        from: 'a',
        to: 'b',
        outcome: 'success',
        durationMs: undefined,
      }),
    ];
    const graph = makeMockGraph(['a', 'b'], edges);
    const result = buildTopEdges(graph);

    expect(result[0].avgLatencyMs).toBe(0);
  });

  it('calculates zero successRate when no successes', () => {
    const edges = [
      makeEdge({ from: 'a', to: 'b', outcome: 'failure' }),
      makeEdge({ from: 'a', to: 'b', outcome: 'timeout' }),
    ];
    const graph = makeMockGraph(['a', 'b'], edges);
    const result = buildTopEdges(graph);

    expect(result[0].successRate).toBe(0);
  });

  it('treats different direction pairs as separate edges', () => {
    const edges = [makeEdge({ from: 'a', to: 'b' }), makeEdge({ from: 'b', to: 'a' })];
    const graph = makeMockGraph(['a', 'b'], edges);
    const result = buildTopEdges(graph);
    expect(result).toHaveLength(2);
  });

  it('handles single edge correctly', () => {
    const edges = [
      makeEdge({
        from: 'x',
        to: 'y',
        outcome: 'success',
        durationMs: 42,
      }),
    ];
    const graph = makeMockGraph(['x', 'y'], edges);
    const result = buildTopEdges(graph);

    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(1);
    expect(result[0].successRate).toBe(1);
    expect(result[0].avgLatencyMs).toBe(42);
  });

  it('returns edges with from/to as empty string when key split produces undefined', () => {
    // This tests the fallback to '' in the split logic
    const edges = [makeEdge({ from: 'only', to: '' })];
    const graph = makeMockGraph(['only'], edges);
    const result = buildTopEdges(graph);

    // The key would be "only|", split by | gives ["only", ""]
    expect(result).toHaveLength(1);
    expect(result[0].from).toBe('only');
    expect(result[0].to).toBe('');
  });
});

// ============================================================================
// buildGraphSummary
// ============================================================================

describe('buildGraphSummary', () => {
  it('returns zero values for empty graph', () => {
    const graph = makeMockGraph([], [], new Map(), []);
    const result = buildGraphSummary(graph);

    expect(result.nodeCount).toBe(0);
    expect(result.edgeCount).toBe(0);
    expect(result.density).toBe(0);
    expect(result.stronglyConnectedComponents).toBe(0);
    expect(result.topEdges).toEqual([]);
    expect(result.centralAgents).toEqual([]);
  });

  it('calculates density correctly for 2-node graph', () => {
    const edges = [makeEdge({ from: 'a', to: 'b' })];
    const graph = makeMockGraph(['a', 'b'], edges);
    const result = buildGraphSummary(graph);

    // possibleEdges = 2 * 1 = 2, density = 1 / 2 = 0.5
    expect(result.nodeCount).toBe(2);
    expect(result.edgeCount).toBe(1);
    expect(result.density).toBeCloseTo(0.5);
  });

  it('calculates density for fully connected graph', () => {
    const edges = [makeEdge({ from: 'a', to: 'b' }), makeEdge({ from: 'b', to: 'a' })];
    const graph = makeMockGraph(['a', 'b'], edges);
    const result = buildGraphSummary(graph);

    // possibleEdges = 2, edgeCount = 2 => density = 1
    expect(result.density).toBeCloseTo(1.0);
  });

  it('handles single node (density = 0)', () => {
    const graph = makeMockGraph(['a'], []);
    const result = buildGraphSummary(graph);

    // possibleEdges = 1 * 0 = 0, density guard returns 0
    expect(result.density).toBe(0);
  });

  it('returns SCC count from graph', () => {
    const sccs = [['a', 'b'], ['c']];
    const graph = makeMockGraph(['a', 'b', 'c'], [], new Map(), sccs);
    const result = buildGraphSummary(graph);

    expect(result.stronglyConnectedComponents).toBe(2);
  });

  it('limits central agents to top 5', () => {
    const nodes = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const centrality = new Map<string, number>([
      ['a', 0.9],
      ['b', 0.8],
      ['c', 0.7],
      ['d', 0.6],
      ['e', 0.5],
      ['f', 0.4],
      ['g', 0.3],
    ]);
    const graph = makeMockGraph(nodes, [], centrality, [nodes]);
    const result = buildGraphSummary(graph);

    expect(result.centralAgents).toHaveLength(5);
    expect(result.centralAgents[0].agentId).toBe('a');
    expect(result.centralAgents[0].centrality).toBe(0.9);
    expect(result.centralAgents[4].agentId).toBe('e');
  });

  it('sorts central agents by centrality descending', () => {
    const centrality = new Map<string, number>([
      ['low', 0.1],
      ['high', 0.9],
      ['mid', 0.5],
    ]);
    const graph = makeMockGraph(['low', 'high', 'mid'], [], centrality, []);
    const result = buildGraphSummary(graph);

    expect(result.centralAgents[0].agentId).toBe('high');
    expect(result.centralAgents[1].agentId).toBe('mid');
    expect(result.centralAgents[2].agentId).toBe('low');
  });

  it('includes topEdges from buildTopEdges', () => {
    const edges = [makeEdge({ from: 'a', to: 'b', outcome: 'success', durationMs: 50 })];
    const graph = makeMockGraph(['a', 'b'], edges);
    const result = buildGraphSummary(graph);

    expect(result.topEdges).toHaveLength(1);
    expect(result.topEdges[0].from).toBe('a');
  });
});

// ============================================================================
// getActiveTracesFromGraph
// ============================================================================

describe('getActiveTracesFromGraph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array for empty graph', () => {
    const graph = makeMockGraph([], []);
    const result = getActiveTracesFromGraph(graph, 60000);
    expect(result).toEqual([]);
  });

  it('returns traces within time window', () => {
    // Mock now = 1700000000000; edge timestamp = now - 5000 (within window)
    const edges = [
      makeEdge({
        traceId: 'trace-active',
        timestamp: new Date(1700000000000 - 5000).toISOString(),
      }),
    ];
    const graph = makeMockGraph([], edges);
    const result = getActiveTracesFromGraph(graph, 60000);

    expect(result).toContain('trace-active');
  });

  it('excludes traces outside time window', () => {
    // Edge at now - 120000 (2 minutes ago), window = 60000 (1 min)
    const edges = [
      makeEdge({
        traceId: 'trace-old',
        timestamp: new Date(1700000000000 - 120000).toISOString(),
      }),
    ];
    const graph = makeMockGraph([], edges);
    const result = getActiveTracesFromGraph(graph, 60000);

    expect(result).not.toContain('trace-old');
  });

  it('deduplicates trace IDs', () => {
    const edges = [
      makeEdge({
        traceId: 'trace-dup',
        timestamp: new Date(1700000000000 - 1000).toISOString(),
      }),
      makeEdge({
        traceId: 'trace-dup',
        timestamp: new Date(1700000000000 - 2000).toISOString(),
      }),
    ];
    const graph = makeMockGraph([], edges);
    const result = getActiveTracesFromGraph(graph, 60000);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe('trace-dup');
  });

  it('returns multiple unique traces', () => {
    const edges = [
      makeEdge({
        traceId: 'trace-1',
        timestamp: new Date(1700000000000 - 1000).toISOString(),
      }),
      makeEdge({
        traceId: 'trace-2',
        timestamp: new Date(1700000000000 - 2000).toISOString(),
      }),
      makeEdge({
        traceId: 'trace-3',
        timestamp: new Date(1700000000000 - 3000).toISOString(),
      }),
    ];
    const graph = makeMockGraph([], edges);
    const result = getActiveTracesFromGraph(graph, 60000);

    expect(result).toHaveLength(3);
  });

  it('handles edge exactly at cutoff boundary (excluded)', () => {
    // cutoff = now - window = 1700000000000 - 10000 = 1699999990000
    // edge at cutoff exactly => timestamp = cutoff => NOT > cutoff
    const edges = [
      makeEdge({
        traceId: 'trace-boundary',
        timestamp: new Date(1700000000000 - 10000).toISOString(),
      }),
    ];
    const graph = makeMockGraph([], edges);
    const result = getActiveTracesFromGraph(graph, 10000);

    expect(result).not.toContain('trace-boundary');
  });

  it('handles edge just inside cutoff boundary', () => {
    // cutoff = now - 10000. Edge at now - 9999 => just inside
    const edges = [
      makeEdge({
        traceId: 'trace-just-in',
        timestamp: new Date(1700000000000 - 9999).toISOString(),
      }),
    ];
    const graph = makeMockGraph([], edges);
    const result = getActiveTracesFromGraph(graph, 10000);

    expect(result).toContain('trace-just-in');
  });

  it('handles zero time window (only future edges)', () => {
    const edges = [
      makeEdge({
        traceId: 'trace-past',
        timestamp: new Date(1700000000000 - 1).toISOString(),
      }),
    ];
    const graph = makeMockGraph([], edges);
    const result = getActiveTracesFromGraph(graph, 0);

    expect(result).toEqual([]);
  });

  it('mixes active and inactive traces', () => {
    const edges = [
      makeEdge({
        traceId: 'active',
        timestamp: new Date(1700000000000 - 500).toISOString(),
      }),
      makeEdge({
        traceId: 'inactive',
        timestamp: new Date(1700000000000 - 200000).toISOString(),
      }),
    ];
    const graph = makeMockGraph([], edges);
    const result = getActiveTracesFromGraph(graph, 60000);

    expect(result).toContain('active');
    expect(result).not.toContain('inactive');
    expect(result).toHaveLength(1);
  });
});

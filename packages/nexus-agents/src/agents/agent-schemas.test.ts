/**
 * Tests for agent-schemas.ts
 *
 * Covers TaskSchema, AgentMessageSchema, ContextPrunerAgentConfigSchema,
 * and BaseAgentOptionsSchema validation.
 */

import { describe, it, expect } from 'vitest';
import {
  TaskSchema,
  AgentMessageSchema,
  ContextPrunerAgentConfigSchema,
  BaseAgentOptionsSchema,
} from './agent-schemas.js';

// ============================================================================
// TaskSchema
// ============================================================================

describe('TaskSchema', () => {
  it('accepts valid task', () => {
    const result = TaskSchema.safeParse({
      id: 'task-1',
      description: 'Implement feature',
      context: {},
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty id', () => {
    const result = TaskSchema.safeParse({
      id: '',
      description: 'Implement feature',
      context: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty description', () => {
    const result = TaskSchema.safeParse({
      id: 'task-1',
      description: '',
      context: {},
    });
    expect(result.success).toBe(false);
  });

  it('accepts task with constraints', () => {
    const result = TaskSchema.safeParse({
      id: 'task-1',
      description: 'Test',
      context: {},
      constraints: { maxDuration: 5000, maxTokens: 1000 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts task with context history', () => {
    const result = TaskSchema.safeParse({
      id: 'task-1',
      description: 'Test',
      context: {
        history: [{ role: 'user', content: 'hello', timestamp: '2024-01-01' }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative maxDuration', () => {
    const result = TaskSchema.safeParse({
      id: 'task-1',
      description: 'Test',
      context: {},
      constraints: { maxDuration: -1 },
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// AgentMessageSchema
// ============================================================================

describe('AgentMessageSchema', () => {
  it('accepts valid message', () => {
    const result = AgentMessageSchema.safeParse({
      id: 'msg-1',
      from: 'agent-1',
      to: 'agent-2',
      type: 'task',
      payload: { data: 'hello' },
      timestamp: '2024-01-01T00:00:00Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing sender', () => {
    const result = AgentMessageSchema.safeParse({
      id: 'msg-1',
      from: '',
      to: 'agent-2',
      type: 'task',
      payload: {},
      timestamp: '2024-01-01T00:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid type', () => {
    const result = AgentMessageSchema.safeParse({
      id: 'msg-1',
      from: 'agent-1',
      to: 'agent-2',
      type: 'invalid',
      payload: {},
      timestamp: '2024-01-01T00:00:00Z',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid message types', () => {
    const types = ['task', 'result', 'query', 'feedback', 'status'];
    for (const type of types) {
      const result = AgentMessageSchema.safeParse({
        id: 'msg-1',
        from: 'a',
        to: 'b',
        type,
        payload: {},
        timestamp: 't',
      });
      expect(result.success).toBe(true);
    }
  });
});

// ============================================================================
// ContextPrunerAgentConfigSchema
// ============================================================================

describe('ContextPrunerAgentConfigSchema', () => {
  it('accepts empty config (all optional)', () => {
    const result = ContextPrunerAgentConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts valid config', () => {
    const result = ContextPrunerAgentConfigSchema.safeParse({
      enabled: true,
      strategy: 'oldest_first',
      maxTokens: 50000,
      triggerThreshold: 0.9,
    });
    expect(result.success).toBe(true);
  });

  it('rejects threshold > 1', () => {
    const result = ContextPrunerAgentConfigSchema.safeParse({
      triggerThreshold: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative maxTokens', () => {
    const result = ContextPrunerAgentConfigSchema.safeParse({
      maxTokens: -100,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// BaseAgentOptionsSchema
// ============================================================================

describe('BaseAgentOptionsSchema', () => {
  it('accepts valid agent options', () => {
    const result = BaseAgentOptionsSchema.safeParse({
      id: 'agent-1',
      role: 'code_expert',
      capabilities: ['task_execution', 'code_generation'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty id', () => {
    const result = BaseAgentOptionsSchema.safeParse({
      id: '',
      role: 'code_expert',
      capabilities: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid role', () => {
    const result = BaseAgentOptionsSchema.safeParse({
      id: 'agent-1',
      role: 'invalid_role',
      capabilities: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts optional fields', () => {
    const result = BaseAgentOptionsSchema.safeParse({
      id: 'agent-1',
      role: 'orchestrator',
      capabilities: ['delegation'],
      systemPrompt: 'You are an orchestrator.',
      temperature: 0.5,
      maxTokens: 4096,
    });
    expect(result.success).toBe(true);
  });

  it('rejects temperature > 1', () => {
    const result = BaseAgentOptionsSchema.safeParse({
      id: 'agent-1',
      role: 'code_expert',
      capabilities: [],
      temperature: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

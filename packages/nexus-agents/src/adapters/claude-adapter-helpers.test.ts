/**
 * Tests for Claude Adapter Helpers
 * @module adapters/claude-adapter-helpers.test
 */

import { describe, it, expect } from 'vitest';
import { ModelCapability } from '../core/index.js';
import {
  mapStopReason,
  mapContentBlock,
  mapMessage,
  mapTool,
  resolveModelId,
  getModelCapabilities,
} from './claude-adapter-helpers.js';

// ============================================================================
// mapStopReason
// ============================================================================

describe('mapStopReason', () => {
  it('maps end_turn', () => {
    expect(mapStopReason('end_turn')).toBe('end_turn');
  });

  it('maps max_tokens', () => {
    expect(mapStopReason('max_tokens')).toBe('max_tokens');
  });

  it('maps stop_sequence', () => {
    expect(mapStopReason('stop_sequence')).toBe('stop_sequence');
  });

  it('maps tool_use', () => {
    expect(mapStopReason('tool_use')).toBe('tool_use');
  });

  it('defaults to end_turn for unknown reason', () => {
    expect(mapStopReason('unknown_reason')).toBe('end_turn');
  });

  it('defaults to end_turn for null', () => {
    expect(mapStopReason(null)).toBe('end_turn');
  });
});

// ============================================================================
// mapContentBlock
// ============================================================================

describe('mapContentBlock', () => {
  it('maps text block', () => {
    const result = mapContentBlock({ type: 'text', text: 'Hello' } as never);
    expect(result).toEqual({ type: 'text', text: 'Hello' });
  });

  it('maps tool_use block', () => {
    const block = {
      type: 'tool_use',
      id: 'tool-1',
      name: 'search',
      input: { query: 'test' },
    } as never;
    const result = mapContentBlock(block);
    expect(result).toEqual({
      type: 'tool_use',
      id: 'tool-1',
      name: 'search',
      input: { query: 'test' },
    });
  });

  it('returns empty text for unknown block type', () => {
    const result = mapContentBlock({ type: 'unknown' } as never);
    expect(result).toEqual({ type: 'text', text: '' });
  });
});

// ============================================================================
// mapMessage
// ============================================================================

describe('mapMessage', () => {
  it('maps user message with string content', () => {
    const result = mapMessage({ role: 'user', content: 'Hello' });
    expect(result).toEqual({ role: 'user', content: 'Hello' });
  });

  it('maps assistant message with string content', () => {
    const result = mapMessage({ role: 'assistant', content: 'Hi there' });
    expect(result).toEqual({ role: 'assistant', content: 'Hi there' });
  });

  it('maps message with text content blocks', () => {
    const result = mapMessage({
      role: 'user',
      content: [{ type: 'text', text: 'Block text' }],
    });
    expect(result.role).toBe('user');
    expect(Array.isArray(result.content)).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]).toEqual({ type: 'text', text: 'Block text' });
  });

  it('maps message with tool_use block', () => {
    const result = mapMessage({
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'tool-1', name: 'test', input: {} }],
    });
    const content = result.content as unknown as Array<Record<string, unknown>>;
    expect(content[0]?.type).toBe('tool_use');
    expect(content[0]?.id).toBe('tool-1');
  });

  it('maps message with tool_result block', () => {
    const result = mapMessage({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'result data' }],
    });
    const content = result.content as unknown as Array<Record<string, unknown>>;
    expect(content[0]?.type).toBe('tool_result');
    expect(content[0]?.tool_use_id).toBe('tool-1');
  });

  it('includes is_error for tool_result when defined', () => {
    const result = mapMessage({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'error', is_error: true }],
    });
    const content = result.content as unknown as Array<Record<string, unknown>>;
    expect(content[0]?.is_error).toBe(true);
  });

  it('maps non-user role to assistant', () => {
    const result = mapMessage({ role: 'system', content: 'System msg' });
    expect(result.role).toBe('assistant');
  });
});

// ============================================================================
// mapTool
// ============================================================================

describe('mapTool', () => {
  it('maps tool definition', () => {
    const tool = {
      name: 'search',
      description: 'Search the web',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    };
    const result = mapTool(tool);
    expect(result.name).toBe('search');
    expect(result.description).toBe('Search the web');
    expect(result.input_schema).toEqual(tool.inputSchema);
  });
});

// ============================================================================
// resolveModelId
// ============================================================================

describe('resolveModelId', () => {
  it('resolves known alias', () => {
    const resolved = resolveModelId('claude-opus-4');
    expect(resolved).toContain('claude');
    expect(resolved).not.toBe('claude-opus-4');
  });

  it('returns raw id for unknown alias', () => {
    expect(resolveModelId('custom-model-id')).toBe('custom-model-id');
  });

  // Issue #2186 Child 1: aliases derive from model-capabilities.ts (single
  // source of truth), so the legacy claude-opus-4 / claude-sonnet-4 / claude-haiku-4
  // aliases must resolve to the current registry values, not the May-2025 strings
  // that were hardcoded in claude-adapter-types.ts.
  it('resolves claude-opus-4 to the current registry cliModelName (not stale 4-20250514)', () => {
    expect(resolveModelId('claude-opus-4')).toBe('claude-opus-4-6');
  });

  it('resolves claude-sonnet-4 to the current registry cliModelName', () => {
    expect(resolveModelId('claude-sonnet-4')).toBe('claude-sonnet-4-6');
  });

  it('resolves claude-haiku-4 to the current registry cliModelName', () => {
    expect(resolveModelId('claude-haiku-4')).toBe('claude-haiku-4-5-20251001');
  });

  it('honors legacy claude-haiku-3 alias and routes it to the current haiku', () => {
    expect(resolveModelId('claude-haiku-3')).toBe('claude-haiku-4-5-20251001');
  });

  it('passes through bare CLI aliases like "opus" via the registry', () => {
    expect(resolveModelId('opus')).toBe('claude-opus-4-6');
  });
});

// ============================================================================
// getModelCapabilities
// ============================================================================

describe('getModelCapabilities', () => {
  it('includes base capabilities for any model', () => {
    const caps = getModelCapabilities('claude-sonnet-4');
    expect(caps).toContain(ModelCapability.COMPLETION);
    expect(caps).toContain(ModelCapability.STREAMING);
    expect(caps).toContain(ModelCapability.TOOL_USE);
    expect(caps).toContain(ModelCapability.VISION);
  });

  it('includes extended thinking for opus models', () => {
    const caps = getModelCapabilities('claude-opus-4');
    expect(caps).toContain(ModelCapability.EXTENDED_THINKING);
  });

  it('includes extended thinking for sonnet-4 models', () => {
    const caps = getModelCapabilities('claude-sonnet-4');
    expect(caps).toContain(ModelCapability.EXTENDED_THINKING);
  });

  it('does not include extended thinking for haiku', () => {
    const caps = getModelCapabilities('claude-haiku-3');
    expect(caps).not.toContain(ModelCapability.EXTENDED_THINKING);
  });
});

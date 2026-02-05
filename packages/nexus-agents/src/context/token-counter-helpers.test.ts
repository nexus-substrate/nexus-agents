/**
 * Tests for Token Counter Helpers
 * @module context/token-counter-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { Message } from '../core/index.js';
import {
  generateCacheKey,
  messagesToAnthropicFormat,
  extractSystemPrompt,
} from './token-counter-helpers.js';

// ============================================================================
// generateCacheKey
// ============================================================================

describe('generateCacheKey', () => {
  it('generates key from string content', () => {
    const key = generateCacheKey('hello', 'anthropic', 'claude-3');
    expect(key).toBe('anthropic:claude-3:hello');
  });

  it('generates key from message array', () => {
    const messages: Message[] = [{ role: 'user', content: 'test' }];
    const key = generateCacheKey(messages, 'estimate');
    expect(key).toContain('estimate:default:');
    expect(key).toContain('test');
  });

  it('uses default model when none provided', () => {
    const key = generateCacheKey('hello', 'anthropic');
    expect(key).toBe('anthropic:default:hello');
  });

  it('includes provider in key', () => {
    const keyA = generateCacheKey('same', 'anthropic', 'model');
    const keyB = generateCacheKey('same', 'estimate', 'model');
    expect(keyA).not.toBe(keyB);
  });
});

// ============================================================================
// messagesToAnthropicFormat
// ============================================================================

describe('messagesToAnthropicFormat', () => {
  it('converts simple user message', () => {
    const messages: Message[] = [{ role: 'user', content: 'Hello' }];
    const result = messagesToAnthropicFormat(messages);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ role: 'user', content: 'Hello' });
  });

  it('converts assistant message', () => {
    const messages: Message[] = [{ role: 'assistant', content: 'Hi back' }];
    const result = messagesToAnthropicFormat(messages);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ role: 'assistant', content: 'Hi back' });
  });

  it('filters out system messages', () => {
    const messages: Message[] = [
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hello' },
    ];
    const result = messagesToAnthropicFormat(messages);
    expect(result).toHaveLength(1);
    expect(result[0]?.role).toBe('user');
  });

  it('handles empty message array', () => {
    expect(messagesToAnthropicFormat([])).toHaveLength(0);
  });

  it('handles content blocks with text type', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello from block' }],
      },
    ];
    const result = messagesToAnthropicFormat(messages);
    expect(result).toHaveLength(1);
  });
});

// ============================================================================
// extractSystemPrompt
// ============================================================================

describe('extractSystemPrompt', () => {
  it('extracts system prompt from string content', () => {
    const messages: Message[] = [
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hello' },
    ];
    expect(extractSystemPrompt(messages)).toBe('You are helpful');
  });

  it('returns undefined when no system message', () => {
    const messages: Message[] = [{ role: 'user', content: 'Hello' }];
    expect(extractSystemPrompt(messages)).toBeUndefined();
  });

  it('handles empty messages array', () => {
    expect(extractSystemPrompt([])).toBeUndefined();
  });

  it('extracts system prompt from content blocks', () => {
    const messages: Message[] = [
      {
        role: 'system',
        content: [
          { type: 'text', text: 'Part 1' },
          { type: 'text', text: 'Part 2' },
        ],
      },
    ];
    expect(extractSystemPrompt(messages)).toBe('Part 1\nPart 2');
  });

  it('filters non-text blocks in system message', () => {
    const messages: Message[] = [
      {
        role: 'system',
        content: [
          { type: 'text', text: 'Text part' },
          { type: 'tool_use', id: 'id', name: 'tool', input: {} },
        ] as Message['content'],
      },
    ];
    expect(extractSystemPrompt(messages)).toBe('Text part');
  });
});

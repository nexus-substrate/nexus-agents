/**
 * Tests for shared prompt extraction utilities.
 *
 * @module adapters/prompt-utils.test
 * (Source: Issue #1596 — DRY adapter standardization)
 */

import { describe, it, expect } from 'vitest';

import type { CompletionRequest } from '../core/index.js';
import { extractRequestSystemPrompt } from './prompt-utils.js';

describe('extractRequestSystemPrompt', () => {
  it('returns explicit systemPrompt field when present', () => {
    const request: CompletionRequest = {
      messages: [{ role: 'user', content: 'Hello' }],
      systemPrompt: 'You are helpful',
    };
    expect(extractRequestSystemPrompt(request)).toBe('You are helpful');
  });

  it('returns undefined when systemPrompt is empty string', () => {
    const request: CompletionRequest = {
      messages: [{ role: 'user', content: 'Hello' }],
      systemPrompt: '',
    };
    expect(extractRequestSystemPrompt(request)).toBeUndefined();
  });

  it('returns undefined when systemPrompt is undefined and no system message', () => {
    const request: CompletionRequest = {
      messages: [{ role: 'user', content: 'Hello' }],
    };
    expect(extractRequestSystemPrompt(request)).toBeUndefined();
  });

  it('extracts from system message when systemPrompt field missing', () => {
    const request: CompletionRequest = {
      messages: [
        { role: 'system', content: 'System instructions' },
        { role: 'user', content: 'Hello' },
      ],
    };
    expect(extractRequestSystemPrompt(request)).toBe('System instructions');
  });

  it('prefers explicit systemPrompt over system message', () => {
    const request: CompletionRequest = {
      messages: [
        { role: 'system', content: 'From messages' },
        { role: 'user', content: 'Hello' },
      ],
      systemPrompt: 'From field',
    };
    expect(extractRequestSystemPrompt(request)).toBe('From field');
  });

  it('handles multi-block system message content', () => {
    const request: CompletionRequest = {
      messages: [
        {
          role: 'system',
          content: [
            { type: 'text', text: 'Part 1' },
            { type: 'text', text: 'Part 2' },
          ],
        },
        { role: 'user', content: 'Hello' },
      ],
    };
    expect(extractRequestSystemPrompt(request)).toBe('Part 1\nPart 2');
  });

  it('filters non-text blocks from system message', () => {
    const request: CompletionRequest = {
      messages: [
        {
          role: 'system',
          content: [
            { type: 'text', text: 'Text part' },
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc' } },
          ],
        },
        { role: 'user', content: 'Hello' },
      ],
    };
    expect(extractRequestSystemPrompt(request)).toBe('Text part');
  });
});

/**
 * nexus-agents/context - Token Counter Helpers
 *
 * Internal helper functions for token counting.
 *
 * @module context/token-counter-helpers
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Message } from '../core/index.js';
import type { TokenCounterProvider } from './token-counter-types.js';

/**
 * Generates a cache key from content.
 */
export function generateCacheKey(
  content: string | Message[],
  provider: TokenCounterProvider | 'estimate',
  model?: string
): string {
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
  return `${provider}:${model ?? 'default'}:${contentStr}`;
}

/**
 * Converts Message[] to Anthropic MessageParam[] format.
 */
export function messagesToAnthropicFormat(messages: Message[]): Anthropic.MessageParam[] {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      const role = m.role === 'user' ? 'user' : 'assistant';
      if (typeof m.content === 'string') {
        return { role, content: m.content };
      }
      // Map content blocks
      const content = m.content.map((block) => {
        if (block.type === 'text') {
          return { type: 'text' as const, text: block.text };
        }
        if (block.type === 'tool_use') {
          return {
            type: 'tool_use' as const,
            id: block.id,
            name: block.name,
            input: block.input,
          };
        }
        if (block.type === 'tool_result') {
          return {
            type: 'tool_result' as const,
            tool_use_id: block.tool_use_id,
            content: block.content,
          };
        }
        // Image type - handle source type properly
        return {
          type: 'image' as const,
          source: block.source as Anthropic.ImageBlockParam['source'],
        };
      });
      return { role, content };
    });
}

/**
 * Extracts system prompt from messages if present.
 */
export function extractSystemPrompt(messages: Message[]): string | undefined {
  const systemMsg = messages.find((m) => m.role === 'system');
  if (systemMsg === undefined) {
    return undefined;
  }
  if (typeof systemMsg.content === 'string') {
    return systemMsg.content;
  }
  return systemMsg.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

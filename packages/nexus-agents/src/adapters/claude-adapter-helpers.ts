/**
 * nexus-agents/adapters - Claude Adapter Helpers
 *
 * Helper functions for mapping between nexus-agents types and Anthropic SDK types.
 *
 * @module adapters/claude-adapter-helpers
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  ContentBlock as AnthropicContentBlock,
} from '@anthropic-ai/sdk/resources/messages';
import type { ContentBlock, Message, ToolDefinition, StopReason } from '../core/index.js';
import { ModelCapability } from '../core/index.js';
import { CLAUDE_MODEL_ALIASES } from './claude-adapter-types.js';

/**
 * Maps Anthropic stop reasons to our StopReason type.
 */
export function mapStopReason(anthropicReason: string | null): StopReason {
  switch (anthropicReason) {
    case 'end_turn':
      return 'end_turn';
    case 'max_tokens':
      return 'max_tokens';
    case 'stop_sequence':
      return 'stop_sequence';
    case 'tool_use':
      return 'tool_use';
    default:
      return 'end_turn';
  }
}

/**
 * Maps Anthropic content blocks to our ContentBlock type.
 */
export function mapContentBlock(block: AnthropicContentBlock): ContentBlock {
  if (block.type === 'text') {
    return { type: 'text', text: block.text };
  }
  if (block.type === 'tool_use') {
    const toolBlock = block;
    return {
      type: 'tool_use',
      id: toolBlock.id,
      name: toolBlock.name,
      input: toolBlock.input,
    };
  }
  // Handle unexpected block types gracefully
  return { type: 'text', text: '' };
}

/**
 * Maps our Message format to Anthropic's MessageParam format.
 */
export function mapMessage(message: Message): MessageParam {
  const role = message.role === 'user' ? 'user' : 'assistant';

  if (typeof message.content === 'string') {
    return { role, content: message.content };
  }

  // Map content blocks
  const content = message.content.map((block) => {
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
      const toolResult: {
        type: 'tool_result';
        tool_use_id: string;
        content: string;
        is_error?: boolean;
      } = {
        type: 'tool_result' as const,
        tool_use_id: block.tool_use_id,
        content: block.content,
      };
      // Only set is_error if explicitly defined (exactOptionalPropertyTypes)
      if (block.is_error !== undefined) {
        toolResult.is_error = block.is_error;
      }
      return toolResult;
    }
    // Image type is the remaining possibility
    // Cast source to match Anthropic's expected type
    return {
      type: 'image' as const,
      source: block.source as Anthropic.ImageBlockParam['source'],
    };
  });

  return { role, content };
}

/**
 * Maps our ToolDefinition to Anthropic's tool format.
 */
export function mapTool(tool: ToolDefinition): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
  };
}

/**
 * Resolves model alias to full model identifier.
 */
export function resolveModelId(modelId: string): string {
  return CLAUDE_MODEL_ALIASES[modelId] ?? modelId;
}

/**
 * Determines capabilities based on model ID.
 */
export function getModelCapabilities(modelId: string): readonly ModelCapability[] {
  const capabilities: ModelCapability[] = [
    ModelCapability.COMPLETION,
    ModelCapability.STREAMING,
    ModelCapability.TOOL_USE,
    ModelCapability.VISION,
  ];

  // Extended thinking is available on Opus and Sonnet 4
  const resolvedId = resolveModelId(modelId);
  if (resolvedId.includes('opus') || resolvedId.includes('sonnet-4')) {
    capabilities.push(ModelCapability.EXTENDED_THINKING);
  }

  return capabilities;
}

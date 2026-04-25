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
import { getCliModelName, resolveCliAlias } from '../config/model-config-helpers.js';

/**
 * Legacy version-suffix aliases that pre-date the canonical model registry.
 * They map historical user-facing names to the current registry id, so the
 * actual cliModelName comes from `model-capabilities.ts` (single source of
 * truth — issue #2186 Child 1). Add legacy entries here, never the model
 * version strings themselves.
 */
const LEGACY_CLAUDE_ALIASES: Record<string, string> = {
  'claude-opus-4': 'claude-opus',
  'claude-sonnet-4': 'claude-sonnet',
  'claude-haiku-4': 'claude-haiku',
  'claude-haiku-3': 'claude-haiku',
};

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
 * Resolves a Claude model alias to the full identifier the SDK expects.
 *
 * Resolution order:
 *   1. Legacy aliases (`claude-opus-4`, `claude-haiku-3`, etc.) → current registry id
 *   2. Registry CLI aliases (`opus`, `sonnet`, `haiku`) → registry id
 *   3. Pass through unknown ids unchanged (e.g., custom Bedrock identifiers)
 *
 * The canonical model strings live in `config/model-capabilities.ts`; this
 * function never holds them directly (issue #2186 Child 1).
 */
export function resolveModelId(modelId: string): string {
  const legacyId = LEGACY_CLAUDE_ALIASES[modelId];
  if (legacyId !== undefined) return getCliModelName(legacyId as never);
  const registryId = resolveCliAlias(modelId);
  if (registryId !== undefined) return getCliModelName(registryId);
  return modelId;
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

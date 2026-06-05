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
import type {
  ContentBlock,
  Message,
  ToolDefinition,
  StopReason,
  CompletionRequest,
  ResponseFormat,
} from '../core/index.js';
import { ModelCapability } from '../core/index.js';
import { getCliModelName, resolveCliAlias } from '../config/model-config-helpers.js';

/**
 * Name of the synthetic tool the adapter forces when a caller requests a
 * structured `responseFormat` (#3433). Anthropic has no native JSON mode, so
 * we model structured output as a forced `tool_use`.
 */
export const RESPOND_TOOL_NAME = 'respond';

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
 * Whether this request asks the Claude adapter to produce structured output
 * via a forced `respond` tool_use (#3433). True only when `responseFormat` is
 * present and not the plain `text` form.
 */
export function forcesResponseTool(request: CompletionRequest): boolean {
  return request.responseFormat !== undefined && request.responseFormat.type !== 'text';
}

/**
 * Builds the synthetic `respond` tool for a non-text responseFormat (#3433).
 * For `json_schema` the caller's schema becomes the tool `input_schema`; for
 * `json_object` we use a permissive `{ type: 'object' }` schema.
 */
export function buildRespondTool(format: ResponseFormat | undefined): Anthropic.Tool {
  const inputSchema: Record<string, unknown> =
    format?.type === 'json_schema' ? format.schema : { type: 'object' };
  return mapTool({
    name: RESPOND_TOOL_NAME,
    description:
      'Return the structured response for this request. Call this tool exactly once with the full answer as its arguments.',
    inputSchema,
  });
}

/**
 * Maps an Anthropic response body when a forced `respond` tool was requested
 * (#3433). If the model emitted a `respond` tool_use block, its `.input` is
 * surfaced as a single JSON `text` block so existing text/JSON parsers keep
 * working unchanged. Otherwise falls back to the standard block mapping.
 */
export function mapResponseWithRespondTool(
  blocks: readonly AnthropicContentBlock[]
): ContentBlock[] {
  const respondBlock = blocks.find(
    (block) => block.type === 'tool_use' && block.name === RESPOND_TOOL_NAME
  );
  if (respondBlock?.type === 'tool_use') {
    return [{ type: 'text', text: JSON.stringify(respondBlock.input) }];
  }
  return blocks.map(mapContentBlock);
}

/**
 * Resolves a Claude model alias to the full identifier the SDK expects.
 *
 * `resolveCliAlias` consults the canonical registry — both the cliAlias /
 * id columns AND the `aliases` array (#2199 Child 5 migration). Unknown
 * ids pass through (e.g., custom Bedrock identifiers).
 *
 * The canonical model strings live in `config/in-tree-data.ts` and are
 * resolved through the ModelRegistry; this function never holds them
 * directly (issue #2186 Child 1).
 */
export function resolveModelId(modelId: string): string {
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

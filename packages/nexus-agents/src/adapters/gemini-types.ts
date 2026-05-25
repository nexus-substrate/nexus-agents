/**
 * nexus-agents/adapters - Gemini Type Utilities
 *
 * Type mappings and helper functions for the Gemini adapter.
 */

import type { Content, Part, FunctionDeclaration } from '@google/genai';
import type { ContentBlock, Message, ToolDefinition, StopReason } from '../core/index.js';
import { ModelCapability, getTimeProvider, getRandomProvider } from '../core/index.js';
import { findCanonicalModel, getCliModelName } from '../config/model-config-helpers.js';

/**
 * Supported Gemini model identifiers.
 *
 * Current models (2.5+ and 3.x) derive from `config/in-tree-data.ts`
 * (single source of truth — #2200 Child 2). Legacy 1.5 / 2.0 strings remain
 * as constants for backward compat with external consumers; they are not in
 * the canonical registry because Google deprecated those generations
 * upstream in 2025.
 */
export const GEMINI_MODELS = {
  PRO_2_5: getCliModelName('gemini-pro'),
  FLASH_2_5: getCliModelName('gemini-flash'),
  // Legacy — not in canonical registry. Kept for backward compat.
  FLASH_2_0: 'gemini-2.0-flash',
  PRO_1_5: 'gemini-1.5-pro',
  FLASH_1_5: 'gemini-1.5-flash',
} as const;

/**
 * Legacy aliases for Gemini models not in the canonical registry.
 *
 * 2.5 / 3.x aliases are NOT in this map — they resolve via the canonical
 * registry (cliModelName / cliAlias / aliases[]). See `resolveModelId`.
 * Only generations Google has deprecated upstream live here, kept for
 * backward compat with users who hardcoded these strings.
 */
export const GEMINI_MODEL_ALIASES: Record<string, string> = {
  'gemini-2.0-flash': GEMINI_MODELS.FLASH_2_0,
  'gemini-1.5-pro': GEMINI_MODELS.PRO_1_5,
  'gemini-1.5-flash': GEMINI_MODELS.FLASH_1_5,
} as const;

/**
 * Configuration specific to GeminiAdapter.
 */
export interface GeminiAdapterConfig {
  /** Model ID (e.g., 'gemini-2.5-flash' or full model identifier) */
  modelId: string;
  /** API key for Google AI API (required) */
  apiKey: string;
  /** Request timeout in milliseconds (optional) */
  timeout?: number;
  /** Maximum retries for failed requests (optional) */
  maxRetries?: number;
}

// Note: Token estimation moved to core/token-estimator.ts (unified TokenEstimator)

/**
 * Default maximum tokens for Gemini models.
 */
export const DEFAULT_MAX_TOKENS = 8192;

/**
 * Maps Gemini finish reasons to our StopReason type.
 */
export function mapStopReason(finishReason: string | undefined): StopReason {
  switch (finishReason) {
    case 'STOP':
      return 'end_turn';
    case 'MAX_TOKENS':
      return 'max_tokens';
    case 'STOP_SEQUENCE':
      return 'stop_sequence';
    case 'TOOL_CODE':
    case 'MALFORMED_FUNCTION_CALL':
      return 'tool_use';
    default:
      return 'end_turn';
  }
}

/**
 * Maps Gemini response parts to our ContentBlock type.
 */
export function mapPartToContentBlock(part: Part): ContentBlock | null {
  if (part.text !== undefined) {
    return { type: 'text', text: part.text };
  }
  if (part.functionCall !== undefined) {
    return {
      type: 'tool_use',
      id: `tool_${String(getTimeProvider().now())}_${getRandomProvider().random().toString(36).slice(2, 9)}`,
      name: part.functionCall.name ?? '',
      input: part.functionCall.args ?? {},
    };
  }
  return null;
}

/**
 * Maps our Message format to Gemini's Content format.
 */
export function mapMessageToContent(message: Message): Content | null {
  // Skip system messages - they are handled separately
  if (message.role === 'system') {
    return null;
  }

  const role = message.role === 'assistant' ? 'model' : 'user';
  const parts: Part[] = [];

  if (typeof message.content === 'string') {
    parts.push({ text: message.content });
  } else {
    for (const block of message.content) {
      if (block.type === 'text') {
        parts.push({ text: block.text });
      } else if (block.type === 'tool_use') {
        parts.push({
          functionCall: {
            name: block.name,
            args: block.input as Record<string, unknown>,
          },
        });
      } else if (block.type === 'tool_result') {
        parts.push({
          functionResponse: {
            name: block.tool_use_id,
            response: { result: block.content },
          },
        });
      } else {
        // block.type === 'image'
        parts.push({
          inlineData: {
            mimeType: block.source.media_type,
            data: block.source.data,
          },
        });
      }
    }
  }

  return { role, parts };
}

/**
 * Maps our ToolDefinition to Gemini's FunctionDeclaration format.
 * Uses parametersJsonSchema which accepts raw JSON Schema objects.
 */
export function mapToolToFunctionDeclaration(tool: ToolDefinition): FunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: {
      type: 'object',
      properties: tool.inputSchema.properties ?? {},
      required: tool.inputSchema.required ?? [],
    },
  };
}

/**
 * Resolves a Gemini model alias to the full identifier the SDK expects.
 *
 * Resolution order:
 *   1. Canonical registry (cliModelName / cliAlias / aliases[]) — handles
 *      'gemini-pro', 'gemini-2.5-pro', 'gemini-flash', 'gemini-3-pro', etc.
 *   2. Legacy 1.5 / 2.0 alias map — pre-deprecation generations
 *   3. Pass through unknown ids unchanged
 */
export function resolveModelId(modelId: string): string {
  const canonical = findCanonicalModel('gemini', modelId);
  if (canonical?.cliModelName !== undefined) return canonical.cliModelName;
  return GEMINI_MODEL_ALIASES[modelId] ?? modelId;
}

/**
 * Configuration object for Gemini request.
 */
export interface GeminiRequestConfig {
  maxOutputTokens?: number;
  temperature?: number;
  stopSequences?: string[];
  systemInstruction?: string;
  tools?: Array<{ functionDeclarations: FunctionDeclaration[] }>;
  /** #3036: cancellation signal forwarded into @google/genai. */
  abortSignal?: AbortSignal;
}

/**
 * Parameters for Gemini generateContent request.
 */
export interface GeminiRequestParams {
  model: string;
  contents: Content[];
  config?: GeminiRequestConfig;
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

  // Gemini 2.0+, 2.5+, and 3.x models support extended thinking
  const resolvedId = resolveModelId(modelId);
  if (resolvedId.includes('2.5') || resolvedId.includes('2.0')) {
    capabilities.push(ModelCapability.EXTENDED_THINKING);
  }

  return capabilities;
}

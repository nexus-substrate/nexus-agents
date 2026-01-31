/**
 * nexus-agents/adapters - Gemini Type Utilities
 *
 * Type mappings and helper functions for the Gemini adapter.
 */

import type { Content, Part, FunctionDeclaration } from '@google/genai';
import type { ContentBlock, Message, ToolDefinition, StopReason } from '../core/index.js';
import { ModelCapability, getTimeProvider, getRandomProvider } from '../core/index.js';

/**
 * Supported Gemini model identifiers.
 */
export const GEMINI_MODELS = {
  PRO_3: 'gemini-3-pro-preview',
  FLASH_3: 'gemini-3-flash',
  FLASH_2_5: 'gemini-2.5-flash',
  FLASH_2_0: 'gemini-2.0-flash',
  PRO_1_5: 'gemini-1.5-pro',
  FLASH_1_5: 'gemini-1.5-flash',
} as const;

/**
 * Model aliases for convenience.
 */
export const GEMINI_MODEL_ALIASES: Record<string, string> = {
  // Gemini 3 aliases
  'gemini-3-pro-preview': GEMINI_MODELS.PRO_3,
  'gemini-3-pro': GEMINI_MODELS.PRO_3,
  'gemini-3-flash': GEMINI_MODELS.FLASH_3,
  // Gemini 2.x aliases
  'gemini-2.5-flash': GEMINI_MODELS.FLASH_2_5,
  'gemini-2.0-flash': GEMINI_MODELS.FLASH_2_0,
  // Gemini 1.5 aliases
  'gemini-1.5-pro': GEMINI_MODELS.PRO_1_5,
  'gemini-1.5-flash': GEMINI_MODELS.FLASH_1_5,
  // Short aliases (point to latest versions)
  'gemini-flash': GEMINI_MODELS.FLASH_3,
  'gemini-pro': GEMINI_MODELS.PRO_3,
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
 * Resolves model alias to full model identifier.
 */
export function resolveModelId(modelId: string): string {
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
  if (resolvedId.includes('2.5') || resolvedId.includes('2.0') || resolvedId.includes('gemini-3')) {
    capabilities.push(ModelCapability.EXTENDED_THINKING);
  }

  return capabilities;
}

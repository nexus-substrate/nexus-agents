/**
 * Shared prompt extraction utilities for model adapters.
 *
 * Consolidates the duplicated extractSystemPrompt logic from
 * claude-adapter, gemini-adapter, and ollama-adapter into a single
 * implementation.
 *
 * @module adapters/prompt-utils
 * (Source: Issue #1596 — DRY adapter standardization)
 */

import type { CompletionRequest } from '../core/index.js';
import { extractSystemPrompt } from '../context/token-counter-helpers.js';

/**
 * Extracts the system prompt from a CompletionRequest.
 *
 * Checks the explicit `systemPrompt` field first, then falls back to
 * searching the messages array for a system-role message.
 */
export function extractRequestSystemPrompt(request: CompletionRequest): string | undefined {
  if (request.systemPrompt !== undefined && request.systemPrompt !== '') {
    return request.systemPrompt;
  }
  return extractSystemPrompt(request.messages);
}

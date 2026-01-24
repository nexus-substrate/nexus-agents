/**
 * nexus-agents/cli-adapters/adapters - Concrete Adapter Exports
 *
 * CLI adapter implementations for Claude, Gemini, and Codex.
 *
 * (Source: cli-project_plan.md v2.1.0)
 * (Source: Issue #389 - Merged gemini-adapter-enhanced back to canonical)
 */

export { ClaudeCliAdapter } from './claude-adapter.js';
export { CodexCliAdapter } from './codex-adapter.js';
export { CodexMcpAdapter } from './codex-mcp-adapter.js';

// Gemini adapter with retry and circuit breaker (Issue #366, #389)
export { GeminiCliAdapter, createGeminiAdapter } from './gemini-adapter.js';
export type { GeminiConfig, GeminiExecutionResult } from './gemini-adapter.js';

// Deprecated aliases re-exported for backward compatibility
// eslint-disable-next-line @typescript-eslint/no-deprecated
export { EnhancedGeminiCliAdapter, createEnhancedGeminiAdapter } from './gemini-adapter.js';
// eslint-disable-next-line @typescript-eslint/no-deprecated
export type { EnhancedGeminiConfig, EnhancedExecutionResult } from './gemini-adapter.js';

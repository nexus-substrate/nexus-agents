/**
 * nexus-agents
 *
 * Multi-agent orchestration framework with MCP server.
 * Provides tools for orchestrating AI agents for complex software tasks.
 *
 * @example
 * ```typescript
 * import { createServer, startStdioServer, TechLead, createClaudeAdapter } from 'nexus-agents';
 *
 * // Start MCP server
 * const result = await startStdioServer({ name: 'my-server', version: '1.0.0' });
 *
 * // Or use programmatically
 * const adapter = createClaudeAdapter({ model: 'claude-sonnet-4-20250514' });
 * const techLead = new TechLead({ adapter });
 * ```
 *
 * @packageDocumentation
 */

export { VERSION } from './version.js';

// ============================================================================
// Domain-specific exports (split for file size compliance - Issue #285)
// ============================================================================

// Core - Types, Result<T,E>, errors, and logger
export * from './exports/core.js';

// Config - Configuration schemas
export * from './exports/config.js';

// Adapters - Model adapters (Claude, OpenAI, Gemini, Ollama)
export * from './exports/adapters.js';

// Agents - Agent framework, TechLead, Experts
export * from './exports/agents.js';

// Workflows - Workflow engine with parallel execution
export * from './exports/workflows.js';

// MCP - MCP server implementation
export * from './exports/mcp.js';

// CLI Adapters - CLI integration with defensive parsing
export * from './exports/cli-adapters.js';

// Context - Context management and token counting
export * from './exports/context.js';

// Learning - Closed-loop feedback and routing improvement
export * from './exports/learning.js';

// Audit - Structured audit logging (Issue #193)
export * from './exports/audit.js';

// API - REST API Gateway (Issue #184)
export * from './exports/api.js';

// Security - Sandboxing, safety evaluation, and security components (Issue #332)
export * from './exports/security.js';

// Consensus - Voting protocols, consensus engine, and strategies (Issue #351)
export * from './exports/consensus.js';

// Observability - Swarm-level observability for multi-agent systems (Issue #351)
export * from './exports/observability.js';

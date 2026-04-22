/**
 * nexus-agents
 *
 * Multi-agent orchestration framework with MCP server.
 * Provides tools for orchestrating AI agents for complex software tasks.
 *
 * @example
 * ```typescript
 * import { createServer, startStdioServer, Orchestrator, createClaudeAdapter } from 'nexus-agents';
 *
 * // Start MCP server
 * const result = await startStdioServer({ name: 'my-server', version: '1.0.0' });
 *
 * // Or use programmatically
 * const adapter = createClaudeAdapter({ model: 'claude-sonnet-4-20250514' });
 * const orchestrator = new Orchestrator({ adapter });
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

// Agents - Agent framework, Orchestrator, Experts
export * from './exports/agents.js';

// Agents - Skills module exports (Voyager-style skill library)
export * from './exports/agents-skills.js';

// Agents - ICTM (Instructions, Context, Tools, Model) pattern
export * from './exports/agents-ictm.js';

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

// Security - Sandboxing, safety evaluation, and security components (Issue #332)
export * from './exports/security.js';

// Orchestration - Graph workflows, spec execution, outcome tracking (Issue #831)
export * from './exports/orchestration.js';

// Consensus - Voting protocols, consensus engine, and strategies (Issue #351)
export * from './exports/consensus.js';

// Observability - Swarm-level observability for multi-agent systems (Issue #351)
export * from './exports/observability.js';

// SWE-Bench - Evaluation framework for GitHub issue resolution (Issue #257)
export * from './exports/swe-bench.js';

// Benchmarks - BenchmarkAdapter contract + memory/token/consolidation/adapter-latency benchmarks (#1960)
export * from './exports/benchmarks.js';

// Pipeline - V2 Pipeline OS core types and execution (#907)
export * from './exports/pipeline.js';

// SCM - Centralized Source Control Management providers (#1136)
export * from './exports/scm.js';

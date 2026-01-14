# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.0] - 2026-01-14

Multi-Agent Orchestration Release

### Added

- **CLI Commands**
  - `nexus-agents vote` - Consensus voting with 5 voter agents (#212)
    - Real LLM execution for voter agents (#226)
    - Vote recording to GitHub issues via `--issueNumber` flag
  - `nexus-agents system-review` - Automated system health check (#211)
  - `nexus-agents routing-audit` - Debug routing decisions (#170)
  - `nexus-agents orchestrate` - Standalone CLI orchestration (#183)
  - `nexus-agents issue validate` - Issue template validation (#229)
  - `nexus-agents sprint plan` - Automated sprint planning (#230)
- **Observability**
  - SwarmObserver for real-time orchestration visibility (#91aeabf)
  - Routing effectiveness dashboard (#171)
  - LinUCB arm statistics for ML debugging (#174)
- **Security**
  - Phase 3 structured audit logging (#193)
  - Docker sandbox executor with seccomp profiles (#175)
  - Sandbox penetration testing suite (113 tests) (#180)
- **Infrastructure**
  - REST API gateway for non-MCP clients (#184)
  - SQLite session persistence (#190)
  - Centralized middleware chain (#189)
  - Documentation CI Gate workflow (#213)
- **A2A Protocol**
  - EventBus for agent-to-agent communication (#182)
  - Protocol lifecycle event types defined
  - EventBus integration for Aegean, Reflexion, Trinity protocols (#220-#222)
  - Agent message routing through EventBus (#223-#224)
  - Correlation ID generator with child chaining (#224)
  - Byzantine detection events in CP-WBFT (#218)

### Changed

- ARCHITECTURE.md updated with Hybrid Architecture decision (5-0 unanimous)
- ARCHITECTURE.md updated with A2A Protocol section (#215)

### Fixed

- Route schemas extracted to fix max-lines-per-function lint errors (#ef5ebe0)
- REPL test timeouts in CI (#192)
- exactOptionalPropertyTypes error in PolicyCheckOptions

### Completed (from Planned)

- **Research Registry CLI** (Epic #225) - `nexus-agents research` commands (#237)
  - `research status` - View technique implementation status
  - `research overlap` - Find related techniques
  - `research add` - Add papers from arXiv

## [2.0.0] - 2026-01-04

Package Consolidation Release

### Changed

- **BREAKING**: Consolidated 7 packages into single `nexus-agents` package
  - Merged: `@nexus-agents/core`, `@nexus-agents/config`, `@nexus-agents/adapters`,
    `@nexus-agents/agents`, `@nexus-agents/workflows`, `@nexus-agents/mcp`, `@nexus-agents/cli`
  - All functionality now available from single `nexus-agents` import
- Import paths changed from `@nexus-agents/*` to `nexus-agents`

### Added

- Unified package structure under `packages/nexus-agents/src/`
- Single entry point with organized exports by domain

### Benefits

- Simpler installation: one dependency instead of seven
- No workspace protocol issues for consumers
- Easier version management
- Reduced node_modules complexity

### Migration Guide

**Note:** The `@nexus-agents/*` scoped packages were unpublished from npm and no longer exist. Only the consolidated `nexus-agents` package (v2.0.1+) is available.

1. If you previously installed `@nexus-agents/*` packages locally, uninstall them:

   ```bash
   npm uninstall @nexus-agents/core @nexus-agents/config @nexus-agents/adapters \
     @nexus-agents/agents @nexus-agents/workflows @nexus-agents/mcp @nexus-agents/cli
   ```

2. Install the consolidated package:

   ```bash
   npm install nexus-agents
   ```

3. Update imports:

   ```typescript
   // Before (no longer available on npm)
   import { Result } from '@nexus-agents/core';
   import { ClaudeAdapter } from '@nexus-agents/adapters';
   import { TechLead } from '@nexus-agents/agents';

   // After
   import { Result, ClaudeAdapter, TechLead } from 'nexus-agents';
   ```

## [1.0.0] - 2026-01-04

Phase 6: Production Release

### Added

- Published all 7 packages to npm registry
- Complete documentation update for npm availability

### Changed

- README.md updated with npm installation instructions
- ARCHITECTURE.md updated to v1.0.0
- SECURITY.md updated with v1.0.x support

### Documentation

- All documentation verified for accuracy
- Removed "not yet published" notices
- Updated roadmap to show v1.0.0 complete

## [0.6.0] - 2026-01-04

Phase 6: Performance and npm Publish Preparation

### Added

- Package README.md files for all 7 packages
- `license` field (MIT) in all package.json files
- `private: true` in root package.json to prevent accidental publish
- `resetDefaultRegistry()` for test isolation in expert-selector

### Changed

- **Performance**: Context token counts now cached (O(1) lookup instead of O(n))
- **Performance**: Expert registry now cached as singleton (avoids recreation)
- ARCHITECTURE.md updated to reflect v0.5.0 and Phase 6 status

### Fixed

- SECURITY.md: Corrected ReDoS prevention claim (static patterns, not minimatch)
- SECURITY.md: Added GitHub Security Advisory link for vulnerability reporting
- README.md: Clarified CLI only starts MCP server (no subcommands yet)

## [0.5.0] - 2026-01-04

Phase 6: CLI and Memory Safety

### Added

- CLI entry point with MCP server startup via stdio transport
- Graceful shutdown handling for SIGINT/SIGTERM signals
- SECURITY.md with vulnerability reporting policy and security practices
- CONTRIBUTING.md with development workflow and coding guidelines
- CLAUDE.md documentation style guide ("Polite Linus Torvalds" - direct, honest, no fluff)
- npm publish configuration for all packages:
  - `publishConfig` with public access
  - `repository` field pointing to GitHub
  - `prepublishOnly` scripts for builds
  - `files` arrays including README.md

### Security

- Event listener bounds (MAX_EVENT_LISTENERS = 50) in CollaborationSession
- Execution cleanup (MAX_TRACKED_EXECUTIONS = 1000) in WorkflowEngine
- Security audit passed (`pnpm audit` - no vulnerabilities)

### Changed

- Updated package.json files across all 7 packages for npm publishing
- Documentation style updated to be direct and accurate

### Fixed

- Memory leak: Unbounded event listeners in CollaborationSession (#59)
- Memory leak: Unbounded execution tracking in WorkflowEngine (#60)
- README.md: Corrected installation instructions (package not yet on npm)
- README.md: Removed non-existent CLI commands
- README.md: Removed non-existent MCP tools (`list_experts`, `get_status`)
- README.md: Updated roadmap to reflect actual progress
- Documentation: Removed marketing language and exaggerated claims

## [0.4.0] - 2026-01-04

Phase 5: MCP Server Implementation

### Added

- MCP server with stdio transport support for Claude Desktop integration
- `orchestrate` tool for task delegation to TechLead agent
- `create_expert` tool for dynamic expert creation with custom prompts
- `run_workflow` tool for executing workflow templates
- Rate limiting middleware with token bucket algorithm
- Validation middleware using Zod schemas for all tool inputs
- Logging middleware for request/response tracking and debugging
- Comprehensive test coverage (89 tests for MCP package)

### Changed

- Updated ESLint configuration with test file relaxations for better DX

### Security

- Input validation at all MCP tool boundaries using Zod schemas
- Rate limiting to prevent API abuse and token exhaustion

## [0.3.0] - 2026-01-04

Phase 4: Workflow Engine Implementation

### Added

- Workflow parser with YAML and JSON support
- Step executor with retry logic, timeout handling, and condition evaluation
- Parallel execution engine with task queue and cancellation support
- Expression resolver for `${{ inputs.x }}` and `${{ steps.y.output }}` syntax
- Dependency graph with topological sort and cycle detection
- Template registry with search and category filtering
- 4 built-in workflow templates:
  - `code-review`: Automated code review workflow
  - `feature-implementation`: End-to-end feature development
  - `bug-fix`: Structured bug fixing process
  - `documentation-update`: Documentation generation and updates

### Changed

- Refactored agents package to comply with ESLint rules (files <= 400 lines)
- Extracted ReviewProtocol and ConsensusProtocol to separate files
- Extracted TechLead decomposition and expert selection helpers

## [0.2.0] - 2026-01-04

Phases 1-3: Model Adapters, Agent Framework, and Expert System

### Added

#### Phase 1 - Model Adapters

- BaseAdapter abstract class with common functionality
- Claude adapter with streaming support and tool use
- OpenAI adapter with tool use mapping and GPT-4 support
- Gemini adapter with safety settings configuration
- Ollama adapter for local model inference
- Token bucket rate limiter for API protection
- Retry logic with exponential backoff and jitter
- Streaming response operators for async iteration
- Adapter factory and registry for model management

#### Phase 2 - Agent Framework

- IAgent interface and BaseAgent implementation
- TechLead orchestration agent for task decomposition
- Agent state machine with idle/thinking/executing/error transitions
- Context manager with memory bounds and token tracking
- Context pruning for memory management (LRU, importance-based)

#### Phase 3 - Expert System

- 5 built-in expert agents:
  - Code Expert: Code generation, refactoring, optimization
  - Security Expert: Vulnerability analysis, security review
  - Architecture Expert: System design, pattern recommendations
  - Documentation Expert: Doc generation, API documentation
  - Testing Expert: Test generation, coverage analysis
- Dynamic expert factory with Zod validation
- Expert collaboration protocol (sequential, parallel, consensus)
- Expert selection algorithm with capability and domain scoring

### Security

- Input validation with Zod at all adapter boundaries
- Rate limiting to prevent token exhaustion
- Memory bounds on context to prevent resource exhaustion

## [0.1.0] - 2026-01-03

Phases 0-1: Foundation and Infrastructure

### Added

#### Phase 0 - Foundation

- Monorepo structure with 7 packages using pnpm workspaces
- TypeScript strict mode configuration with all safety flags
- ESLint configuration enforcing:
  - Files <= 400 lines
  - Functions <= 50 lines
  - Cyclomatic complexity <= 10
  - Max parameters <= 5
- Core interfaces for all modules (IModelAdapter, IAgent, IWorkflowEngine)
- Result<T, E> pattern for type-safe error handling
- Structured error hierarchy (BaseError, ModelError, AgentError, etc.)
- Structured logging with pino (JSON format, log levels)
- Zod-based configuration schemas with validation
- CI pipeline with GitHub Actions (typecheck, lint, test, coverage)
- Pre-commit hooks for secrets detection and code quality

#### Documentation

- PROJECT_PLAN.md with approved multi-agent consensus (6/6 vote)
- ARCHITECTURE.md with interface contracts and diagrams
- CLAUDE.md with coding standards and conventions
- CODING_STANDARDS.md with detailed development guidelines

### Security

- Secrets vault pattern defined (no secrets in process.env)
- Path traversal prevention patterns established
- Pre-commit hook for secrets detection
- Security checklist in coding standards

---

[Unreleased]: https://github.com/williamzujkowski/nexus-agents/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/williamzujkowski/nexus-agents/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/williamzujkowski/nexus-agents/compare/v0.6.0...v1.0.0
[0.6.0]: https://github.com/williamzujkowski/nexus-agents/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/williamzujkowski/nexus-agents/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/williamzujkowski/nexus-agents/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/williamzujkowski/nexus-agents/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/williamzujkowski/nexus-agents/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/williamzujkowski/nexus-agents/releases/tag/v0.1.0

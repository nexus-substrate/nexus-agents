# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Phase 6: Production Readiness (v1.0.0)

### Added

- SECURITY.md with vulnerability reporting policy and security practices
- CONTRIBUTING.md with development workflow and coding guidelines
- npm publish configuration for all packages:
  - `publishConfig` with public access
  - `repository` field pointing to GitHub
  - `prepublishOnly` scripts for builds
  - `files` arrays including README.md
- Comprehensive README.md with:
  - Quick start guide with installation and Claude Desktop integration
  - Feature overview with multi-agent orchestration details
  - Architecture documentation with dependency flow
  - Configuration examples for models, experts, and workflows
  - Development setup and command reference

### Security

- Security audit passed (`pnpm audit` - no vulnerabilities)
- Documentation of security practices in SECURITY.md

### Changed

- Updated package.json files across all 7 packages for npm publishing

### Fixed

- README.md: Corrected installation instructions (package not yet on npm)
- README.md: Removed non-existent CLI commands (planned for v1.0.0)
- README.md: Removed non-existent MCP tools (`list_experts`, `get_status`)
- README.md: Updated roadmap to reflect actual progress (v0.1.0-v0.4.0 complete)
- README.md: Clarified CLI package status as planned for v1.0.0

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

[Unreleased]: https://github.com/williamzujkowski/nexus-agents/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/williamzujkowski/nexus-agents/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/williamzujkowski/nexus-agents/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/williamzujkowski/nexus-agents/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/williamzujkowski/nexus-agents/releases/tag/v0.1.0

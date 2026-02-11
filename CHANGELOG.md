# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.8.0] - 2026-02-11

### Added

- MCP logging notifications for Claude Code observability (#974, Epic #973)
  - `IMcpNotifier` interface with info/debug/warn methods and fire-and-forget semantics
  - `createMcpNotifier(server)` and `NOOP_NOTIFIER` for testing
  - Declare `logging` capability in MCP server options
  - 6 tools instrumented: delegate_to_model, consensus_vote, orchestrate, execute_expert, run_workflow, run_graph_workflow
  - Events: routing_start, model_selected, vote_start/collected/complete, orchestrate/expert/workflow start/complete
- Claude Code observability guide with hooks and status line examples (#977)
  - `docs/guides/claude-code-observability/` — comprehensive 3-layer guide
  - `nexus-hook.sh` — PreToolUse/PostToolUse hook script with session stats
  - `nexus-statusline.sh` — ANSI-colored status bar showing active tools/models

### Deprecated

- `packages/nexus-tui/` package — superseded by Claude Code observability features (#979)
  - Marked deprecated in package.json
  - Scheduled for removal in v3.0

### Changed

- Updated stale MCP tool count references from 20 to 21 across 12 documentation files (#971)

## [2.7.1] - 2026-02-11

### Fixed

- Add observable warn-level logging to 12 silent best-effort catch blocks across 9 files (#966)
  - Catches in consensus-plan, triangulated-review, parallel-exploration, delegate-to-model, run-workflow, consensus-vote, composite-router-outcome, execute-expert, and research-discover now log error details

### Changed

- Replace 110+ inline `error instanceof Error ? error.message : String(error)` patterns with canonical `getErrorMessage()` utility (#968)
- Improve `getErrorMessage()` to handle primitives (number/boolean/bigint) and extract helper for ESLint complexity compliance

## [2.7.0] - 2026-02-11

### Added

- AOrchestra dynamic sub-agent creation — task-adaptive expert team composition (#935, #936, #937)
  - `planAgentTeam()` maps `TaskAnalysisResult` to 1-5 experts from 9 built-in types
  - Wired into orchestrate pipeline behind `NEXUS_AORCHESTRA` flag
- V2 Pipeline Integration — 6 phases with delegate, orchestrate, policy, and event bus (#919-#925)
  - `NEXUS_V2_MODE` umbrella flag (off/partial/full, default: full)
  - PolicyEvaluator with off/warn/block mode and 5 built-in rules
  - EventBus bridge (V2 to V1) and ArtifactStore wired
- V2 Gap Closure — governance-enforcer in routing, quality rewards in LinUCB (#926-#930)
- User Advocate Pipeline — pm_expert, ux_expert roles, requirements-gathering skill (#901)
- MCP integration tests — 28 tests covering all 21 tools via InMemoryTransport

### Fixed

- REST API server port contention in tests — use port 0 for OS-assigned ephemeral ports (#938)
- Mesh mode auto-detection — TTY now routes to orchestrator, not mesh (#932)
- CLI command audit — confirmed 36 commands with handlers (#933)

### Removed

- Dead integration test files (`test/integration/`) — excluded from vitest, used deprecated APIs

### Documentation

- Gap #8 resolved by design — adapter layers serve distinct purposes (#934)
- All 8 architectural gaps resolved (7 by implementation, 1 by design)
- Alignment roadmap and gaps.md updated

## [2.6.0] - 2026-02-03

### Added

- Release automation CLI commands: `release-notes`, `release-validate`, `release-announce` (#637)
- Standards repository absorbed into expert system with 44 skills, 24 knowledge modules (#658)
- Product-type routing with 8 product types (api, web-service, cli, frontend-web, mobile, data-pipeline, ml-service, infra-module)
- 17 built-in standards skills and 5 optional lazy-loaded skill packs (27 additional skills)
- Scaffold command for project bootstrapping (#653)
- External Skill Packs support (#654)
- Standards-review workflow template (#652)
- Per-tool MCP timeout configuration (#657)
- Changelog automation improvements with changeset validation (#634)

### Changed

- Changeset config cleaned up (removed deprecated experimental options)
- Changeset README expanded with CI workflow documentation

### Fixed

- Orchestrator timeout handling (#655)
- API key error handling improvements (#656)
- MD060 table generation in markdown linting (#659)

## [2.5.0] - 2026-02-02

### Added

#### Governance & Quality Gates

- CLI Orchestration Fitness Score with 8 architectural dimensions (#574)
- `fitness-audit` command for release gate validation (requires 90+ score)
- MCP tool index injection mechanism for CLAUDE.md auto-generation
- Zod schemas for configuration defaults validation

#### Unified Architecture (ADR-0013, ADR-0014)

- `IOrchestrator` interface for unified orchestration (#573)
- `SharedTaskAnalyzer` for unified task classification (#574)
- `CommandResult<T>` type for CLI command consolidation (#584)
- `TokenEstimator` service for unified token estimation (#574)
- `RoutingContextStore` for unified routing context (ADR-0008)
- `QuorumValidator` for unified quorum logic (#576)
- `IRegistry` interface for unified registry APIs (#596)
- `OrchestratorFactory` and `WorkflowAdapter` (#573)
- Unified router stage architecture with `CascadeRouterBase` (#574)
- ADR-0009 error class hierarchy implementation

#### Safety & Validation

- STPA safety framework integration into MCP tool registration (#530)
- MCP tools output validation (#547)
- `CapacityMonitor` integration with `CircuitBreaker` (#543)
- End-to-end validation harness (#571)

#### DocOps Automation

- Documentation Management skill and DocOps specification
- Spell checking for documentation (#631)
- Frontmatter validation for website docs (#629)
- Markdown linting to documentation gate (#627)
- Canonical index validation gate (#628)
- DocOps skill synchronization enforcement gate
- Deterministic repository capability index generator
- Website docs sync hooks and troubleshooting navigation

#### CLI & REST

- REST API server wired to CLI entry points (#524)
- Live CLI execution in demo routing command
- `--timeout` option for vote command
- `NEXUS_ALLOW_MOCK_ORCHESTRATION` env var for testing (#540)

### Changed

#### Architecture Consolidation (60+ files refactored)

- Migrated routing pipeline to `SharedTaskAnalyzer` (#586)
- Migrated REST orchestrate endpoint to `IOrchestrator` (ADR-0014)
- Migrated MCP orchestrate tool to unified `IOrchestrator` interface (ADR-0014)
- Migrated expert-selector to `SharedTaskAnalyzer`
- Wired TechLead and Puppeteer to adapters (ADR-0014)
- Wired `OrchestrationObserver` to `CompositeRouter` (#587)

#### Utility Consolidation (ADR-0013)

- Consolidated 30+ duplicate `formatPercentage` patterns
- Consolidated `formatDuration`, `formatStatus`, ANSI colors, box drawing
- Consolidated Zod helpers, truncate functions, capitalize utilities
- Consolidated sleep/delay, UUID generation, timestamp generation
- Consolidated error message extraction with `getErrorMessage` helper
- Consolidated clamp patterns across 6 batches
- Consolidated STOPWORDS and tokenize to shared utils
- Consolidated similarity utilities, memory utilities, ID generation
- Consolidated ISQLiteDatabase interfaces into database-types.ts
- Consolidated API error helpers

### Fixed

#### Determinism & Reliability

- Proposal content caching for consensus determinism (#589)
- Event listeners cleared on session finalize/cancel (memory leak) (#548)
- `maxClosedProposals` limit prevents unbounded memory growth (#549)
- Test heap OOM resolved via forks pool (#582)
- `vi.hoisted` pattern for forks pool compatibility (#582)

#### Correctness

- Mock TechLead requires explicit opt-in (#554)
- Mock workflow execution requires explicit opt-in (#551)
- Unsafe `as any` casts removed from MCP tools (#567)
- Cost model standardized across routers (#574)
- Config validation fitness check corrected
- GOOGLE_AI_API_KEY standardized in JSDoc examples (#544)
- `NEXUS_LOG_LEVEL` env var implemented (#545)
- GitHub API timeout added (#546)
- Defensive error handling in `mergeStreams` (#541)
- Discriminated union used instead of unsafe type cast in LATTS (#539)

#### CI/Documentation

- Broken links repaired in website content and TypeDoc
- SEO duplicate title and a11y contrast issues resolved
- Memory types corrected (7 not 8), consensus algorithms (5 not 11)
- Markdown tables excluded from secrets scan
- Lychee regex patterns and base path corrected

### Refactored

- Deprecated `analyzeTask` warnings suppressed pending #574
- Deprecation markers added to task analyzer implementations
- Routing interface facade added for layer separation (#588)
- `IRegistry`-compatible methods added to `TemplateRegistry` (ADR-0012)
- `IRegistry` interface implemented for `ExpertRegistry` (ADR-0012)
- Forest-engine split into modular files (#578)
- Consensus-vote tool execution flow simplified
- `dryRun` renamed to `simulateVotes` for clarity

### Documentation

- Comprehensive governance framework added to CLAUDE.md
- CLI orchestration architectural decision documented
- System mandate documentation added (#561-564)
- Research index regenerated with updated stats
- Security topic and in-progress paper status added
- Orphaned files removed, historical docs archived
- Package docs migrated to canonical locations
- TechLead/WorkflowEngine architecture consolidated

### Dependencies

- Bumped actions/upload-pages-artifact from 3 to 4 (#427)
- Bumped actions/cache from 4 to 5 (#428)
- Bumped production dependencies group with 7 updates (#585)
- Synced hono override with package dependency version

## [2.4.0] - 2026-01-25

### Added

- Comprehensive hook tests with 243 tests across 9 files (#417)
- Route tests with 71 tests across 6 files (#418)
- Doctor command validations for Node.js version, API keys, and config file (#422)

### Changed

- Setup command now merges hooks instead of overwriting existing user hooks (#420)
- Extracted doctor formatting into separate module for maintainability
- README.md simplified from 519 to 183 lines with clear value proposition
- QUICK_START.md improved with CLI tool requirements and auth steps

### Fixed

- Hook configuration now preserves existing user hooks during setup (#420)
- Removed phantom `consensus_vote` tool from MCP documentation
- Synced root package.json version

### Dependencies

- Removed deprecated `@types/uuid` (uuid v13+ includes types)
- Bumped actions/checkout from 4 to 6
- Bumped actions/setup-node from 4 to 6
- Bumped actions/upload-artifact from 4 to 6
- Bumped actions/github-script from 7 to 8
- Bumped peter-evans/create-pull-request from 6 to 8
- Updated 7 dev dependencies within semver ranges

## [2.3.0] - 2026-01-24

### Added

- RL-trained learnable orchestration policy with REINFORCE algorithm (#154)
- ExperienceBuffer for RL infrastructure with priority sampling (#379)
- PuppeteerOrchestrator CLI support with `--engine=puppeteer` (#386)
- Link validation in research index command (#396)
- Comprehensive E2E testing infrastructure with orchestrator learning tests (#154)
- Astro Starlight documentation website
- Per-tool rate limiting in MCP server for abuse prevention
- Forest-of-Thought reasoning types (#331)
- DAAO VAE-based difficulty estimation (#334)
- AFlow MCTS implementation for agent search
- STPA, ZeroRouter, SEW, and Higher-Order Voting techniques
- Agent-SafetyBench safety categories (#332)
- Custom expert loading from configuration (#300)
- Sandbox execution wrapper for CLI execSync calls
- Research paper registry integration with auto-add from arXiv fetch (#299)
- Deterministic skill loader for agents (#374)
- Config management CLI commands (#360)
- Response caching layer for CLI adapters (#358)
- Skill dependency graph with topological execution ordering (#374)
- Security controls for skill system (RBAC, provenance) (#374)

### Changed

- Eliminated all 12 circular dependency chains (#292, #392)
- 21+ files split for 400-line CODING_STANDARDS compliance (#293, #340, #352, #404)
- Merged gemini-adapter-enhanced into canonical adapter (#389)
- Magic numbers extracted to named constants (#384)
- Codex adapter model defaults refactored for consistency
- Enhanced Gemini adapter with circuit breaker (#366)

### Fixed

- Path traversal protection added to resolveFilePath (security)
- AbortSignal listener cleanup in PuppeteerOrchestrator (memory leak)
- Hardcoded routing latency replaced with actual measurement (#395)
- policyMode config now respected in PuppeteerOrchestrator (#385)
- Codex MCP tool names corrected (#388)
- Codex subprocess adapter and puppeteer transport fixes (#388)
- EnhancedGeminiCliAdapter sandbox flag removed (#387)
- Gemini timeout expectations (#366)
- Test path traversal protection in config-command tests

### Performance

- ResponseCache LRU key lookup optimized from O(n) to O(1) (#408)
- EventBus CircularBuffer for O(1) history eviction (#407)
- ExperienceBuffer sampling optimized with reservoir algorithm

### Security

- Path traversal protection in file resolution
- Sandbox execution wrapping for all execSync calls
- Per-tool rate limiting in MCP server

### Testing

- 561+ new tests added (dogfooding, sandbox, benchmarks, E2E)
- Comprehensive tests for security-critical modules (#382, #383)
- Core/MCP module test coverage (#377)
- Config-command-helpers and research-index-generator edge cases

## [2.2.0] - 2026-01-16

### Added

- SWE-Bench evaluation harness and tooling (#257)
- Deterministic RESEARCH_INDEX.md generator (#367)
- Learning-metrics dashboard command (#284)
- Auto-generation pipeline for llms.txt (#283)
- Tiered documentation infrastructure (Phases 0-2) (#283)
- CLI setup command (#363)
- CLI latency tracking with task-type fallback chains
- ConfigManager with environment validator
- Circuit breaker patterns for CLI adapters
- CLI timeout profiles (#357)
- CLI context load balancing and delegator skills
- Lychee link validation workflow

### Changed

- Split cli-commands.ts into dispatch and handlers (#285)
- Split voter-agents.ts into three modules (#285)
- Split puppeteer-orchestrator and belief-memory (#340)
- Split long functions to comply with 50-line limit (#340)
- Consolidated rules and skills to reference canonical docs (#283)
- Reduced CLAUDE.md to project context only (#283)
- Sherman-Morrison incremental inverse update for LinUCB (#254)

### Fixed

- Broken research index links
- CLI adapter factory tests to use CLI aliases
- Claude CLI model aliases for valid API requests
- Node_modules excluded from tsconfig

### Documentation

- QUICK_START.md added for onboarding
- Phase 6 validation completed (#283)
- ALIGNMENT_ROADMAP updated with SWE-bench verification
- System Review 2026-01-16 (Post-CLI Split #285)

## [2.1.0] - 2026-01-01

### Added

- Multi-agent collaboration framework
- Expert agents (Security, Performance, Documentation)
- Voyager-style skill library with skill composition
- Agentic memory system with contextual retrieval
- TOPSIS router for multi-criteria model selection
- Aegean consensus protocol implementation
- MCP server mode for Claude Desktop integration
- Standalone orchestrator mode for CI/CD

### Changed

- Modular architecture with clear separation of concerns
- Result-based error handling throughout codebase
- Zod validation at all boundaries

### Fixed

- Various type safety improvements
- Path validation for file operations

---

[unreleased]: https://github.com/williamzujkowski/nexus-agents/compare/v2.8.0...HEAD
[2.8.0]: https://github.com/williamzujkowski/nexus-agents/compare/v2.7.1...v2.8.0
[2.7.1]: https://github.com/williamzujkowski/nexus-agents/compare/v2.7.0...v2.7.1
[2.7.0]: https://github.com/williamzujkowski/nexus-agents/compare/v2.6.0...v2.7.0
[2.6.0]: https://github.com/williamzujkowski/nexus-agents/compare/v2.5.0...v2.6.0
[2.5.0]: https://github.com/williamzujkowski/nexus-agents/compare/v2.4.0...v2.5.0
[2.4.0]: https://github.com/williamzujkowski/nexus-agents/compare/v2.3.0...v2.4.0
[2.3.0]: https://github.com/williamzujkowski/nexus-agents/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/williamzujkowski/nexus-agents/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/williamzujkowski/nexus-agents/releases/tag/v2.1.0

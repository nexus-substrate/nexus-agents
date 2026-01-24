# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

## [Unreleased]

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

[unreleased]: https://github.com/williamzujkowski/nexus-agents/compare/v2.3.0...HEAD
[2.3.0]: https://github.com/williamzujkowski/nexus-agents/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/williamzujkowski/nexus-agents/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/williamzujkowski/nexus-agents/releases/tag/v2.1.0

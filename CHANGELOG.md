# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Research paper registry integration with auto-add from arXiv fetch (#299)
- Deterministic skill loader for agents (#374)
- Config management CLI commands (#360)
- Response caching layer for CLI adapters (#358)
- Skill dependency graph with topological execution ordering (#374)
- Security controls for skill system (RBAC, provenance) (#374)
- Skills loader research documentation

### Changed

- Large files split for CODING_STANDARDS compliance (#352)
- Enhanced Gemini adapter with circuit breaker (#366)
- Integration tests updated for API changes

### Fixed

- Gemini timeout expectations per Issue #366
- Missing MemGPT paper added to registry (arxiv-2310.08560)
- Registry inconsistencies found by swarm audit
- Model version claims and paper count accuracy

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

[unreleased]: https://github.com/williamzujkowski/nexus-agents/compare/v2.2.0...HEAD
[2.2.0]: https://github.com/williamzujkowski/nexus-agents/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/williamzujkowski/nexus-agents/releases/tag/v2.1.0

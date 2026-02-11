# nexus-agents

## 2.7.0

### Features

- **Software Factory Hardening** ([#952](https://github.com/williamzujkowski/nexus-agents/issues/952)) — 7 phases:
  - Execution trace contract with agent/model attribution for pipeline observability
  - Live graph executor with branch coverage tracking
  - 4 YAML scenario fixtures with `scenario` CLI command
  - `query_trace` MCP tool for disk-based JSONL trace queries (21 MCP tools total)
  - LinUCB `seedPriors()` with weather report recommended mappings

- **AOrchestra** ([#935](https://github.com/williamzujkowski/nexus-agents/issues/935)) — Task-adaptive expert selection:
  - AgentPlanner for dynamic team composition based on task keywords
  - Wired into orchestrate pipeline behind `NEXUS_AORCHESTRA` flag

- **V2 Gap Closure** ([#926](https://github.com/williamzujkowski/nexus-agents/issues/926)) — 4 phases:
  - PolicyEvaluator wired into V2 delegate/orchestrate pipelines
  - Governance-enforcer wired into delegate_to_model routing
  - OutcomeStore quality data bridged to LinUCB bandit for reward learning

- **UI/UX Design Skill** ([#946](https://github.com/williamzujkowski/nexus-agents/issues/946)) — Integrated UI UX Pro Max design methodology into UX expert

### Bug Fixes

- **Version drift** ([#963](https://github.com/williamzujkowski/nexus-agents/issues/963)) — Centralized version management via tsup build-time injection; version.ts was stuck at 2.5.0
- **Hardening sweep** ([#961](https://github.com/williamzujkowski/nexus-agents/issues/961)) — ReputationCache max size (1000), research discover threshold (0.1→0.3), policy violation escalateTo context
- **Mesh mode** ([#932](https://github.com/williamzujkowski/nexus-agents/issues/932)) — Removed misleading mesh mode auto-detection
- **MCP timeouts** ([#940](https://github.com/williamzujkowski/nexus-agents/issues/940)) — Increased execute_expert and orchestrate tool timeouts
- **qualitySignals type** ([#928](https://github.com/williamzujkowski/nexus-agents/issues/928)) — Fixed to match TaskOutcome schema (string[] not Record)

### Documentation

- CLI command audit confirms 36 commands ([#933](https://github.com/williamzujkowski/nexus-agents/issues/933))
- Gap #8 resolved by design — adapter layers are correct ([#934](https://github.com/williamzujkowski/nexus-agents/issues/934))
- Software Factory hardening report ([docs/architecture/SOFTWARE_FACTORY_REPORT.md](docs/architecture/SOFTWARE_FACTORY_REPORT.md))

### Dependencies

- Bumped actions/checkout to v6, actions/setup-node to v6, actions/github-script to v8
- Production dependency group update (8 packages)

## 2.6.0

### Minor Changes

- [`303675c`](https://github.com/williamzujkowski/nexus-agents/commit/303675c8ae04fd42664d735ce30ec864680acea8) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Add release automation CLI commands (#637)

  New CLI commands for streamlined release workflows:
  - `release-notes`: Generate release notes from conventional commits
    - Supports changelog, json, and markdown output formats
    - Groups by Keep a Changelog categories
    - Auto-suggests next semantic version
  - `release-validate`: Expert swarm validation for releases
    - Security: npm audit, secrets scanning
    - Architecture: Fitness score validation (90+ required)
    - Documentation: CHANGELOG, README, governance checks
    - DevOps: Build, lint, typecheck gates
  - `release-announce`: Generate release announcements
    - Blog post generation following project template
    - Bluesky post (300 char limit)
    - Dry-run preview mode

- [#658](https://github.com/williamzujkowski/nexus-agents/pull/658) [`1108750`](https://github.com/williamzujkowski/nexus-agents/commit/110875055f47eedfe6845952a0be0e7cdf1dc507) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Absorb standards repo into expert system with 44 skills, 24 knowledge modules, and product-type routing
  - Add 24 knowledge modules enriching SecurityExpert, TestingExpert, CodeExpert, ArchitectureExpert, and DocumentationExpert
  - Register 17 built-in standards skills in SkillLibrary at startup (security, testing, coding, architecture)
  - Add 5 optional lazy-loaded skill packs (compliance, ml-ai, mobile, cloud, misc) with 27 additional skills
  - Integrate product type detection into SharedTaskAnalyzer for 8 product types (api, web-service, cli, frontend-web, mobile, data-pipeline, ml-service, infra-module)
  - Add product matrix configuration with expert weight routing per product type
  - Extract task analysis keywords and product type detector into separate modules

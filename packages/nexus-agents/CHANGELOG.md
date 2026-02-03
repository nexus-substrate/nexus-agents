# nexus-agents

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

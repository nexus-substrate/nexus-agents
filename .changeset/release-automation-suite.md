---
'nexus-agents': minor
---

Add release automation CLI commands (#637)

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

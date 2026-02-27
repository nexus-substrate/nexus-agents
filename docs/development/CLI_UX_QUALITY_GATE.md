---
title: CLI UX Quality Gate
description: Pre-release checklist for CLI tool quality — discovery, defaults, workflows, testing
tier: 2
keywords: [cli, ux, quality, checklist, testing, defaults, help]
---

# CLI UX Quality Gate

**Status:** Canonical | **Source:** Agent-sandbox retrospective (#1210)

Checklist for CLI tool quality. Derived from real UX issues discovered during the agent-sandbox project where correct functionality was undermined by poor default experiences.

---

## Pre-Release Checklist

### Discovery & Help

- [ ] **Bare command shows help.** Running the tool with no arguments displays usage, commands, examples, and environment variables. Use `.DEFAULT_GOAL := help` in Makefiles or a default subcommand in scripts.
- [ ] **Help is comprehensive.** Help output includes: getting started steps, all commands with descriptions, practical examples, and required environment variables.
- [ ] **Commands are discoverable.** All user-facing commands appear in `--help` output, Makefile targets, and documentation.

### Configuration & Defaults

- [ ] **Config files auto-load.** If the tool reads from a config file (`.env`, `config.yaml`), it should auto-source it when environment variables are not set. Users should not need to manually export variables that exist in a config file.
- [ ] **Sensible defaults.** Every required setting has either a default value or a clear error message explaining what to set and where.
- [ ] **Whitelist by default.** When integrating with services that have discovery (model catalogs, plugin registries), show only the user's configured entries by default, not everything available. Use `enabled_providers`, `allowlist`, or similar patterns.

### Workflow Integration

- [ ] **Single-command happy path.** The most common workflow (setup → configure → use) should be achievable with one or two commands maximum. Example: `make quickstart` instead of `make validate && make models && make config && make encrypt`.
- [ ] **Progressive disclosure.** Simple use cases are simple. Advanced options are available but not required. Don't front-load complexity.
- [ ] **Error messages suggest fixes.** Every error message should tell the user what to do next: "Run `make decrypt` first" instead of "File not found".

### Testing

- [ ] **Test user workflows, not just commands.** Integration tests should verify the complete user journey (e.g., "new user runs quickstart and gets working config") in addition to individual command tests.
- [ ] **Test bare invocation.** Verify that running the tool with no arguments produces useful output (help), not an error.
- [ ] **Test error messages.** Assert that error messages contain actionable guidance, not just error codes.

---

## Anti-Patterns

| Anti-Pattern            | Example                                                    | Fix                                                          |
| ----------------------- | ---------------------------------------------------------- | ------------------------------------------------------------ |
| Silent misconfiguration | Tool runs but produces wrong output due to missing env var | Validate required vars upfront, fail fast with clear message |
| Information overload    | Listing 75+ providers when user configured 1               | Whitelist-by-default: show only user-configured entries      |
| Multi-step setup ritual | "Run these 5 commands in order"                            | Combine into single command with validation at each step     |
| Manual config sourcing  | "Export your .env vars before running"                     | Auto-source config files when env vars are not set           |
| Cryptic help            | `Usage: tool [options]`                                    | Include examples, env vars, and getting started steps        |

---

## Measurement

Track these metrics across releases:

- **Time to first success:** How many commands does a new user run before getting a useful result?
- **Error-to-fix ratio:** What percentage of error messages include actionable fix instructions?
- **Help completeness:** Does `--help` document every command, option, and env var?

# ADR-0004: Structural Plugin Flags for Experimental Features (Default Off)

**Status:** Proposed
**Date:** 2026-02-08
**Deciders:** Security, Architect, DevEx

---

## Context

~260 files (~40% of the codebase) are experimental/research features not wired into MCP production paths:

- agents/collaboration/ (91 files, ~27k lines) — 8+ research protocols
- agents/reasoning/ (16 files, ~5k lines) — Forest-of-Thought
- agents/self-improving/ (13 files, ~3k lines) — SICA
- agents/ictm/ (7 files, ~2k lines) — AOrchestra
- agents/coordination/ (10 files, ~2k lines) — ScalingPredictor
- agents/orchestration/ (43 files, ~9k lines) — Puppeteer

These are currently compiled and exported alongside production code. Any import error or type incompatibility in these files blocks the entire build.

## Decision

**Experimental features must be behind structural plugin flags:**

1. **Plugin Manifest** — Each experimental feature declares a `PluginManifest` with `experimental: true`.
2. **Config-gated loading** — Experimental plugins are loaded ONLY when explicitly enabled in config.
3. **Directory isolation** — Experimental plugins live in `src/pipeline/plugins/experimental/`. ESLint prevents cross-imports.
4. **Default OFF** — `plugins.experimental.enabled: false` is the default.
5. **NO runtime flag checks** — This is not `if (featureFlags.forestOfThought)`. The plugin is literally not loaded, not registered, not callable. The code exists in the filesystem but is structurally inert.

## Consequences

**Positive:**

- Build failures in experimental code don't block production
- Clear boundary between production and research
- Users who want experimental features explicitly opt in
- Reduced attack surface (unloaded plugins cannot be exploited)

**Negative:**

- File move (significant refactoring)
- Tests must run in both configurations (experimental on and off)
- Developers working on experimental features need config change

## Alternatives Considered

1. **Runtime feature flags (`if (flag)`):** Rejected. The code is still loaded, compiled, and importable. Not structural isolation.
2. **Separate npm package (`nexus-agents-experimental`):** Considered viable but adds build complexity. Plugin registry within monorepo achieves same goal more simply.
3. **Delete experimental code:** Rejected. The code has value. It should be preserved, just isolated.
4. **Keep everything compiled together:** Rejected. 40% of the codebase is dead weight in production.

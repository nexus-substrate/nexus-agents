---
'nexus-agents': patch
---

refactor(core): decouple ANSI color formatting utilities from cli layer and enforce clean layering (#5129 item 1)

Decouples foundational ANSI color formatting from CLI presentation layer to eliminate inverted architectural dependencies:

- Creates `packages/nexus-agents/src/core/ansi-colors.ts` with foundational ANSI escape codes (`RAW_ANSI`), `detectColorsEnabled`, `createColors`, and `colors`.
- Re-exports ANSI color utilities from `packages/nexus-agents/src/cli/ansi-output.ts` to preserve 100% backward compatibility for existing CLI callers.
- Migrates `src/core/trace-exporter.ts` and `src/core/trace-exporter-helpers.ts` to import colors from `core/ansi-colors.js`.
- Adds ESLint architectural rule `nexus-agents/no-core-to-cli-imports-5129` to enforce that foundational `core/` modules never import from `cli/`.
- Re-exports ANSI color utilities from `src/core/index.ts` with explicit type and contract test coverage.
- Fixes internal barrel circular import in `src/core/artifact.ts` to directly import `getTimeProvider` from `./time-provider.js`.

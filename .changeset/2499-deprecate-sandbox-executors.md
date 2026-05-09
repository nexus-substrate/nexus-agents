---
'nexus-agents': minor
---

Deprecate the unused sandbox executor surface (#2499). The OS-level sandbox executors in `packages/nexus-agents/src/security/sandbox/` (`DenoSandboxExecutor`, `DockerSandboxExecutor`, `createSandboxExecutor`, `getSandboxExecutor`/`getSandboxExecutorOrNull`, `policyToDenoFlags`, `collectPolicyConfigurationWarnings`) carry `@deprecated` JSDoc tags pointing at #2499. **Behaviour is unchanged in this release** — the symbols still work, just emit IDE/lint deprecation warnings.

The supported sandbox surface remains the validation primitives (`validateCommand`, `validateArgs`, `SandboxPolicy` types, `DEVELOPMENT_POLICY`, `READONLY_POLICY`) consumed by `cli/sandbox-exec.ts` for command-allowlist gating. Those are NOT deprecated.

**Why**: the executor classes have no production callers. The product direction (epic #2500) is "compatible with running inside a host-provided sandbox" (Codex sandbox, Claude Code sandbox, OpenCode's docker template, locked-down CI) — not "ship our own sandbox runtime." Carrying ~600 lines of unreachable executor code makes the module look more capable than it is and tempts new contributors to extend a layer that doesn't run.

**Migration**: most consumers are internal (this repo) — the deprecated symbols are still exported but should not be the basis of new work. External consumers using `createSandboxExecutor` should plan to migrate to either (a) host-provided sandbox boundaries, or (b) the validation primitives directly.

**Removal**: tracked separately. After this minor release ships, a follow-up issue will delete the executor classes + their tests in a single PR.

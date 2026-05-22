---
'nexus-agents': patch
---

**harden(subprocess):** env-var allowlist for spawned CLI subprocesses. Closes #2865 (#2824 audit).

`spawnSubprocess()` passed the entire `process.env` to every spawned CLI (claude / gemini / codex / opencode) — only `CLAUDECODE` was stripped. That leaked cross-vendor secrets: the **gemini** CLI received `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`; the **codex** CLI received `GOOGLE_AI_API_KEY`; every CLI also saw unrelated secrets like `AWS_SECRET_ACCESS_KEY` and `GITHUB_TOKEN`.

New `cli-adapters/subprocess-env.ts` builds a curated child environment via `buildChildEnv(cliName)`:

- **Base infrastructure** every CLI needs — `PATH`, `HOME`, locale (`LANG`, `LC_*`), proxy (`HTTP_PROXY`/…), `NODE_*`, TLS cert vars, `npm_config_*`, and `NEXUS_*` (config + nested-run credentials).
- **Only the spawned CLI's own vendor key(s)** — gemini gets the Google keys, codex gets `OPENAI_API_KEY`, claude gets `ANTHROPIC_API_KEY`, opencode (routes to any provider) gets the full set. Cross-vendor keys are dropped.

`CLAUDECODE` is still never forwarded. Escape hatch: `NEXUS_SUBPROCESS_ENV_ALLOWLIST=0` restores the pre-#2865 full-passthrough behavior — a field un-break if the allowlist ever drops a var a CLI needs.

10 tests in `subprocess-env.test.ts` cover per-CLI vendor-key isolation, base-infra passthrough, prefix families, unrelated-secret stripping, `CLAUDECODE` removal, and the escape hatch. The 35 existing `subprocess-adapter` tests still pass.

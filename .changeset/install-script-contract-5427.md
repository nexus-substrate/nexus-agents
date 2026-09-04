---
'nexus-agents': minor
---

Enforce the "nothing has to compile at install time" contract instead of asserting it (#5427).

#5388 removed `better-sqlite3` because its install script broke end users where scripts are blocked, and recorded the outcome as "the runtime dependency graph now contains ZERO packages with install scripts". Measured against the published 8.5.0 tarball, four production packages declare one — `@ast-grep/lang-go`, `@ast-grep/lang-python`, `@google/genai` and `protobufjs` — and nothing was watching, so the claim drifted to false unnoticed.

All four are benign, verified rather than assumed, and two new gates keep it that way:

- `nexus-agents verify` gains a **Native Grammars** check. The prebuilt tree-sitter grammars behind the polyglot (Python/Go) security scanner are the last native surface in the graph, and importing them proves nothing — their `libraryPath` is a lazy getter, so the import succeeds whether or not the `.so` exists. The check parses, and asserts a language-specific node kind, because tree-sitter parses the wrong language without complaint and simply finds nothing.
- `scripts/check-install-scripts.ts` fails CI when an install script appears that is not in `scripts/install-script-allowlist.json`, when an allowlisted one changes what it runs, or when an allowlisted entry no longer exists. It runs against an npm install of the **packed tarball**: `pnpm.overrides` is repo-local and unpublished, so the workspace tree carries `protobufjs@8.8.0` (no `postinstall`) where a user gets `protobufjs@7.6.6` (one) — measuring the workspace would have reported three where a user runs four.

`verify-npm-install.sh` gains Phase 9, which runs the real polyglot scanner against a fixture after the existing `--ignore-scripts` install and requires two named findings, so "found nothing" cannot pass for "clean". Verified to exit 9 with the prebuilt grammars deleted. The verification image no longer installs a compiler: it existed for `better-sqlite3`, and a toolchain in an image meant to mirror a constrained user machine is exactly what would let a future native dependency build its way out of the failure the gate exists to catch.

Install docs corrected: `better-sqlite3` no longer exists, so "run `npm rebuild better-sqlite3`" was dead advice and the `prebuild-install` deprecation warning it caused no longer appears.

---
'nexus-agents': minor
---

feat(security): polyglot (Python/Go) ast-grep QA/security rules via read-only runAstQaRules (#4249 child C)

Adds a new read-only `runAstQaRules` runner (`security/ast-rule-runner.ts`,
exported from `exports/security.ts`) that runs YAML-defined `@ast-grep/napi`
rules against Python/Go source, detecting dynamic `eval`/`exec`, shell
injection (`os.system`/`subprocess(..., shell=True)`), and unchecked external
command execution (`exec.Command`). Ships three built-in rules under
`security/ast-rules/*.yml` plus fixtures with both positive hits and
near-miss negatives (`evaluate`/`executor`/no-`shell=True`/local `Command`
helper/aliased `myexec.Command`), mirroring the #4243 lesson that a rule
which "sort of" matches over-fires on lookalikes.

`@ast-grep/napi@0.44.1`'s `Lang` enum has no Python/Go, so this adds the
dynamic-language grammar packages `@ast-grep/lang-python@0.0.6` and
`@ast-grep/lang-go@0.0.6` (both EXACT-pinned — early/experimental packages
where a caret range could silently swap in an incompatible native `.so`
grammar build) and registers them once per process via a lazy
`ensurePolyglotLangs()` singleton, since napi's `@experimental
registerDynamicLanguage` throws if called more than once. Both grammar
packages are added to tsup's `external` list — like the other native-addon
deps — since they resolve their prebuilt `.so` via a `__dirname`-relative
lookup that bundling would break.

Detection-only by construction: ast-grep's YAML `fix:` key is never read by
`SgNode.findAll` (only ast-grep's separate CLI/rewrite machinery applies it),
so this runner cannot become a writer even if a rule author adds one.

MCP exposure is deferred to a follow-up issue to keep this surface a plain
function until a named consumer needs it wired through a tool.

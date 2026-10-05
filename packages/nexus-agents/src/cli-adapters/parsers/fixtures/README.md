# CLI result evidence for #7073

Fixtures replay the canonical parser called by `execute()`. Claude, Codex, Agy
and OpenCode also replay through `execute()` with the process boundary mocked
(and Codex host sandbox probe supplied as healthy); MCP
replays through `execute()` with the transport mocked. Derived cases explicitly
identify that they were not captured live.

| Adapter   | Success                             | Failure                               | Provenance                                                                                                                                                                                                                                                                                                                                    |
| --------- | ----------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude    | `claude-existing-live-success.json` | `claude-existing-measured-error.json` | **inherited, unverified**: success copied from `claude-cost.test.ts` REAL_RESULT (#5241, session_id `sess-abc`), without retained raw capture provenance. Error is also inherited, unverified: reduced verdict fields from the claimed measured 2026-09-13 #6120 envelope in `claude-adapter-is-error.test.ts`. Neither is a new raw capture. |
| Codex     | `codex-live-success.jsonl`          | `codex-live-failure.jsonl`            | Captured 2026-10-04 with ChatGPT plan authentication; process exits 0 and 1.                                                                                                                                                                                                                                                                  |
| agy       | `agy-success.capture.json`          | `agy-error.capture.json`              | Existing verbatim agy v1.1.9 captures from `agy-parser.test.ts`, dated 2026-08-09; error really exits 0.                                                                                                                                                                                                                                      |
| OpenCode  | `opencode-success.jsonl`            | `opencode-failure.jsonl`              | **inherited, unverified**: success copied from the v1.2.15 example in `opencode-parser.test.ts`, without retained capture provenance. Failure captured 2026-10-04 using an invalid model; process exits 1.                                                                                                                                    |
| Codex MCP | `codex-mcp-success.documented.json` | `codex-mcp-error.documented.json`     | **documented-format, unverified against a live capture**. Installed Codex cannot start `mcp-server`: SDK transport closed; direct command returned `Error: stdin is not a terminal`.                                                                                                                                                          |

Codex capture command: `codex exec --json --ephemeral --skip-git-repo-check
--ignore-user-config --ignore-rules --sandbox read-only`, with fixed prompt
`Reply with the single word ok. Do not use tools.` The failure adds
`--model documented-invalid-test-model`.

OpenCode failure command: `opencode run --pure --format json --model
invalid-provider/invalid-model`, with fixed prompt `Reply with the single word ok`.
The original Codex and invalid-model OpenCode captures ran with plan billing in
directories created by `mkdtempOutsideRepo`. The configured-model probes below
ran from the review worktree with its existing OpenCode configuration.
Session/thread identifiers were sanitized; no credentials, paths or emails are
stored. Token usage counts are retained as format evidence.

`opencode-tool-calls.documented.jsonl` is a derived nonterminal variant of the
success capture: **documented-format, unverified against a live capture**.
Other altered or combined streams are explicitly labeled derived in tests.
The inherited, unverified OpenCode success fixture contains `stop`; it does not establish
provider-specific normal endings for the configured models below. `stop` succeeds;
`length` succeeds only with non-whitespace text (`CliResponse` has no truncation
field). `content-filter`, `error`, `tool-calls`, `other`, `unknown`, missing and
unrecognized reasons fail closed, in both real and legacy event streams.

Configured-model live probes were each run once on 2026-10-04, with stdin from
`/dev/null` and a 120-second timeout:
`opencode run --format json --model <selector> "Reply with the single word ok"`.
Selectors come from the canonical registry's `cliModelName`, as used by the
OpenCode adapter's `--model` flag.

| Registry model           | CLI selector                  | Exit | Final finish reason | Result                   |
| ------------------------ | ----------------------------- | ---- | ------------------- | ------------------------ |
| `opencode-default`       | `anthropic/claude-sonnet-4-6` | 1    | None observed       | Model not found; no text |
| `opencode-custom-opus`   | `custom/claude-opus-4-6`      | 1    | None observed       | Model not found; no text |
| `opencode-custom-sonnet` | `custom/claude-sonnet-4-6`    | 1    | None observed       | Model not found; no text |

Each probe has `<registry-model>-live.jsonl` stdout and a corresponding
`<registry-model>-live.provenance.json` record retaining command, timestamp,
exit code and observed reasons. The captures were sanitized before storage.
All three configured models could not complete in this environment. No live
normal completion established `other` or `unknown`, so both remain rejected.

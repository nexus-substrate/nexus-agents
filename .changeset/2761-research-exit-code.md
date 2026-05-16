---
'nexus-agents': patch
---

`nexus-agents research <subcommand>` now propagates exit codes from its subcommand handlers (#2761). Pre-fix `handleResearchCommand` always called `process.exit(EXIT_CODES.SUCCESS)` regardless of what the subcommand returned, so:

- `research index check` printing "Research index is out of date" exited 0 — silently passing in CI hooks that depended on the exit code.
- `research add` with a missing `arxivId` printed "Error: arxiv-id is required" and exited 0.
- `research unknown-subcommand` printed "Unknown subcommand: ..." and exited 0.

The contract is now: subcommand handlers return `ResearchCommandResult { text, exitCode }`; the dispatcher exits with `exitCode` (translated to `EXIT_CODES.SUCCESS` for 0, `EXIT_CODES.SERVER_START_FAILED` for non-zero). Existing string-returning handlers were wrapped via an `ok()` helper that defaults `exitCode` to 0 — no behavior change for the success paths.

Verified by smoke test: `cd /tmp && nexus-agents research index check; echo $?` now prints `1` (was `0`).

Caveat: the broader bug class — every dispatcher in `cli-commands-handlers.ts` that calls a command and `process.exit(SUCCESS)` unconditionally — likely affects other commands too (e.g., `run_pipeline`, `validate`, `improvement-review`). Those are tracked under the parent #2761; this PR fixes `research` first because it had a confirmed user-visible regression.

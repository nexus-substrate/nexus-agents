---
'nexus-agents': patch
---

Drift cleanups — round 3 of the #2720 umbrella ([#2725](https://github.com/williamzujkowski/nexus-agents/issues/2725), [#2727](https://github.com/williamzujkowski/nexus-agents/issues/2727)).

- **#2725 — `isCliAvailable` now consults the auth probe alongside `healthCheck()`.** The #2447 fix added a real authentication probe and applied it to `doctor`, but the parallel consumer `isCliAvailable` (and the `getAvailableClis` rollup it powers) kept the binary-detection-only path — so `nexus-agents orchestrate --dry-run --verbose` listed `opencode` as "Available" when the user wasn't logged in. The factory now runs `adapter.healthCheck()` and `probeCli(cli)` in parallel; a CLI is reported available only when both pass. Cache entries record the auth-failure reason in the `message` field so a follow-up `doctor` doesn't have to re-probe.
- **#2727 — Unimplemented CLI subcommands now exit non-zero and write to stderr.** The `expert create` / `expert execute` / unimplemented `workflow` subcommands previously printed `"The 'X' command is coming soon."` to **stdout** and exited with `EXIT_CODES.SUCCESS (0)` — automation scripts couldn't detect the no-op. Now: stderr, exit `EXIT_CODES.NOT_IMPLEMENTED (4)`, and when an MCP equivalent exists (`create_expert`, `execute_expert`), the message names it so the operator has an escape hatch today.

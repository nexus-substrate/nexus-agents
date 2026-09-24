---
'nexus-agents': patch
---

Fix `--dry-run` being silently ignored on two destructive commands, and make the Claude Code hooks that `setup` installs actually run.

- `improvement-review --file-issues --dry-run` now files no issues. It previously filed real GitHub issues because the handler read an option key the parser never sets.
- `session prune <days> --dry-run` now deletes nothing and reports how many sessions it would delete. It previously deleted them because the parsed flag was never forwarded to the handler.
- `nexus-agents hooks ...` now forwards everything after `hooks` verbatim to the hook router, which is the one definition of hook flags. The installed hooks (`pre-tool --tool Bash --validate`, `post-tool --track-metrics`, `stop --check-tasks`) previously exited 3 with "Unknown option" on every call, so validation, metrics and the task check never ran. This also stops `--validate` and `--source` being consumed and dropped for `hooks`.
- Re-running `setup` without `--force` now updates the hooks it installed and leaves everything else alone. It replaces only individual hooks that exactly match a command `setup` writes. Other hooks in the same matcher entry stay, as do nexus-agents hooks you customized (these are named in a warning) and hook types the merge does not manage (for example `UserPromptSubmit`). Hooks without a `command`, such as `type: "prompt"`, no longer crash `setup`.

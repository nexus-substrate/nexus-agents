---
'nexus-agents': patch
---

Fix `--dry-run` being silently ignored on two destructive commands, and make the Claude Code hooks that `setup` installs actually run.

- `improvement-review --file-issues --dry-run` now files no issues. It previously filed real GitHub issues because the handler read an option key the parser never sets.
- `session prune <days> --dry-run` now deletes nothing and reports how many sessions it would delete. It previously deleted them because the parsed flag was never forwarded to the handler.
- `nexus-agents hooks ...` now forwards everything after `hooks` verbatim to the hook router, which is the one definition of hook flags. The installed hooks (`pre-tool --tool Bash --validate`, `post-tool --track-metrics`, `stop --check-tasks`) previously exited 3 with "Unknown option" on every call, so validation, metrics and the task check never ran. This also stops `--validate` and `--source` being consumed and dropped for `hooks`.
- Re-running `setup` without `--force` now rewrites nexus-agents hook entries that differ from the current ones and leaves current ones alone, and the merge keeps hook types it does not manage (for example `UserPromptSubmit`).

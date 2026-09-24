---
'nexus-agents': patch
---

Fix CLI flags that were accepted and then silently ignored. The global parser consumed them before the command saw them, so each ran as if the flag was never given.

- `session export <id> --output <file>` now writes the file. It previously printed the session to stdout. `session list --json` (or `--format json`) and `session show --json` now print JSON instead of a table.
- `orchestrate -t "..."` / `--task "..."` now runs the task. This is the form the top-level help shows, and it previously printed usage. Giving a task both as an argument and with `--task` is refused.
- `validation --period=7d --model=a,b` now filters the dashboard. It was previously unfiltered. An unknown period such as `7days` is refused instead of showing everything. The help no longer lists `--task-type` and `--min-sample`, which the parser rejected.
- `research index` now owns its flags, as `hooks` does: `--generate`, `--validate`, `--check`, `--strict`, `--no-check-files`, `--silent`, `-o/--output` and `-f/--format json` all reach its parser. Before, most of them were rejected as unknown options, and `-v`/`-o`/`--format` were consumed by the global parser (`-v` printed the version). An argument `research index` does not recognise is now refused. `--flag=value` and the bare word forms (`research index check`) still work.
- `usage --model <id>` now filters by that model id. The value is checked against the model registry: an exact id, an alias, or a gateway id the registry resolves. An id the registry does not know is refused. Before, only CLI names such as `claude` survived parsing, so a real id produced an unfiltered report.
- `memory-benchmark --validate` / `--quick` now validate against the thresholds and run the quick benchmark.

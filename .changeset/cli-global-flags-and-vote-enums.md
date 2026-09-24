---
'nexus-agents': patch
---

Fix CLI global parser swallowing command flags across session, orchestrate, validation, research index, usage, and memory-benchmark, and make vote command refuse invalid enum and timeout values with errors.

- `session export <id> --output <file>` and `session list --json` / `--format json`: forward parsed output and format flags to the session handlers rather than attempting to read stripped positionals.
- `orchestrate -t/--task "<task>"`: forward parsed task flag to orchestrate handler so `--task` works without requiring positionals.
- `validation --period=7d --model=a,b`: forward parsed period and model strings to `parseValidationArgs` to prevent unfiltered output.
- `research index --validate`, `-o/--output`, `--format json`: forward parsed validate, output, and format options to `parseResearchIndexArgs`.
- `usage --model=<id>`: preserve arbitrary model identifiers in `options.model` instead of discarding non-CLI names.
- `memory-benchmark --validate` and `--quick`: recognize `--validate` and `--quick` flags in benchmark options.
- `vote --error-policy`, `--threshold`, `--on-no-quorum`, and `--timeout`: refuse invalid values with descriptive error messages listing valid options, preventing governance votes from silently defaulting to weaker policies.

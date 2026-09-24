---
'nexus-agents': patch
---

Documented CLI flags that exited with `Unknown option` now work (#6693):
`session list --limit <n>`, `session export --markdown`, `usage --since/--until`,
`validation --task-type/--min-sample`, `sprint plan --vote`, `research --topic`,
`--status`, `--create-issues`, `--max`, `--vote`, `research index --generate`,
`--check`, `--strict`, `--silent`, `--no-check-files`, and `release-validate
--strict` / `--skip <validator>` (repeatable). `--limit`, `--max` and
`--min-sample` refuse a value that is not a positive integer.

Help text that advertised flags with no implementation is corrected:
`fitness-audit --min-severity` is removed, the `research index` short aliases
(`-g`, `-v`, `-c`, `-f`, `-s`) are removed because they collided with global
flags or were never parsed, `research import` shows `--dry-run` instead of
`--dryRun`, and `migrate` points at `--output <path>` instead of `--to`.

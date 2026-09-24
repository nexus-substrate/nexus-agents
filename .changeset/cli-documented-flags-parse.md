---
'nexus-agents': patch
---

More documented CLI flags that exited with `Unknown option` now work (#6693,
follow-up to #6705): `research --topic`, `--status`, `--create-issues`,
`--max`, `--vote`; `research index --generate`, `--check`, `--strict`,
`--silent`, `--no-check-files`; `sprint plan --vote`; and `release-validate
--strict` / `--skip <validator>` (repeatable). `--max` refuses a value that is
not a positive integer.

Help text that advertised flags with no implementation is corrected:
`fitness-audit --min-severity` is removed, the `research index` short aliases
(`-g`, `-v`, `-c`, `-f`, `-s`) are removed because they collided with global
flags or were never parsed, `research import` shows `--dry-run` instead of
`--dryRun`, and `migrate` points at `--output <path>` instead of `--to`.

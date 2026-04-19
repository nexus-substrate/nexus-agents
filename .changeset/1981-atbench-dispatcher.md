---
'nexus-agents': minor
---

feat(cli): wire atbench into top-level dispatcher (#1981)

Completes the CLI integration for ATBench. After this PR, end users
can invoke the benchmark directly:

```bash
nexus-agents atbench info
nexus-agents atbench run --variant=claw --limit=10
nexus-agents atbench run --fixture=./test/fixture.jsonl --verbose
```

## Changes

- `cli-types.ts` — added `'atbench'` to the command union and validCommands array
- `cli-commands-handlers-complex.ts` — `handleAtbenchCommand` builds argv from parsed CLI args and dispatches to `atbenchCommand` from `cli/atbench-command.ts`
- `cli-commands-handlers.ts` — re-exports `handleAtbenchCommand` for the dispatcher
- `cli-commands.ts` — wired into the command-handler map (`atbench: handleAtbenchCommand`)
- `cli-help-text.ts` — added ATBENCH OPTIONS block and example invocations
- `cli-commands.test.ts` — added `handleAtbenchCommand` to the mock map

## Tests

- 38 dispatcher + handler tests pass
- 26043/26059 full-suite pass
- typecheck clean
- TypeDoc regenerated

## #1981 status

| Sub-task                        | Status             |
| ------------------------------- | ------------------ |
| BenchmarkAdapter contract       | ✅                 |
| Stub scorer + math              | ✅                 |
| HF dataset loader               | ✅                 |
| LLM-based scorer                | ✅                 |
| CLI programmatic API            | ✅                 |
| **Top-level dispatcher wiring** | ✅ this PR         |
| CI smoke workflow               | ⏳ final follow-up |

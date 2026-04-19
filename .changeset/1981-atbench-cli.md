---
'nexus-agents': minor
---

feat(cli): add atbench CLI command (#1981 follow-up)

Adds the user-facing `atbench` CLI command with `info` and `run`
subcommands. Programmatic API exported from `nexus-agents/cli`;
top-level dispatcher wiring (`nexus-agents atbench ...`) is a
separate small follow-up.

## API

```ts
import { atbenchCommand, parseAtbenchArgs } from 'nexus-agents/cli';

const opts = parseAtbenchArgs(process.argv.slice(2));
const result = await atbenchCommand(opts);
```

## Subcommands

- `info` — prints variant, source (HF or fixture), scorer mode, instance limit
- `run` — loads trajectories, scores them via stub or LLM, prints summary with
  precision/recall/F1/confusion matrix

## Flags

- `--variant=<claw|codex>` — dataset variant (default: claw)
- `--limit=<N>` — cap instances for smoke runs
- `--fixture=<path>` — local JSONL instead of HuggingFace
- `--llm-scoring` — enable LLM scorer (default: stub oracle)
- `--verbose, -v` — per-instance progress

## Tests (17 new)

- arg parsing: defaults, info subcommand, all flags, invalid limit fallback
- runInfo: HF source vs fixture source
- runEvaluation against local fixture: 100% pass with stub oracle, --limit cap, verbose progress
- atbenchCommand top-level dispatch: routes info vs run
- printAtbenchHelp: smoke

## Validation

- typecheck clean
- 17/17 atbench-command tests pass
- 3364/3364 cli + benchmarks tests pass overall
- TypeDoc regenerated

## #1981 progress

| Sub-task                       | Status                                                               |
| ------------------------------ | -------------------------------------------------------------------- |
| BenchmarkAdapter contract impl | ✅ #1996                                                             |
| Stub scorer + confusion math   | ✅ #1996                                                             |
| HF dataset loader              | ✅ #2006                                                             |
| LLM-based scorer               | ✅ #2010                                                             |
| **CLI integration**            | ✅ this PR (programmatic API; top-level dispatcher wiring follow-up) |
| CI smoke workflow              | ⏳ follow-up                                                         |

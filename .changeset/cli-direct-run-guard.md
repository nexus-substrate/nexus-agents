---
'nexus-agents': patch
---

Running the CLI from source — `tsx src/cli.ts --help`, `tsx src/cli.ts vote …` — now behaves like the built `cli.js` and the `nexus-agents` bin. Previously the direct-run guard recognised only `cli.js` and `nexus-agents` in `process.argv[1]`, so any `tsx src/cli.ts …` invocation exited 0 with no output at all, which reads as a broken build rather than a guarded entry point. The guard is now a pure, unit-tested function (`isDirectRun(argv1)` in `cli-direct-run.ts`) that also accepts `cli.ts` and `src/cli`. When it still declines — the module was imported by a test runner or another entry — nothing is printed and the process is not exited, exactly as before, but a debug-level log line now names `argv[1]` so the no-op is traceable with `NEXUS_LOG_LEVEL=debug`.

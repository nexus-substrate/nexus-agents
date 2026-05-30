---
'nexus-agents': patch
---

**security(adapters):** version check uses `execFile` instead of shell `exec` (#3116).

`base-adapter.ts` fetched the CLI version via `promisify(exec)` (a shell) with `` `${this.name} --version` ``. `this.name` is a compile-time `CliName` literal, so this was not exploitable — but it was the one shell call escaping the adapters' no-shell invariant (`injection-prevention.test.ts`). Switched to `execFile(this.name, ['--version'])` (no shell, argv array), removing the latent injection foot-gun and completing the invariant. Surfaced by a proactive CLI-adapter security audit.

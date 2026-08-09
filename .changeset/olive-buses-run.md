---
'nexus-agents': patch
---

fix(cli-adapters): separate an adapter's executable from its routing identity (#4346)

Fixes a regression the agy repoint introduced: `isCliAvailable('gemini')` returned
**false** on a machine where the adapter worked perfectly.

`BaseCliAdapter.getVersion()` ran ``execAsync(`${this.name} --version`)`` — the
`CliName` doubled as the binary name. That is fine while the two coincide and
silently wrong when they diverge. After the gemini arm was repointed to spawn
`agy`, task execution went to `agy` while the health check still shelled
`gemini --version`, reporting the retired binary's `0.51.0` against agy's `1.0.0`
floor. The arm failed its own availability gate while returning correct results
to any caller that bypassed the gate.

`BaseCliAdapter` now exposes `binaryName`, defaulting to `name` so every other
adapter is unaffected, overridden to `agy` for the gemini arm. `getVersion()`, the
version-failure message, and `SubprocessCliAdapter`'s NOT_FOUND message all use
it, and `GeminiCliAdapter.getCommand()` derives its command from the same property
rather than a separate literal — so the execution path and the version probe
cannot drift apart again.

Verified live: `healthCheck()` now returns `{healthy: true, version: "1.1.11"}`
where it previously returned `{healthy: false, version: "0.51.0"}`.

Note this restores the health half only. `isCliAvailable` is
`health.healthy && auth.state === 'authenticated'`, and the auth probe still reads
the retired CLI's OAuth cache — tracked separately.

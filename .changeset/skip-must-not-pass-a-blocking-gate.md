---
'nexus-agents': patch
---

A gate that measured nothing no longer passes the blocking ship gate ([#4355](https://github.com/nexus-substrate/nexus-agents/issues/4355) follow-up).

Found by an adversarial security review of the change that introduced it.

`createAgentStages` read the gate verdict as `result.verdict !== 'fail'`. That was equivalent to `=== 'pass'` only while the quality checks were two-valued. Making an unconfigured check return `skip` — the fix that stopped the gate inventing a linter — made `skip` reachable here, and `skip !== 'fail'` is `true`.

So a repository declaring none of `lint` / `typecheck` / `test` produced: every check `skip` → aggregate `skip` → `passed: true` → `runDevPipeline` in **`blocking`** mode did not block → code shipped with zero typecheck, lint, or test coverage, recorded via `recordOutcome({ success: true })`.

That is the exact regression the original change warned about — "fixing the resolver alone would have turned a false red into a false green" — fixed at the aggregation layer but missed one layer up at the consumer.

Both stage consumers now use `=== 'pass'`:

- **quality gate** — `skip` blocks, and progress output says "Gate unmeasured" rather than "Gate failed", so the reader looks for a missing script instead of a broken check.
- **security scan** — pre-existing and the same class. `checkSecurityScan` returns `skip` when the scan itself _errored_, so a scanner that failed to run was recorded as "security passed" on a blocking ship gate. It now fails closed, as `.rules/untrusted-input.md` requires.

**Behavior change:** a blocking pipeline against a repository with no declared quality scripts, or with an unavailable security scanner, now stops instead of shipping. That is the intent — the gate is saying it has no evidence, and on a ship gate no evidence is not consent.

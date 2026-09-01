---
'nexus-agents': patch
---

test: make eight tests capable of failing (#5320)

Verified each of #5320's six claims against the code rather than accepting them.
Three were genuinely vacuous, three were mischaracterised — weak, but falsifiable
— and one had been partly fixed already. Each fix below was mutation-tested: the
mutant that motivates it now fails, and did not before.

**Genuinely vacuous, now fixed:**

- `codebase-search.test.ts` "gives exported symbols a bonus" searched the real
  tree and asserted `score > 0`. Every match scores at least `SCORE_SUBSTRING`
  (2), so it held with the bonus deleted, zeroed or negated, and it never
  compared an exported symbol to a non-exported one. Replaced with a temp-dir
  fixture holding two identically-named symbols, one exported, asserting the
  exact 3-point gap.
- `agent-planner.test.ts` "emits dependsOn" had its only assertion inside
  `if (testingEntry !== undefined)`, so a planner that stopped selecting
  `testing` would pass green.
- `incremental-quorum.test.ts` had five bare `if (!result.ok) return;` guards
  with no preceding assertion (two others had already been fixed correctly).

**Mischaracterised in the issue, strengthened anyway:**

- The two `cli-server-tools.test.ts` graceful-degradation tests are falsifiable —
  `not.toThrow()` does fail if registration throws. But they were blind to both
  claims in their own comments: that `orchestrate` is skipped and that the other
  tools still register. Registering nothing at all also does not throw. They now
  assert against the same seams the positive case uses.
- `agent-planner.test.ts` "never emits empty dependsOn arrays" fails under
  `dependsOn: []`, so it is not vacuous; it was blind only to dropping
  `dependsOn` entirely. Now establishes there is something to check first.

**Deliberately not changed:** `cli-command-catalog.test.ts:82-85`. It is
falsifiable, and the one mutation it misses — over-filtering to `[]` — is
already caught by two siblings in the same describe block. Adding a third
assertion for it would be duplication, not coverage.

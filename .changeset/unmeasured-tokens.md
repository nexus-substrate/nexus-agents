---
'nexus-agents': minor
---

fix(workflows): an unmeasured step no longer reports as having spent zero tokens

`ResultMetadata.tokensUsed` is required, and producers coerced absence away with
`usage?.totalTokens ?? 0`. So the workflow ledger's unmeasured branch
(`typeof result.tokensUsed !== 'number'`) could never run, `unmeasuredSteps` was
permanently `0`, and `reportUsageCoverage` could never warn. The coverage
reporting added in #4710 was decoration over a signal already destroyed upstream.

Adds `ResultMetadata.tokensMeasured?: boolean` — additive and optional, so no
existing reader breaks. Producers set it to `false` when the adapter reported no
usage, and `step-executor` then omits `StepResult.tokensUsed` (already optional)
so the ledger counts the step as unmeasured rather than free. For a spend cap,
under-counting is the dangerous direction.

An absent flag means "legacy producer, unknown" and is left alone — a value is
dropped only on an explicit `false`.

Chosen over widening `tokensUsed` to `number | undefined` by a 6-1 panel (5/6
selecting this option). That widening would have been a **breaking** change:
`ResultMetadata` is not exported by name, but `TaskResult` is
(`exports/core.ts:52`) and carries `metadata: ResultMetadata`, so it is publicly
reachable and every downstream `const n: number = r.metadata.tokensUsed` would
stop compiling. Detection gap tracked in #4749.

Also fixes a second `?? 0` on the retry path in the same producer
(`simple-agent.ts:93`) that the first-attempt test could not reach.

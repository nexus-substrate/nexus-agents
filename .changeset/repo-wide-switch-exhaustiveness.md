---
'nexus-agents': patch
---

`switch-exhaustiveness-check` is enabled repo-wide ([#4563](https://github.com/nexus-substrate/nexus-agents/issues/4563)).

Completes the pattern work from #4565, which made a new union member a compile error at three decision-bearing consumers via `never` assertions. Those protect the consumers that use `if`/`!==`; this protects `switch` statements, which the assertions do not reach.

**The cost estimate on this issue was wrong by 16×.** I recorded "32 violations across 158 switches" an hour ago, measured with the rule's default options — which require every union member to be covered _even when a `default` clause exists_. That flags `mapStopReason(openaiReason: string | null | undefined)`, a mapper over an external API value with a perfectly sensible fallback, as a violation. Unsatisfiable, and wrong to try.

With `considerDefaultExhaustiveForUnions: true` — the correct configuration, where a `default` clause satisfies the rule — there are **2**, both in `hook-router.ts`.

Both switched on `keyof HookCliOptions` while handling a subset, so an unhandled key silently did nothing. Fixed by narrowing the parameter types to `BooleanOptionKey` and `StringOptionKey`, the keys each setter actually handles, rather than by adding a `default`. That makes the signature true and turns a mismatch into a compile error at the flag map instead of a no-op at runtime.

Verified the rule fires: adding an unhandled member yields `Switch is not exhaustive. Cases not matched: "newKey"`, and reverting is clean.

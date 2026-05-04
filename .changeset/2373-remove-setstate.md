---
'nexus-agents': patch
---

Remove the deprecated `BaseAgent.setState()` method (#2373, follow-up to #2368/#1986).

The protected `setState` method was marked `@deprecated Use stateMachine.transition() directly`. It is removed; callers should use `stateMachine.transition(event)` for known events, or the renamed helper `transitionToState({ stateMachine, logger, newState })` when only the target state is known.

`base-agent-state-helpers.ts` `performLegacyStateTransition` is renamed to `transitionToState` (drops the deprecation marker, function preserved with the same `mapStatesToEvent` mapping logic). The 2 internal callers in `BaseAgent.complete()` and the test helper are updated accordingly.

Patch-level break: `setState` was a `protected` method — internal-only. No public consumer impact.

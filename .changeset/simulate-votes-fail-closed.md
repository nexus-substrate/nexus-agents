---
'nexus-agents': minor
---

`simulateVotes: true` now FAILS CLOSED outside test runners (#4170). The old simulation guard only logged a one-shot warning and proceeded — a caller-supplied `simulateVotes` could resolve a random panel to `outcome: 'approved'` with zero live voters and manufacture a governance approval. `consensus_vote`, `run_pipeline`, and `run_dev_pipeline` now reject such requests early (sync and async modes identically) with a structured `permission` error naming the explicit opt-in, `NEXUS_ALLOW_SIMULATE=1` (demos only). Opted-in pipeline runs stamp `simulated: true` on their output so a demo result can never pass as a real decision. Test-runner behavior (vitest/NODE_ENV=test) is unchanged.

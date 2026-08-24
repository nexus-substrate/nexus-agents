---
'nexus-agents': minor
---

feat(pipeline): record the input trust tier on every stage entry

The shared executor path could not say what provenance drove a run.
`AgentExecutorConfig` had no `trustTier` field and `run_pipeline` had none at
all — zero references in `pipeline-tool.ts` — so `pipeline` and `research` runs
carried no tier anywhere.

Record-only: no stage refuses on it. A consensus vote (7-0, option D, 6/7
selections) established why enforcement cannot land yet — the tier was
unreachable at every candidate guard site, so a fail-closed guard would have
blocked every `pipeline` and `research` run rather than only untrusted ones.

The tier is stamped at STAGE ENTRY rather than at the expert call, because
`runExpert` is not the only model path: `executeVoting` dispatches consensus
voters through its own adapters and never touches it. A guard or recorder at
`runExpert` would cover four of five model paths while reporting success. Stage
entry is the point both pass through.

An absent tier records as `UNMEASURED_TRUST_TIER` (`'unmeasured'`), never as a
trusted default — an unmeasured run must not be indistinguishable from a
trusted one in the record. A test pins that the sentinel is not a valid tier
value, so it cannot be tidied into `'1'`.

`run_pipeline` gains the 2-arg context-aware handler form that
`run_dev_pipeline` adopted in #3712.

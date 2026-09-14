---
'nexus-agents': patch
---

Internal extraction; no behaviour change; public exports unchanged. The pure consensus decision computation now lives in dedicated modules (#6000 step 1): `consensus/decision/thresholds.ts` holds `VOTING_THRESHOLDS`, `SUPERMAJORITY_THRESHOLD` and `ERROR_FLOOR_FRACTION`; `consensus/decision/strategy.ts` holds `resolveStrategy`, `strategyToAlgorithm` and `getDefaultErrorPolicy`; `consensus/decision/verdict.ts` holds `evaluateThreshold`, `determineFinalStatus`, `mapOutcomeToDecision` and `resolveVoteDecision`; `cli/voter-roles.ts` holds `VoterRole`, `VOTER_ROLES` and `getVoterRoles`. Every previous home (`consensus/types-core.ts`, `consensus/result-builder.ts`, `cli/vote-types.ts`, `mcp/tools/consensus-vote-types.ts`) re-exports the symbols it used to declare, so every existing import path and the published API surface are byte-identical. This is the prerequisite for governing those modules on their own CODEOWNERS path in a later step.

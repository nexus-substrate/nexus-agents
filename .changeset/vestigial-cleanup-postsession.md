---
'nexus-agents': patch
---

chore: remove stale @export-no-consumer-yet markers and fix dead job-prefix entries

Post-session vestigial-code cleanup:

- Removed 16 stale `@export-no-consumer-yet` markers on auto-remediation /
  tune-loop modules that now have real (non-test) production consumers reachable
  from the live `auto-remediate` CLI command. The producer/consumer CI gate uses
  these markers as opt-outs, so removing them where a consumer landed keeps the
  gate honest. The one remaining marker (`improvement-remediation-outcome`,
  test-only) is intentionally kept with its tracking issue.
- Fixed dead `TOOL_NAME_BY_PREFIX` entries in `task-state-source.ts`:
  `run_workflow` and `consensus_vote` mint two-segment `job-rw-…` / `job-vote-…`
  job ids, which the previous `rwf` / `cv` single-segment keys never matched.
  `toolNameFromJobId` now tries a two-segment prefix first so the two stay
  distinct instead of colliding on `job`.

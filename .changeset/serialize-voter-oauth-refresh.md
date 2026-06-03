---
'nexus-agents': patch
---

fix(consensus): serialize voter calls per-CLI to stop OAuth refresh race (#3348)

The 7-role consensus panel round-robins onto available CLIs, so the busiest CLI
gets 3 of 7 roles. `launchVotesWithOverallDeadline` fanned those out via
`Promise.all` with only a 2s stagger, so same-CLI subprocess calls overlapped.
When a CLI's access token was expired, concurrent calls each triggered an OAuth
refresh; with refresh-token rotation the first rotated the token and the rest
failed with "refresh token already used" — dropping ~2 voters per run (varying
roles) and fail-closing real governance votes.

Votes are now serialized per CLI (keyed by adapter CLI name): at most one
same-CLI call is in flight at a time, so the cold-start refresh completes before
the next same-CLI call begins. Cross-CLI parallelism is preserved. Deadline-safe
within the existing 600s `consensus_vote` MCP wrapper.

---
'nexus-agents': minor
---

`consensus_vote` responses now carry `contrarianCheck: 'ok' | 'errored' | 'skipped'`, reporting the quick-mode contrarian check as its own field. In quick mode the contrarian is a separate expert call rather than a seat, so `voteCounts.error` never counted it: under `absolute_quorum` a failed check produced `decision: 'no_quorum'` beside `voteCounts.error: 0`, with nothing in the tally naming the voice that failed. The field is always present — `skipped` when the check did not run (full 7-seat panels, simulated votes, a non-approved quick verdict, or an error-policy short-circuit) — and the `nexus-agents vote` summary and its GitHub comment print a matching `Contrarian check:` line, `ok` included. Vote counts and the decision rules are unchanged. The persisted vote record does not yet carry the field.

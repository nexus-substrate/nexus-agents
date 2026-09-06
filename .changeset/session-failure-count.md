---
'nexus-agents': minor
---

`SessionMetrics.failureCount` can now count. It was written in exactly one place
in the package — `createInitialSessionMetrics`, setting it to `0` — because
there was nothing to increment on: `CollaborationSession.submitResult` emitted
`session.result_submitted` while `markExpertFailed` emitted nothing at all, so
an observer saw every success and no failure and any ratio built from the pair
was 100% by construction. Adds `SessionExpertFailedEvent`, emitted from
`markExpertFailed` with the retry count and whether the failure was terminal,
and an observer handler that counts only terminal failures.

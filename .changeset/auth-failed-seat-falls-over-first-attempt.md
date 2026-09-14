---
'nexus-agents': patch
---

A voter seat whose CLI cannot authenticate now errors on its first attempt and falls over to the fallback CLI, instead of being retried as a parse failure until the panel deadline.

On the 2026-09-14 governor panel the catfish seat's `agy` binary exited with a well-formed `{"status":"SUCCESS","response":""}` envelope on stdout and `Error authenticating: IneligibleTierError: This client is no longer supported…` on stderr (Google discontinued the OAuth-personal tier). The subprocess adapter handed the empty answer up as a completion, the vote path reported `Vote parsing failed: Unexpected end of JSON input`, retried the same seat three times at roughly five minutes each — the time is spent inside the `agy` process (its `--print-timeout` defaults to `5m0s`; the vote's own per-attempt guard is the same 300 s and did not fire, since the recorded error is a parse failure, not a timeout; nexus-agents adds only 1 s + 2 s of voter backoff and no adapter retry for this error class) — and ran into the overall deadline, which the #3587 cross-CLI fallover excludes. The healthy fallback never ran and a whole-panel ratification returned no quorum on one broken credential.

Three changes, one shared vocabulary:

- The subprocess adapter classifies an empty extracted answer whose stderr names an authentication failure as `NOT_AUTHENTICATED`, with an error message that names the CLI and the first stderr line (secret-redacted). Empty stderr is not evidence: an empty answer with nothing on stderr still flows through as before, and a non-empty answer is never reclassified on stderr alone. Empty stdout with an auth line on stderr, already an error, now carries the same specific code whatever the exit code.
- The vote retry loop abandons the remaining attempts on an authentication failure, as it already did for a durable capacity cap (#5359), so the budget goes to the fallback. The `Vote attempt failed` log line carries `authFailure: true`, and — on the parse-failure route — `cliStderr`, the first captured stderr line, redacted and clipped to 200 characters, so the cause is visible without a hand repro.
- The authentication-failure pattern list (`not logged in`, `unauthorized`, token/refresh-token expiry, …) gains `error authenticating` and `ineligible tier`, and is read through one `isAuthFailureText` by the envelope classifier, the stderr classifier and the vote loop. A seat that falls over for this reason is disclosed with `reason: 'auth'`.

A healthy seat is unchanged. Closes #6269.

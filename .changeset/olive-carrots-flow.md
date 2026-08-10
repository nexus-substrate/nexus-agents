---
'nexus-agents': minor
---

feat(cli-adapters): graded gateway health evidence, and admit unverifiable gateways (#4391)

First slice of the gateway contract. `isCliAvailable` was
`health.healthy && auth.state === 'authenticated'` — a boolean measured wrong in
**both** directions within one week:

- **False negative:** `agy` served correct answers while `probeGemini` read
  `~/.gemini/oauth_creds.json`, a file agy does not use. The arm was excluded from
  routing while working.
- **False positive:** the retired `gemini` CLI held a valid, unexpired credential
  file while failing every invocation with `IneligibleTierError`.

The fix is not a better boolean. `cli-adapters/gateway-health.ts` records what a
probe actually _proved_ — `none` / `local` / `service` / `completion` — and keeps
admission policy as a separate pure function over that evidence, so a weak signal
is never laundered into a confident verdict.

`AuthProbeResult` gains an explicit `unknown` state, and `isCliAvailable` now
**admits** it. A gateway that exposes no auth signal we can read is given the
benefit of the doubt; real invocation failures do the excluding, via the circuit
breaker the adapters feed since #4330. Only `needs-login` and `not-installed`
withhold an arm.

The gemini probe stops reading the retired CLI's credential cache and reports
`unknown`, which is the honest answer: agy has no `auth`/`login`/`whoami`
subcommand, no credential artifact of its own, and its `models` subcommand hangs
without a TTY (#4393) so it cannot be used programmatically. `nexus-agents login`
renders the new state as `? unverified`.

Net effect: `isCliAvailable('gemini')` goes from `false` to `true` for an arm that
was returning correct answers the whole time.

Decided by `consensus_vote` at 4/3 — **below** the supermajority an architecture
change requires — so the rejecters' alternative was adopted rather than the
proposal as written.

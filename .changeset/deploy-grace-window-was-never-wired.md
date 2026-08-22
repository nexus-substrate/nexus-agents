---
'nexus-agents': patch
---

The deploy-staleness grace window is now reachable ([#4516](https://github.com/nexus-substrate/nexus-agents/issues/4516) follow-up).

`assessDeployStaleness` has a 45-minute window so a deploy in flight is not reported as a stall. The workflow never set `MINUTES_SINCE_PUBLISH`, and the script fell back to `9999`, so that branch **could never be taken**. The guard was unreachable for the detector's entire life.

The consequence is a false alarm on every release. Observed today: 3.5.6 published at 06:40:42Z, the check ran at 07:09:54Z — **29 minutes, well inside the window** — and failed, one second before the deploy run that would have fixed it even started. A detector that cries wolf on the normal path gets muted, which is the same reasoning that kept a second npm-skew detector from being built earlier.

The workflow now derives the elapsed time from npm's publish timestamp for the current version — the point at which the site could first be behind.

An unreadable publish time is reported as **`unmeasured`**, not as "a long time ago". Defaulting it to a large number is precisely what made the window unreachable, and quietly disabling a guard is worse than reporting that its input is missing. A negative elapsed time (clock skew between runner and registry) is also unmeasured rather than an unbounded grace.

Verified by replaying the real inputs: 29 minutes → `deploying`, 60 minutes → `stale`, unreadable → `unmeasured`.

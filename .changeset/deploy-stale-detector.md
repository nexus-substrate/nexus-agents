---
'nexus-agents': patch
---

Detect a published site that has fallen behind `main` (#4506).

The website went **14 days** without a successful deploy. A run wedged in `queued` on 2026-08-09 held the `pages` concurrency group, and 34 later runs were cancelled before starting a job. Nothing reported it: the site returned HTTP 200 the whole time, serving v2.173.6 while `main` reached v3.3.2 — a full major version behind, including documentation for a method deleted weeks earlier.

A scheduled check now compares the **live site version against `package.json`** and files or updates a single deduplicated tracking issue when they diverge.

Chosen 7/7 by a `higher_order` panel over age-based and queue-health alarms. Both of those measure _mechanisms_; this measures the **outcome** anyone cares about — is the published artifact current? That catches every upstream cause: the wedged run, a fail-fast pipeline, a disabled workflow, a trigger that stopped matching, or a deploy that succeeds while publishing nothing (which is #4507, and did happen).

Two panel conditions, both implemented:

- **Fails closed.** An unreachable or unparsable site reports `unmeasured`, which is a failure. An unreadable surface is not evidence of health.
- **A grace window.** The contrarian correctly flagged that "no threshold tuning" was overclaimed — deploys legitimately lag a version bump. That window is 45 minutes, not days.

Security posture: read-only, no credentials, bounded response read, and the version is extracted with an anchored pattern rather than a loose digit scan, since the fetched page is untrusted input.

The first parser anchored on the TypeDoc HTML title format — a different artifact — and reported a healthy site as `unmeasured` while nine unit tests passed against an invented fixture. Caught by running it against the real site; the fixture is now copied from live markup.

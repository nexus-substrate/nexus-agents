---
'nexus-agents': patch
---

Detect deploy runs wedged in the queue (#4521).

On 2026-08-09 a `deploy-website` run sat in `queued` for **11 days** with `runner=none`. Its build and link-check jobs passed; only `Deploy to GitHub Pages` never got picked up. With `concurrency: group: pages` and `cancel-in-progress: false`, that one run held the group and 34 later deploys were cancelled before starting a job. The site served a version a full major behind for two weeks.

**Why the existing timeouts missed it.** Every job in `deploy-website.yml` already has `timeout-minutes` — the deploy job has 5. But `timeout-minutes` bounds **execution, not queueing**: it starts counting when a runner picks the job up. A job that never gets a runner is never "running", so it sat 11 days inside a 5-minute limit without contradiction. Queue residency is the one state nothing in the workflow file bounds, and GitHub Actions has no per-job knob for it — hence an external check rather than a config change.

(My first proposal on #4521 was to add a `timeout-minutes` that already existed. Corrected on the issue.)

The deploy-health workflow now also lists recent runs and flags any waiting past **60 minutes**. That threshold is measured, not guessed: the five most recent successful deploys ran 79s, 73s, 79s, 95s, 67s, so ~90 seconds is healthy and an hour is ~40x that.

`in_progress` is deliberately never flagged however long it runs — that state _is_ bounded by the job's own timeout. Reports only; cancelling a run stays a human decision.

Complements #4516, which catches the consequence (published site behind `main`) regardless of cause. This catches the cause early and names the specific run to cancel — which took real digging by hand, because `queued` does not appear in the obvious "pending runs" query.

Verified by replaying the real incident: run `31293406815` at 18,248 minutes flags with exit 1, while a long-running `in_progress` correctly does not.

---
'nexus-agents': patch
---

The deploy-staleness detector derives its own publish time instead of being handed one (#4516 follow-up).

The grace window took elapsed-since-publish from `MINUTES_SINCE_PUBLISH`, an environment input the workflow was supposed to set. It never did, so the window was unreachable for the detector's whole life. The immediate fix wired the workflow up; this removes the dependency instead.

An input supplied from outside is an input that can be forgotten — and it was, silently, for months. The script now reads npm's registry metadata for the current version itself, so there is no wiring left to drop. The env var still overrides, for tests and for a caller that already knows.

Two practical consequences beyond the wiring:

- Running `npx tsx scripts/check-deploy-stale.ts` by hand now works. Previously a local run always reported `unmeasured`, because the variable is workflow-only — the detector was unusable in exactly the situation where someone reaches for it.
- The workflow step that computed it is gone, so the logic lives in one place rather than being split between a shell snippet and a TypeScript module.

An unreadable registry response still reports **`unmeasured`**, never "a long time ago". Verified against the live registry: `3.6.3` → 4.1 minutes, an absent version → unmeasured.

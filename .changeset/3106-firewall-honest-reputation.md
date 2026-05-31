---
'nexus-agents': patch
---

**fix(security):** firewall reputation is honest, and its tier is enforced, not dropped (#3106, Phase 1 of epic #3118).

Two fixes to `HostileInputFirewall`'s reputation stage:

1. **No fabrication.** `runReputation` fed the engine hardcoded benign metadata (`accountAgeDays:365`, `priorContributions:0`, `recentCommentCount:0`) — so the account/activity signals were always either off or falsely firing (`no_prior_contributions` tripped on every author). The engine's `GitHubUserMetadata` account/activity fields are now **optional**; absent data **skips** those signals (and their score bonuses, guarded against `NaN`) rather than fabricating a value. The firewall now supplies only what it actually knows from the event — `authorAssociation` + `injectionFlags` — so its reputation reflects injection/authority signals honestly until real fetching lands (Phase 3, #3121).
2. **Tier enforced, not dropped.** The computed `effectiveTrustTier` was discarded — `FirewallResult`/ATL used only the classifier tier. `FirewallResult` now carries `effectiveTrustTier = reconcileTrustTier(classifierTier, reputation)` (the shared #3119 helper: demotion-only, Tier-1/allowlist wins, absent→classifier), and the ATL is labelled with it.

`issue_triage` is unaffected (it always supplies real account data). Tests: engine no-fabrication + no-NaN; firewall demotes on a hostile signal and surfaces/labels the enforced tier; the `no_prior_contributions` fabrication no longer fires for an unknown-activity author.

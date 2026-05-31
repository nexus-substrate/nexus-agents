---
'nexus-agents': patch
---

**fix(security):** issue-triage reputation uses the author's real account age (#3121, Phase 3 of epic #3118).

`estimateAccountAge()` was a stub that ignored its argument and always returned `365` — so every author looked like an established account and the `new_account` reputation signal **never fired**, leaving Phase 0's gating unable to act on account age (the same dead-signal class Phase 1 fixed in the firewall).

`fetchIssueData` now fetches the author's real account creation date via the existing `provider.fetchUserMetadata()` and derives `accountAgeDays`, threaded into `assessAuthorReputation`. Best-effort: on fetch failure or an unparseable date the value is **omitted**, so the engine **skips** the `new_account` signal (per #3106's optional fields) — never fabricated, and triage never blocks on the lookup. The `estimateAccountAge`/`DEFAULT_ACCOUNT_AGE_DAYS` stub is deleted. Tests: `new_account` fires for a recent account, not for an established one, and is omitted on fetch failure.

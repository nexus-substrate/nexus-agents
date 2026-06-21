---
'nexus-agents': patch
---

Fix typed-memory invalidation silently failing + harden outcome-store secret redaction

- **#4018:** `TypedMemory.invalidateFact` (and `storeFact`/`KnowledgeVault.store` with a past `validUntil`/`expiresAt`) computed a non-positive `ttl`, which `MemoryMetadataSchema` (`ttl: positive()`) rejected — so the store silently failed with `Invalid metadata` and the fact was never invalidated. The ttl is now clamped to ≥1ms at both computation sites, so a past/now expiry stores-then-expires-on-next-retrieve (the closest to immediate invalidation without a backend delete method).
- **Security hardening (CWE-532):** the outcome-store error-message redaction (`sanitizeErrorMessage`) now also redacts GitHub PATs (`ghp_/gho_/ghu_/ghs_/github_pat_`), AWS access keys (`AKIA…`), and space-separated `Bearer <token>` — formats the previous `sk-…`/`keyword=value` regex missed before persisting `error_message` to SQLite. Patterns are linear (ReDoS-safe).

Both found in the 2026-06-21 QA/security sweep.

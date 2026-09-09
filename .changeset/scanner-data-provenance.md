---
'nexus-agents': patch
---

repo_security_plan: carry scanner-data provenance onto the plan, and stop labelling a stale cache as a live registry read

The tool describes itself as producing "provenance-tracked metrics". `resolveScannerData` computed a `source` discriminant and `RepoSecurityPlan` had nowhere to put it, so a plan built from the embedded `FALLBACK_SCANNER_DATA` snapshot was indistinguishable from one built against the live registry. Only the server log knew.

Worse, one state was mislabelled even internally. `CACHE_TTL_MS` gates only _whether to refetch_, so the stale-cache return in `getRegistryManifest` had no age bound at all — and because the only test was `manifest !== null`, an entry of any age was stamped `source: 'registry'`.

Adds a required `scannerDataSource` (`registry` | `cache` | `fallback`) plus `scannerDataAgeMs`, so "stale" is a quantity rather than an adjective. `getRegistryManifestWithProvenance` reports which path served the manifest; `getRegistryManifest` keeps its old signature for existing callers.

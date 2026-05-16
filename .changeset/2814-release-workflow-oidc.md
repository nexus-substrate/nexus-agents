---
'nexus-agents': patch
---

**Closes #2814.** Migrate the Release workflow to npm trusted publishing via OIDC. Removes `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` from all four publish-relevant env blocks (changesets/action step, publish-race fallback step, manual-publish dry-run + actual publish steps). Auth now flows via the workflow's `id-token: write` permission + per-package trusted-publisher configuration on npmjs.com.

`NPM_CONFIG_PROVENANCE: true` is kept — the same OIDC token covers both auth and Sigstore provenance signing.

One-time configuration required on npmjs.com per package (Settings → Trusted Publishers → Add Publisher):

- Publisher: GitHub Actions, Organization: `williamzujkowski`, Repository: `nexus-agents`, Workflow filename: `release.yml`
- Package name: `nexus-agents`
- Repeat with Package name: `nexus-memory`

After both are configured, the `NPM_TOKEN` GitHub secret is no longer used and can be deleted (recommended after 1-2 successful OIDC releases). Same OIDC pattern as the nexus-eval-\* repos (#2524).

Side effect: resolves the granular-token-scope 403 on `nexus-memory` that was the root cause of #2814 — OIDC trusts per-package, no token-scope semantics.

---
'nexus-agents': patch
---

**ci(release):** Bump the publish-path Node version from 22 to 24 LTS so npm 11.x is available for OIDC trusted publishing. Node 22 LTS ships npm 10.9.x, which silently emits `E404 'not in this registry'` on OIDC-authenticated publishes — diagnosed during `nexus-eval-atbench` v0.1.0–0.1.3 attempts (#2524). The CI composite default stays at 22; only the two publish-path `setup-node` calls in `release.yml` (changesets/action step + manual-publish step) override to 24.

Unblocks OIDC publishes for `nexus-agents` and `nexus-memory` (the latter's bootstrap `0.1.0` was a local publish via the granular `NPM_TOKEN`; subsequent versions need OIDC because the token is being retired — see #2814).

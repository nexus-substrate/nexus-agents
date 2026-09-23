---
'nexus-agents': patch
---

Measure and alert on the post-publish tarball availability window on npm registry (#6525).

- Adds `scripts/await-published-tarball.ts` to poll the registry tarball URL (`https://registry.npmjs.org/nexus-agents/-/nexus-agents-<version>.tgz`) with bounded timeout and exponential/fixed interval, recording the measured availability window into `$GITHUB_STEP_SUMMARY` and failing with `::error::` if the tarball fails to appear before timeout.
- Wires the tarball verification step into the `release` and `manual-publish` jobs of `.github/workflows/release.yml`, adjusting job timeouts to 35m to accommodate up to 30m of CDN propagation delay.
- Documents the post-publish tarball measurement in `docs/ops/release-changeset-race.md`.

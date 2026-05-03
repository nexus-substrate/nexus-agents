---
'nexus-agents': patch
---

Replace the dead Rust-targeted SBOM flow with a Node-native CycloneDX SBOM (#2326 follow-up).

The release workflow's SBOM steps had been silently skipping every release since 2.29.1 because they were gated on `crates/iso-parser/Cargo.toml`, a path that has never existed in this repo (copy-paste from a Rust project). The same root cause was also dropping a `cargo-audit` and `cargo-deny` job from `ci.yml` on every PR run.

Changes:

- `.github/workflows/release.yml` now generates a CycloneDX 1.6 SBOM via `npx @cyclonedx/cdxgen@12.3.1` against `pnpm-lock.yaml`. The output (`sbom.cdx.json`) is uploaded to the GitHub Release and attested via `actions/attest-build-provenance`. SPDX is dropped — CycloneDX is the dominant format for the npm ecosystem.
- `.github/workflows/release.yml` Rust toolchain install + `cargo install cargo-sbom` removed (~45s saved per release).
- `.github/workflows/ci.yml` `cargo-audit` and `cargo-deny` jobs removed (~90s saved per CI run; both were no-ops).
- npm package provenance attestation (`NPM_CONFIG_PROVENANCE: true` + the `Attest npm package` step) is unchanged.

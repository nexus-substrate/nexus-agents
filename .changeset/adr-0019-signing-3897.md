---
'nexus-agents': patch
---

docs(adr): ADR-0019 governance-record signing — CI-commit-time Sigstore, design-of-record, build deferred (#3897)

Authors ADR-0019 capturing the 7/0 design decision on governance-record signing
(#3897 residual from the #3895 ratification): governance records are tamper-evident
(keyless SHA-256 content hash) but hand-committable, so the gate verifies presence,
not authenticity.

- **Decision — Architecture A:** CI-commit-time Sigstore/cosign keyless signing.
  Local production stays a content-hash; a GitHub Actions workflow with the repo's
  OIDC identity signs the committed record bytes via Sigstore/cosign (keyless,
  short-lived cert). The governor gate verifies the bundle against the expected
  workflow OIDC identity, signed-payload-bytes == committed-record-bytes (preserving
  the Option-C content binding), and Rekor transparency-log inclusion. Rejected B
  (interactive per-produce login — un-CI-testable) and C (hybrid — premature).
- **Attests provenance-through-CI, not human review** — stated plainly that it does
  not prove a human reviewed.
- **Honest single-operator caveat:** for a single local owner-operator, CI-identity
  signing is largely marginal over the existing content-hash + CODEOWNERS + branch
  protection; the real delta needs Rekor inclusion verification (external witness) and
  multi-party review.
- **Build deferred:** design now / build with the producer. Trigger = the deferred
  record producer (#3831/#3927) lands AND a multi-party-review threat model
  materializes; building before then signs fixtures with no end-to-end test path.
- Indexed in `docs/README.md`. Docs-only; no implementation.

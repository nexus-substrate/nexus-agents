---
'nexus-agents': minor
---

New MCP tool: `vendor_publishing_audit` — vendor signing-infra lookup (#2296, child of #2293).

Given a vendor identifier (`ubuntu`, `debian`, `fedora`), returns the vendor's published-artifact signing infrastructure: GPG key fingerprints, SHA256SUMS URL pattern, signature shape (clearsigned vs detached vs detached-on-iso), release cadence, key rotation notes, and the authoritative vendor doc citation. Static lookup against a curated seed dataset; the vendor doc URL is the single source of truth.

Use case: aegis-boot's image catalog needs to know HOW to verify each vendor's published images. v1 covers Ubuntu, Debian, Fedora — the seed shape allows additional vendors to land as data-only PRs.

Tool count: 35 → 36. Auto-sync via `inject-governance.ts` propagated to all 7 surfaces.

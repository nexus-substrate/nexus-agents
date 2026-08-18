---
'nexus-agents': patch
---

Resolve two HIGH advisories in transitive `brace-expansion` (GHSA-rgw5-rvv9-x895 and the CVE-2026-14257 mitigation bypass).

The repo already carried a `brace-expansion@>=4.0.0 <5.0.6` → `>=5.0.6` override from an earlier advisory, but the range no longer matched: the tree had resolved to 5.0.7, which is outside `<5.0.6` and therefore un-overridden. Both new advisories require `>=5.0.9`.

Widened to `brace-expansion@>=4.0.0 <5.0.9` → `>=5.0.9`. Reached transitively via `minimatch@10.2.5` from `markdownlint-cli` and `typedoc`. `pnpm audit` now reports no known vulnerabilities.

Worth noting the failure mode for future overrides: a version-bounded override key silently stops applying once the dependency moves past its upper bound. It does not warn — the advisory simply reappears.

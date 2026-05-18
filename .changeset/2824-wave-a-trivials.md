---
'nexus-agents': patch
---

**Addresses #2824 (Wave A).** fix: trustTier string coercion + race deadline try/catch + UUIDv4 variant nibble + SDK adapter output sanitizer + opencode TTL doc fix

Five P1/P2 hardening fixes from the 2026-05-16 code-reviewer audit, bundled because each is one-file-disjoint and surgical.

- **policy-engine.ts** — `trust-tier` rule now coerces string-typed trustTier (`'3'`, `'4'`) the same as numeric, restoring the "untrusted input cannot trigger execute stages" invariant for every real producer (issue-triage, pr-reviewer, secure-handler). Regression tests added.
- **race-against-deadline.ts** — wraps `onTimeout()` invocation in try/catch + reject so a throwing callback can't escape the `setTimeout` and crash the process. Regression tests added.
- **random-provider.ts (System)** — switched to `crypto.randomUUID()` for spec-compliant RFC 4122 v4. Existing test tightened to enforce the variant nibble.
- **random-provider.ts (Seeded)** — constrained the variant nibble to `8/9/a/b` while preserving determinism. Added 100-sample regression test.
- **sdk-adapter.ts** — applies `sanitizeOutput()` to upstream SDK error messages before logging + wrapping, achieving parity with the subprocess-adapter path. Prevents stray API keys / bearer tokens reaching logs.
- **opencode-adapter.ts** — corrected stale comment claim that `probeAvailableModels()` is 5-min cached; the cache is actually process-lifetime.

Audit bullet #19 (firewall-pipeline.ts docstring vs evaluatePolicy) was a false positive — the file contains zero `policy` references — and is being dropped from the epic.

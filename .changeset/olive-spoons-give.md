---
'nexus-agents': patch
---

fix(cli-adapters): honour a pinned gemini `cliModelName` instead of silently defaulting (#4395)

`toAgyModelSlug` matched agy slugs and canonical registry ids, but not
`cliModelName`s. A caller pinning `gemini-2.5-pro` — a real, documented registry
value — fell through to `DEFAULT_AGY_MODEL` and silently ran a **different model
than requested**, with no warning. The resolver now goes through
`findCanonicalModel` before defaulting.

Adds `fromAgyModelSlug`, derived from the forward map so the two directions cannot
drift, so a raw agy slug can be resolved back to a canonical (and therefore
priceable) registry id when one is encountered.

Scope note: the original issue also claimed `getModelInfo()` misreporting the
invoked model corrupted outcome telemetry. That was over-claimed — the reported id
is the registry's own `cliModelName`, which resolves to the correct entry at the
correct price. Reporting the agy slug instead would have _broken_ pricing, and
that half was reverted before merge.

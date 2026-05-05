---
'nexus-agents': patch
---

Tiers 2 + 3 of epic #2398 — enhance `ui-ux-design` skill with patterns from Apache-2.0-licensed [nexu-io/open-design](https://github.com/nexu-io/open-design):

**Tier 2 — Brand extraction protocol** (5 steps with explicit safety guards per security voter):

1. **Locate** — local repo asset preferred, user-pasted excerpt as fallback, external URL as last resort
2. **Safety guards (when fetching URL)** — non-negotiable per security review:
   - Explicit user confirmation (never auto-fetch)
   - HTTPS only (reject `http://`, `file://`, `ftp://`, protocol-relative)
   - Public-IP allowlist (reject RFC 1918 + link-local + CGNAT + IPv6 equivalents — full list inline)
   - Content-type allowlist (HTML/CSS/SVG/PNG/JPEG/WebP only)
   - 5 MB size cap, 30 s timeout
   - Treat fetched content as untrusted per `.rules/untrusted-input.md`
3. **Extract tokens** — concrete `grep -hoiE` patterns for hex codes, font families, spacing scale
4. **Codify in `brand-spec.md`** — path-traversal guard (cwd subtree only)
5. **Vocalize** — read tokens back to user in own words for confirmation before generating code

**Tier 3 — 9-section DESIGN.md schema** — portable design-system structure adopted from Open Design as the canonical brand-spec format. Sections: Visual theme / Color palette / Typography / Component stylings / Layout / Depth & elevation / Dos and don'ts / Responsive strategy / Agent prompt guide. Cross-tool portable (Open Design, Claude Design, future nexus-agents UI tooling).

**Tier 2.5 (bundled) — 8-dimension brief input format** — structured brief schema (palette / accent / typography / display / layout / mood / density / exclude) with default-resolution rules and "don't silently default" discipline.

License: Apache-2.0 attribution in section quotes. Pure-patch — additive only, no API change.

**Tier 4 (P0/P1/P2 standardization) skipped after audit** — severity language across skills is already domain-appropriate (`critical/high/medium/low` for security per CVSS, `P1/P2` for issue priority). No drift; no convergence needed.

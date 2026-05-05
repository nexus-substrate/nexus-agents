---
'nexus-agents': patch
---

Tier D3 of epic #2385 — final cross-pollination batch. Enhances 3 existing skills with patterns from addyosmani/agent-skills (MIT, © 2025 Addy Osmani):

**`requirements-gathering`** — adds Divergent → Convergent thinking (3-step ideation pass: diverge with sharpening questions + 2-3 variations, converge by clustering and stress-testing, sharpen-and-ship with explicit "Not Doing" list). Adds dependency-graph identification for multi-task plans (parallel-safe vs serial bottlenecks). Anti-rationalization table (5 rows: solution-not-problem, obvious-no-need-to-write, scope-as-we-go, "works"-criterion, ignore-dependencies).

**`implement-feature`** — adds Thin vertical slices methodology (Implement → Test → Verify → Commit → Next slice cycle), the 100-line rule (stop and reconsider before writing more than ~100 lines without testing), anti-rationalization table for incremental implementation (5 rows).

**`ui-ux-design`** — adds "Avoid the AI aesthetic" table calling out 8 common LLM-generated UI tells (gradient hero, lorem ipsum, oversized padding, stock card grids, shadow-heavy elevation, emoji icons, every-weight sans-serif, generic CTAs) with production-quality alternatives. Adds composition-over-configuration pattern with cross-link to api-and-interface-design. Anti-rationalization table (6 rows).

All edits purely additive — existing content unchanged. Pure-patch release. Completes Tier D of the epic.
